import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Loader } from 'lucide-react';

interface BottomBarProps {
  onSubmit: (text: string) => Promise<void>;
  accentRgb?: string;
}

type RecordState = 'idle' | 'recording' | 'transcribing' | 'ready';

export function BottomBar({ onSubmit, accentRgb = '80,200,240' }: BottomBarProps) {
  const [text, setText] = useState('');
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const clearError = useCallback(() => {
    setErrorMsg('');
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRecordState('transcribing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        try {
          const transcript = await transcribeAudio(blob);
          setText(transcript);
          setRecordState('ready');
        } catch (err) {
          console.error('Transcription failed:', err);
          setErrorMsg('Transcription failed. Type your thought instead.');
          setRecordState('idle');
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecordSeconds(0);
      setRecordState('recording');
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (err) {
      console.error('Mic access denied:', err);
      setErrorMsg('Microphone access denied.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleMicClick = useCallback(() => {
    if (recordState === 'recording') stopRecording();
    else if (recordState === 'idle' || recordState === 'ready') startRecording();
  }, [recordState, startRecording, stopRecording]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await onSubmit(trimmed);
      setText('');
      setRecordState('idle');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    } catch (err) {
      console.error('Submit failed:', err);
      setErrorMsg('Could not add neuron. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [text, isSubmitting, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }, []);

  const isActive = recordState === 'recording';
  const isLoading = recordState === 'transcribing' || isSubmitting;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[300] flex flex-col items-center pb-safe"
      style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
    >
      {errorMsg && (
        <div
          onClick={clearError}
          className="mb-2 px-4 py-2 rounded-full text-xs cursor-pointer"
          style={{
            background: 'rgba(255,80,80,0.12)',
            border: '1px solid rgba(255,80,80,0.25)',
            color: 'rgba(255,120,120,0.9)',
            letterSpacing: '0.05em',
          }}
        >
          {errorMsg}
        </div>
      )}

      <div
        className="flex items-center gap-3 px-4"
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'rgba(4,6,12,0.88)',
          backdropFilter: 'blur(20px)',
          borderTop: `1px solid rgba(${accentRgb},0.1)`,
          borderLeft: `1px solid rgba(${accentRgb},0.06)`,
          borderRight: `1px solid rgba(${accentRgb},0.06)`,
          borderRadius: '20px 20px 0 0',
          padding: '12px 16px',
          boxShadow: `0 -8px 40px rgba(0,0,0,0.6), 0 -2px 20px rgba(${accentRgb},0.04)`,
        }}
      >
        <button
          onClick={handleMicClick}
          disabled={isLoading}
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200"
          style={{
            width: 44,
            height: 44,
            background: isActive
              ? 'rgba(255,60,60,0.2)'
              : `rgba(${accentRgb},0.08)`,
            border: isActive
              ? '1px solid rgba(255,80,80,0.5)'
              : `1px solid rgba(${accentRgb},0.2)`,
            color: isActive ? 'rgba(255,100,100,1)' : `rgba(${accentRgb},0.7)`,
            boxShadow: isActive ? '0 0 20px rgba(255,60,60,0.4), 0 0 40px rgba(255,60,60,0.15)' : 'none',
            animation: isActive ? 'micPulse 1.5s ease-in-out infinite' : 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          {isActive ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {isActive && (
          <span
            className="flex-shrink-0 text-xs font-mono"
            style={{ color: 'rgba(255,100,100,0.8)', minWidth: 28 }}
          >
            {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:{String(recordSeconds % 60).padStart(2, '0')}
          </span>
        )}

        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          onChange={e => {
            setText(e.target.value);
            if (recordState === 'ready') setRecordState('idle');
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            recordState === 'transcribing'
              ? 'Transcribing...'
              : recordState === 'recording'
              ? 'Recording...'
              : 'Add a thought to the map...'
          }
          disabled={isLoading || isActive}
          className="flex-1 bg-transparent outline-none text-sm resize-none"
          style={{
            color: 'rgba(255,255,255,0.85)',
            caretColor: `rgba(${accentRgb},1)`,
            fontSize: 13,
            lineHeight: 1.5,
            opacity: (isLoading || isActive) ? 0.5 : 1,
            minHeight: '20px',
            maxHeight: '200px',
            overflowY: 'auto',
            paddingTop: 2,
            paddingBottom: 2,
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={!text.trim() || isSubmitting}
          className="flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-200"
          style={{
            width: 36,
            height: 36,
            background: text.trim() && !isSubmitting
              ? `rgba(${accentRgb},0.18)`
              : 'rgba(255,255,255,0.04)',
            border: text.trim() && !isSubmitting
              ? `1px solid rgba(${accentRgb},0.4)`
              : '1px solid rgba(255,255,255,0.08)',
            color: text.trim() && !isSubmitting
              ? `rgba(${accentRgb},1)`
              : 'rgba(255,255,255,0.2)',
            cursor: !text.trim() || isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          {isSubmitting
            ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
            : <Send size={14} />
          }
        </button>
      </div>

      <style>{`
        @keyframes micPulse {
          0%,100% { box-shadow: 0 0 20px rgba(255,60,60,0.4), 0 0 40px rgba(255,60,60,0.15); }
          50%      { box-shadow: 0 0 30px rgba(255,60,60,0.7), 0 0 60px rgba(255,60,60,0.3); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

async function transcribeAudio(blob: Blob): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  const audioBase64 = btoa(binary);
  const mimeType = blob.type || 'audio/webm';

  const res = await fetch(`${supabaseUrl}/functions/v1/neura-process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ action: 'transcribe', audioBase64, mimeType }),
  });
  if (!res.ok) throw new Error(`Transcription edge function error: ${res.status}`);
  const json = await res.json();
  return json.text || '';
}
