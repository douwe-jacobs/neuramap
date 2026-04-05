import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://neuramap.io",
  "https://www.neuramap.io",
  "http://localhost:5173",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

async function getSystemPrompt(): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client = createClient(supabaseUrl, serviceRoleKey);

  const { data } = await client
    .from("neura_config")
    .select("value")
    .eq("id", "neura_system_prompt")
    .maybeSingle();

  return data?.value || "";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "transcribe") {
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        return new Response(
          JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { audioBase64, mimeType } = body;
      if (!audioBase64) {
        return new Response(
          JSON.stringify({ error: "audioBase64 required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const binaryStr = atob(audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const ext = (mimeType || "audio/webm").includes("mp4") ? "mp4"
        : (mimeType || "audio/webm").includes("ogg") ? "ogg"
        : (mimeType || "audio/webm").includes("wav") ? "wav"
        : "webm";

      const formData = new FormData();
      formData.append("file", new Blob([bytes], { type: mimeType || "audio/webm" }), `audio.${ext}`);
      formData.append("model", "whisper-1");
      formData.append("response_format", "text");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${openaiKey}` },
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Whisper transcribe error ${res.status}: ${errBody}`);
      }

      const text = (await res.text()).trim();

      return new Response(
        JSON.stringify({ text }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "detect-intent") {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { userText, existingLabels, mapLabel, activeNodeLabel } = body;
      if (!userText) {
        return new Response(
          JSON.stringify({ error: "userText required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const labelsStr = (existingLabels || []).join(", ");

      const intentPrompt = `The user is managing a mind map called "${mapLabel || "My Map"}".
Existing neurons: ${labelsStr || "none"}
Currently active/selected neuron: "${activeNodeLabel || "none"}"
The user said: "${userText}"

Determine the user's intent. Respond with ONLY valid JSON (no markdown):
{
  "intent": "add" | "delete" | "explore",
  "targetLabel": "exact label from existing neurons if intent is delete, otherwise empty string"
}

Rules:
- intent "explore": user wants to explore, map out, or visualize a broad topic, subject, book, movie, concept, person, place, or domain. Examples: "maak een neuramap van Lord of the Rings", "verken het thema klimaatverandering", "map out the solar system", "geef me een overzicht van WW2". This applies whenever the user asks to explore/map/visualize a rich subject that warrants many interconnected nodes (20-30+).
- intent "delete": user wants to remove/delete/verwijder/weg/weghalen an existing neuron. targetLabel must match one of the existing neurons exactly (case-insensitive best match).
- intent "add": user wants to add a single new idea, thought, or fact.
- When detecting delete intent, match the most similar existing label even if phrasing differs slightly.`;

      const intentRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 100,
          messages: [{ role: "user", content: intentPrompt }],
        }),
      });

      if (!intentRes.ok) {
        const errBody = await intentRes.text();
        throw new Error(`Claude intent error ${intentRes.status}: ${errBody}`);
      }

      const intentResult = await intentRes.json();
      const intentRaw = intentResult.content?.[0]?.text || "{}";

      let intentParsed: { intent?: string; targetLabel?: string } = {};
      try {
        intentParsed = JSON.parse(intentRaw.trim());
      } catch {
        const match = intentRaw.match(/\{[\s\S]*\}/);
        if (match) {
          try { intentParsed = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }

      return new Response(
        JSON.stringify({
          intent: intentParsed.intent || "add",
          targetLabel: intentParsed.targetLabel || "",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "explore-topic") {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { userText, mapLabel, coreLabel } = body;
      if (!userText) {
        return new Response(
          JSON.stringify({ error: "userText required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const exploreSystemPrompt = `You are a knowledge mapping assistant that builds rich, deeply interconnected mind maps called "neuramaps".

Your task is to generate a comprehensive tree of neurons for a given topic. You must produce a full, multi-layered exploration with 25-30 neurons organized into meaningful thematic branches.

## Output Format
Respond with ONLY valid JSON, no markdown, no explanation:
{
  "neurons": [
    {
      "label": "SHORT LABEL",
      "parentLabel": "exact label of parent neuron, or empty string if this connects to the core",
      "insight": "one sentence explaining what this node represents and how it connects to its parent",
      "body": "2-3 sentences describing this concept in depth"
    }
  ]
}

## Structure Rules
- Generate exactly 25-30 neurons total
- Create 4-6 top-level branch nodes that connect directly to the core (parentLabel = "")
- Each branch should have 4-6 child nodes beneath it
- Some child nodes can have their own children (grandchildren) for deeper topics
- The tree should feel organic, not mechanical — vary the depth

## Label Rules
- Maximum 3 words, ALL CAPS
- Be specific and evocative (e.g. "ONE RING" not "RING", "MOUNT DOOM" not "VOLCANO")
- Labels must be unique across all neurons

## Branch Ideas (choose what fits best for the topic)
- For fiction: Characters, Locations, Themes, Events, Factions, Artifacts, Lore
- For science: Concepts, Mechanisms, Applications, History, Key Figures, Controversies
- For history: Causes, Key Figures, Battles/Events, Consequences, Legacy, Geography
- For people: Early Life, Career, Philosophy, Relationships, Legacy, Works
- Adapt branches to the topic — do not use generic branches when specific ones fit better

## Quality Rules
- Every neuron must be genuinely informative and relevant
- No filler or generic nodes ("MISC", "OTHER", "GENERAL")
- Prefer depth over breadth — go into details that matter
- Body text should feel like interesting knowledge, not a dictionary definition`;

      const exploreUserPrompt = `Map name: "${mapLabel || "My Map"}"
Core neuron (root of map): "${coreLabel || userText}"
User request: "${userText}"

Generate a rich, comprehensive neuramap with 25-30 interconnected neurons exploring this topic in depth. Build meaningful thematic branches and go deep into the subject.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 8000,
          system: exploreSystemPrompt,
          messages: [{ role: "user", content: exploreUserPrompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Claude explore error ${res.status}: ${errBody}`);
      }

      const result = await res.json();
      const rawContent = result.content?.[0]?.text || "{}";

      type NeuronDef = { label?: string; parentLabel?: string; insight?: string; body?: string };
      let parsed: { neurons?: NeuronDef[] } = {};
      try {
        parsed = JSON.parse(rawContent.trim());
      } catch {
        const match = rawContent.match(/\{[\s\S]*\}/s);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }

      const neurons = (parsed.neurons || []).slice(0, 30).map(n => ({
        label: (n.label || "NEW THOUGHT").toUpperCase(),
        parentLabel: n.parentLabel || "",
        insight: n.insight || "",
        body: n.body || "",
      }));

      return new Response(
        JSON.stringify({ intent: "explore", neurons }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "generate-neuron") {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { userText, existingLabels, mapLabel, activeNodeLabel } = body;
      if (!userText) {
        return new Response(
          JSON.stringify({ error: "userText required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const systemPrompt = await getSystemPrompt();
      const labelsStr = (existingLabels || []).join(", ");

      const userPrompt = `Map name: "${mapLabel || "My Map"}"
Existing neurons: ${labelsStr || "none yet"}
Currently active/selected neuron: "${activeNodeLabel || "none"}" — use this as the default parent unless the user explicitly mentions a different node.
User said: "${userText}"`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-opus-4-5",
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Claude generate error ${res.status}: ${errBody}`);
      }

      const result = await res.json();
      const rawContent = result.content?.[0]?.text || "{}";

      type NeuronDef = { label?: string; relatedTo?: string; parentLabel?: string; insight?: string; body?: string };
      let parsed: { neurons?: NeuronDef[] } | NeuronDef = {};
      try {
        parsed = JSON.parse(rawContent.trim());
      } catch {
        const match = rawContent.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
        }
      }

      let neurons: NeuronDef[];
      if ("neurons" in parsed && Array.isArray((parsed as { neurons?: NeuronDef[] }).neurons)) {
        neurons = (parsed as { neurons: NeuronDef[] }).neurons;
      } else {
        const single = parsed as NeuronDef;
        neurons = [{ label: single.label, relatedTo: single.relatedTo, parentLabel: "", insight: single.insight, body: single.body }];
      }

      neurons = neurons.slice(0, 5).map(n => ({
        label: (n.label || "NEW THOUGHT").toUpperCase(),
        relatedTo: n.relatedTo || "",
        parentLabel: n.parentLabel || "",
        insight: n.insight || "",
        body: n.body || userText,
      }));

      return new Response(
        JSON.stringify({ intent: "add", neurons }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("neura-process error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
