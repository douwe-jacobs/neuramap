import React, { useRef, useEffect, useState } from 'react';

interface AddNodeModalProps {
  onConfirm: (label: string, insight: string) => void;
  onCancel: () => void;
}

export function AddNodeModal({ onConfirm, onCancel }: AddNodeModalProps) {
  const [label, setLabel] = useState('');
  const [insight, setInsight] = useState('');
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Delay focus so it fires after pointer-up events that opened the modal
    const t = setTimeout(() => labelRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onConfirm(trimmed, insight.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          background: 'rgba(14,14,20,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18,
          padding: '28px 24px 20px',
          width: 'min(360px, 90vw)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
          animation: 'modalEnter 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
          <div style={{ marginBottom: 20 }}>
            <input
              ref={labelRef}
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Neuron name..."
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.9)',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <textarea
              value={insight}
              onChange={e => setInsight(e.target.value)}
              placeholder="Add a note or insight..."
              rows={4}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.8)',
                outline: 'none',
                resize: 'none',
                lineHeight: 1.6,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s ease',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.3)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
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
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!label.trim()}
              style={{
                flex: 2,
                padding: '11px 0',
                borderRadius: 10,
                border: 'none',
                background: label.trim() ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.12)',
                color: label.trim() ? 'rgba(0,0,0,0.88)' : 'rgba(255,255,255,0.25)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                cursor: label.trim() ? 'pointer' : 'default',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
