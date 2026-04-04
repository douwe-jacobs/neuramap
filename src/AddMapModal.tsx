import React, { useRef, useEffect, useState } from 'react';

interface AddMapModalProps {
  onConfirm: (label: string, insight: string) => Promise<void>;
  onCancel: () => void;
}

export function AddMapModal({ onConfirm, onCancel }: AddMapModalProps) {
  const [label, setLabel] = useState('');
  const [insight, setInsight] = useState('');
  const [saving, setSaving] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onConfirm(trimmed, insight.trim());
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  const TEAL = '80,220,200';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: 'rgba(8,10,18,0.98)',
          border: `1px solid rgba(${TEAL},0.22)`,
          borderRadius: 20,
          padding: '28px 24px 22px',
          width: 'min(380px, 90vw)',
          boxShadow: `0 20px 60px rgba(0,0,0,0.85), 0 0 60px rgba(${TEAL},0.06)`,
          animation: 'modalEnter 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p style={{
          fontSize: 10,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          fontWeight: 900,
          color: `rgba(${TEAL},0.9)`,
          marginBottom: 22,
        }}>
          Nieuwe map
        </p>
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div style={{ marginBottom: 18 }}>
            <input
              ref={labelRef}
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Naam van de map..."
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid rgba(${TEAL},0.18)`,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.9)',
                outline: 'none',
                boxSizing: 'border-box',
                caretColor: `rgba(${TEAL},1)`,
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.target.style.borderColor = `rgba(${TEAL},0.55)`; }}
              onBlur={e => { e.target.style.borderColor = `rgba(${TEAL},0.18)`; }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <textarea
              value={insight}
              onChange={e => setInsight(e.target.value)}
              placeholder="Voeg een notitie of inzicht toe..."
              rows={4}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid rgba(${TEAL},0.18)`,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.8)',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.6,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                caretColor: `rgba(${TEAL},1)`,
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.target.style.borderColor = `rgba(${TEAL},0.55)`; }}
              onBlur={e => { e.target.style.borderColor = `rgba(${TEAL},0.18)`; }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '11px 0',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={!label.trim() || saving}
              style={{
                flex: 2,
                padding: '11px 0',
                borderRadius: 10,
                border: 'none',
                background: label.trim() ? `rgba(${TEAL},0.9)` : 'rgba(255,255,255,0.08)',
                color: label.trim() ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.2)',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: label.trim() ? 'pointer' : 'default',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {saving ? '...' : 'Aanmaken'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
