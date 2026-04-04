import React from 'react';

const FONT_SIZE_MAP: Record<string, string> = {
  xs: '11px',
  sm: '13px',
  lg: '17px',
  xl: '22px',
};

export function renderRichText(body: string, nodeColor: string): React.ReactNode {
  const lines = body.split('\n');
  const output: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const bulletMatch = line.match(/^(\s*)-\s(.*)$/);
    const numberedMatch = line.match(/^(\s*)\d+\.\s(.*)$/);

    if (bulletMatch) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^(\s*)-\s/)) {
        const m = lines[i].match(/^(\s*)-\s(.*)$/)!;
        items.push(
          <li key={i} style={{ paddingLeft: m[1].length * 8 }}>
            {parseInlineWithSize(m[2], nodeColor)}
          </li>
        );
        i++;
      }
      output.push(
        <ul key={`ul-${i}`} style={{ listStyleType: 'disc', paddingLeft: 18, margin: '4px 0' }}>
          {items}
        </ul>
      );
      continue;
    }

    if (numberedMatch) {
      const items: React.ReactNode[] = [];
      let counter = 1;
      while (i < lines.length && lines[i].match(/^(\s*)\d+\.\s/)) {
        const m = lines[i].match(/^(\s*)\d+\.\s(.*)$/)!;
        items.push(
          <li key={i} value={counter} style={{ paddingLeft: m[1].length * 8 }}>
            {parseInlineWithSize(m[2], nodeColor)}
          </li>
        );
        i++;
        counter++;
      }
      output.push(
        <ol key={`ol-${i}`} style={{ listStyleType: 'decimal', paddingLeft: 18, margin: '4px 0' }}>
          {items}
        </ol>
      );
      continue;
    }

    output.push(
      <React.Fragment key={i}>
        {parseInlineWithSize(line, nodeColor)}
        {i < lines.length - 1 && <br />}
      </React.Fragment>
    );
    i++;
  }

  return output;
}

function parseInlineWithSize(text: string, nodeColor: string): React.ReactNode[] {
  const sizeRe = /\{(xs|sm|lg|xl)\}([\s\S]*?)\{\/(xs|sm|lg|xl)\}/g;
  const tokens: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = sizeRe.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push(...parseInline(text.slice(last, match.index), nodeColor));
    }
    const size = match[1];
    const inner = match[2];
    tokens.push(
      <span key={match.index} style={{ fontSize: FONT_SIZE_MAP[size] ?? undefined }}>
        {parseInline(inner, nodeColor)}
      </span>
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    tokens.push(...parseInline(text.slice(last), nodeColor));
  }

  return tokens;
}

function parseInline(text: string, nodeColor: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push(text.slice(last, match.index));
    }
    if (match[2] !== undefined) {
      tokens.push(<strong key={match.index}><em>{match[2]}</em></strong>);
    } else if (match[3] !== undefined) {
      tokens.push(<strong key={match.index}>{match[3]}</strong>);
    } else if (match[4] !== undefined) {
      tokens.push(<em key={match.index}>{match[4]}</em>);
    } else if (match[5] !== undefined) {
      tokens.push(<u key={match.index}>{match[5]}</u>);
    } else if (match[6] !== undefined) {
      tokens.push(<em key={match.index}>{match[6]}</em>);
    } else if (match[7] !== undefined && match[8] !== undefined) {
      tokens.push(
        <a
          key={match.index}
          href={match[8]}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: `rgba(${nodeColor},0.9)`, textDecoration: 'underline', cursor: 'pointer' }}
        >
          {match[7]}
        </a>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    tokens.push(text.slice(last));
  }

  return tokens;
}
