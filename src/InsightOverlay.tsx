import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Pencil, X, Check, Upload, FileText, Trash2, Image, ZoomIn, ChevronLeft, ChevronRight, Bold, Italic, Underline, Link, List, ListOrdered, Type } from 'lucide-react';
import type { Neuron, NeuronContent, NeuronAttachment } from './types';
import { supabase } from './supabase';
import { renderRichText } from './RichText';

interface LightboxViewerProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function LightboxViewer({ images, initialIndex, onClose }: LightboxViewerProps) {
  const [idx, setIdx] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);
  const wheelAccum = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prev = useCallback(() => setIdx(i => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIdx(i => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prev, next, onClose]);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSwipe = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (images.length <= 1) return;
      const now = Date.now();
      if (now - lastSwipe.current < 400) return;
      const ax = Math.abs(e.deltaX);
      const ay = Math.abs(e.deltaY);
      if (ax < 5 && ay < 5) return;
      if (ay > ax * 1.5) return;
      if (ax < 10) return;
      lastSwipe.current = now;
      if (e.deltaX > 0) next();
      else prev();
    };
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', handleWheel, { capture: true });
  }, [images.length, next, prev]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -50) next();
    else if (delta > 50) prev();
    touchStartX.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      ref={containerRef}
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ background: 'rgba(0,0,0,0.93)' }}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 flex items-center justify-center w-10 h-10 rounded-full z-10"
        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)' }}
      >
        <X size={18} />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full z-10"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.8)' }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full z-10"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.8)' }}
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i); }}
                style={{
                  width: i === idx ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i === idx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                  transition: 'all 0.2s ease',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </>
      )}

      <img
        src={images[idx]}
        alt=""
        style={{
          maxWidth: '92vw',
          maxHeight: '88vh',
          objectFit: 'contain',
          borderRadius: 12,
          boxShadow: '0 0 80px rgba(0,0,0,0.8)',
          transition: 'opacity 0.15s ease',
        }}
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

interface InsightOverlayProps {
  node: Neuron;
  clusterId: string;
  nodeColor: string;
  visible: boolean;
  onClose: () => void;
  onSave: (label: string, content: NeuronContent) => Promise<void>;
}

export function InsightOverlay({ node, clusterId, nodeColor, visible, onClose, onSave }: InsightOverlayProps) {
  const [editMode, setEditMode] = useState(!node.content);
  const [editLabel, setEditLabel] = useState(node.label);
  const [editBody, setEditBody] = useState(node.content?.body ?? '');
  const [editAttachments, setEditAttachments] = useState<NeuronAttachment[]>(node.content?.attachments ?? []);
  const [editImage, setEditImage] = useState<string | undefined>(node.content?.image);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showFontSize, setShowFontSize] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editBody]);

  const wrapSelection = useCallback((before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editBody.slice(start, end);
    const newBody = editBody.slice(0, start) + before + selected + after + editBody.slice(end);
    setEditBody(newBody);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  }, [editBody]);

  const insertLink = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editBody.slice(start, end);
    const text = linkText || selected || 'link';
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
    const insertion = `[${text}](${url})`;
    const newBody = editBody.slice(0, start) + insertion + editBody.slice(end);
    setEditBody(newBody);
    setShowLinkInput(false);
    setLinkUrl('');
    setLinkText('');
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    });
  }, [editBody, linkUrl, linkText]);

  const insertList = useCallback((ordered: boolean) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editBody.slice(start, end);
    const lines = selected ? selected.split('\n') : [''];
    const prefixed = lines.map((line, i) => `${ordered ? `${i + 1}.` : '-'} ${line}`).join('\n');
    const before = editBody.slice(0, start);
    const lineStart = before.lastIndexOf('\n') + 1;
    const newBody = editBody.slice(0, lineStart) + prefixed + (selected ? '' : '') + editBody.slice(end);
    const replacement = editBody.slice(0, start) + prefixed + editBody.slice(end);
    setEditBody(replacement);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + (ordered ? 3 : 2), start + (ordered ? 3 : 2) + (selected ? prefixed.length - (ordered ? 3 : 2) : 0));
    });
  }, [editBody]);

  const insertFontSize = useCallback((size: string) => {
    wrapSelection(`{${size}}`, `{/${size}}`);
    setShowFontSize(false);
  }, [wrapSelection]);

  const content = node.content;

  const handleEnterEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLabel(node.label);
    setEditBody(node.content?.body ?? '');
    setEditAttachments(node.content?.attachments ?? []);
    setEditImage(node.content?.image);
    setEditMode(true);
  }, [node.label, node.content]);

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!node.content) { onClose(); return; }
    setEditMode(false);
  }, [node.content, onClose]);

  const handleSave = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const newContent: NeuronContent = {
      body: editBody || undefined,
      image: editImage || undefined,
      attachments: editAttachments.length > 0 ? editAttachments : undefined,
    };
    await onSave(editLabel, newContent);
    setEditMode(false);
  }, [editLabel, editBody, editImage, editAttachments, onSave]);

  const uploadFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? (isImage ? 'jpg' : 'pdf');
      const path = `${clusterId}/${node.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('neura-attachments').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('neura-attachments').getPublicUrl(path);
      const url = urlData.publicUrl;

      if (isImage && !editImage) {
        setEditImage(url);
      } else {
        const attachment: NeuronAttachment = { type: isImage ? 'image' : 'pdf', url, name: file.name };
        setEditAttachments(prev => [...prev, attachment]);
      }
    } finally {
      setUploading(false);
    }
  }, [clusterId, node.id, editImage]);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) await uploadFile(f);
    e.target.value = '';
  }, [uploadFile]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) await uploadFile(f);
  }, [uploadFile]);

  const removeAttachment = useCallback((idx: number) => {
    setEditAttachments(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const removeImage = useCallback(() => {
    setEditImage(undefined);
  }, []);

  const viewImages = editMode
    ? [
        ...(editImage ? [{ url: editImage, isMain: true }] : []),
        ...editAttachments.filter(a => a.type === 'image').map(a => ({ url: a.url, isMain: false, name: a.name })),
      ]
    : [
        ...(content?.image ? [{ url: content.image, isMain: true }] : []),
        ...(content?.attachments ?? []).filter(a => a.type === 'image').map(a => ({ url: a.url, isMain: false, name: a.name })),
      ];

  const pdfAttachments = editMode
    ? editAttachments.filter(a => a.type === 'pdf')
    : (content?.attachments ?? []).filter(a => a.type === 'pdf');

  return (
    <>
      <style>{`
        @keyframes nucleusPulse {
          0%, 100% { opacity: 0.18; transform: scale(1); }
          50% { opacity: 0.32; transform: scale(1.04); }
        }
        @keyframes nucleusPulse2 {
          0%, 100% { opacity: 0.08; transform: scale(1); }
          50% { opacity: 0.16; transform: scale(1.08); }
        }
        @keyframes nucleusGlowTitle {
          0%, 100% { text-shadow-opacity: 0.6; filter: brightness(1); }
          50% { filter: brightness(1.18); }
        }
        @keyframes nucleusBorderPulse {
          0%, 100% { opacity: 0.22; }
          50% { opacity: 0.42; }
        }
        @keyframes uploadBreath {
          0%, 100% { border-color: rgba(var(--nc), 0.18); }
          50% { border-color: rgba(var(--nc), 0.38); }
        }
        @keyframes dispersalRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      <div
        className="fixed inset-0 z-[400] flex items-center justify-center"
        onClick={editMode ? undefined : onClose}
        style={{
          opacity: visible ? 1 : 0,
          background: `radial-gradient(ellipse 90% 80% at 50% 50%, rgba(${nodeColor},0.07) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.82) 100%)`,
          transition: 'opacity 0.3s ease',
          pointerEvents: visible ? 'all' : 'none',
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(${nodeColor},0.13) 0%, transparent 65%)`,
          animation: 'nucleusPulse 5s ease-in-out infinite',
        }} />
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 110% 100% at 50% 50%, rgba(${nodeColor},0.05) 0%, transparent 60%)`,
          animation: 'nucleusPulse2 7s ease-in-out infinite',
        }} />

        <div
          className="relative flex flex-col"
          onClick={e => e.stopPropagation()}
          style={{
            width: 'min(calc(100vw - 40px), clamp(320px, 60vw, 810px))',
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(24px)',
            opacity: visible ? 1 : 0,
            transition: visible
              ? 'transform 0.44s cubic-bezier(0.34,1.4,0.64,1), opacity 0.3s ease'
              : 'transform 0.38s cubic-bezier(0.4,0,1,0.8), opacity 0.22s ease',
            maxHeight: '88vh',
            overflowY: 'auto',
            borderRadius: 22,
            backdropFilter: 'blur(28px) saturate(1.3)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.3)',
            background: `
              radial-gradient(ellipse 100% 60% at 50% 0%, rgba(${nodeColor},0.11) 0%, transparent 55%),
              radial-gradient(ellipse 80% 80% at 50% 100%, rgba(${nodeColor},0.06) 0%, transparent 60%),
              linear-gradient(170deg, rgba(12,14,22,0.72) 0%, rgba(5,6,14,0.78) 50%, rgba(8,10,18,0.74) 100%)
            `,
            border: `1px solid rgba(${nodeColor},0.28)`,
            boxShadow: `
              0 0 0 1px rgba(${nodeColor},0.06),
              0 0 60px rgba(${nodeColor},0.18),
              0 0 120px rgba(${nodeColor},0.08),
              0 40px 100px rgba(0,0,0,0.85),
              inset 0 1px 0 rgba(${nodeColor},0.18),
              inset 0 -1px 0 rgba(${nodeColor},0.06)
            `,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none rounded-[22px] overflow-hidden"
            style={{ zIndex: 0 }}
          >
            <div style={{
              position: 'absolute',
              inset: 0,
              background: `
                radial-gradient(circle at 20% 15%, rgba(${nodeColor},0.06) 0%, transparent 40%),
                radial-gradient(circle at 80% 85%, rgba(${nodeColor},0.04) 0%, transparent 35%)
              `,
              animation: 'nucleusPulse 6s ease-in-out infinite',
            }} />
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
              opacity: 0.028,
              mixBlendMode: 'overlay',
            }} />
          </div>

          <div
            className="flex items-center justify-between px-4 pt-6 pb-4 sm:px-10 sm:pt-8 sm:pb-6 flex-shrink-0 sticky top-0"
            style={{
              borderBottom: `1px solid rgba(${nodeColor},0.16)`,
              boxShadow: `0 1px 0 rgba(${nodeColor},0.06), 0 8px 24px rgba(${nodeColor},0.04)`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              zIndex: 1,
            }}
          >
            {editMode ? (
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                className="flex-1 min-w-0 mr-3 bg-transparent outline-none uppercase font-black text-[12px]"
                style={{
                  letterSpacing: '0.35em',
                  color: `rgba(${nodeColor},1)`,
                  textShadow: `0 0 20px rgba(${nodeColor},0.8), 0 0 60px rgba(${nodeColor},0.3)`,
                  border: 'none',
                  caretColor: `rgba(${nodeColor},1)`,
                  fontFamily: 'inherit',
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <p
                className="uppercase font-black text-[12px] flex-1 min-w-0 mr-3 truncate"
                style={{
                  letterSpacing: '0.35em',
                  color: `rgba(${nodeColor},1)`,
                  textShadow: `0 0 20px rgba(${nodeColor},0.9), 0 0 60px rgba(${nodeColor},0.4), 0 0 120px rgba(${nodeColor},0.15)`,
                  animation: 'nucleusGlowTitle 4s ease-in-out infinite',
                }}
              >
                {node.label}
              </p>
            )}
            <div className="flex gap-2 flex-shrink-0" style={{ zIndex: 1 }}>
              {editMode ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest"
                    style={{
                      color: 'rgba(255,255,255,0.4)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; }}
                  >
                    <X size={11} /> <span className="hidden sm:inline">Cancel</span>
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest"
                    style={{
                      color: `rgba(${nodeColor},1)`,
                      background: `rgba(${nodeColor},0.12)`,
                      border: `1px solid rgba(${nodeColor},0.3)`,
                      boxShadow: `0 0 12px rgba(${nodeColor},0.15)`,
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.2)`; e.currentTarget.style.boxShadow = `0 0 20px rgba(${nodeColor},0.3)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.12)`; e.currentTarget.style.boxShadow = `0 0 12px rgba(${nodeColor},0.15)`; }}
                  >
                    <Check size={11} /> <span className="hidden sm:inline">Save</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleEnterEdit}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest"
                    style={{
                      color: `rgba(${nodeColor},0.9)`,
                      background: `rgba(${nodeColor},0.08)`,
                      border: `1px solid rgba(${nodeColor},0.22)`,
                      boxShadow: `0 0 10px rgba(${nodeColor},0.1)`,
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.16)`; e.currentTarget.style.boxShadow = `0 0 18px rgba(${nodeColor},0.25)`; e.currentTarget.style.borderColor = `rgba(${nodeColor},0.4)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.08)`; e.currentTarget.style.boxShadow = `0 0 10px rgba(${nodeColor},0.1)`; e.currentTarget.style.borderColor = `rgba(${nodeColor},0.22)`; }}
                  >
                    <Pencil size={11} /> <span className="hidden sm:inline">Edit</span>
                  </button>
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-8 h-8 rounded-lg"
                    style={{
                      color: 'rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="px-4 py-6 sm:px-10 sm:py-8 relative" style={{ zIndex: 1 }}>
            {editMode ? (
              <div className="flex flex-col gap-4">
                <div
                  className="flex flex-col rounded-xl overflow-hidden"
                  style={{
                    border: `1px solid rgba(${nodeColor},0.2)`,
                    background: `linear-gradient(170deg, rgba(${nodeColor},0.04) 0%, rgba(255,255,255,0.03) 100%)`,
                    boxShadow: `inset 0 1px 0 rgba(${nodeColor},0.1), 0 0 20px rgba(${nodeColor},0.04)`,
                  }}
                >
                  <div
                    className="flex items-center gap-1 px-2 py-1.5 flex-wrap"
                    style={{
                      borderBottom: `1px solid rgba(${nodeColor},0.12)`,
                      background: `rgba(${nodeColor},0.04)`,
                    }}
                  >
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); wrapSelection('**', '**'); }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                      title="Bold (**text**)"
                    >
                      <Bold size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); wrapSelection('*', '*'); }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                      title="Italic (*text*)"
                    >
                      <Italic size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); wrapSelection('__', '__'); }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                      title="Underline (__text__)"
                    >
                      <Underline size={13} />
                    </button>
                    <div style={{ width: 1, height: 16, background: `rgba(${nodeColor},0.18)`, margin: '0 2px' }} />
                    <button
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        const el = textareaRef.current;
                        if (el) {
                          const selected = editBody.slice(el.selectionStart, el.selectionEnd);
                          if (selected) setLinkText(selected);
                        }
                        setShowLinkInput(v => !v);
                        setShowFontSize(false);
                      }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: showLinkInput ? `rgba(${nodeColor},0.9)` : 'rgba(255,255,255,0.5)', background: showLinkInput ? `rgba(${nodeColor},0.14)` : 'transparent' }}
                      onMouseEnter={e => { if (!showLinkInput) { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; } }}
                      onMouseLeave={e => { if (!showLinkInput) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; } }}
                      title="Link ([tekst](url))"
                    >
                      <Link size={13} />
                    </button>
                    <div style={{ width: 1, height: 16, background: `rgba(${nodeColor},0.18)`, margin: '0 2px' }} />
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); insertList(false); }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                      title="Bullets (- item)"
                    >
                      <List size={13} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); insertList(true); }}
                      className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                      style={{ color: 'rgba(255,255,255,0.5)', background: 'transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                      title="Genummerde lijst (1. item)"
                    >
                      <ListOrdered size={13} />
                    </button>
                    <div style={{ width: 1, height: 16, background: `rgba(${nodeColor},0.18)`, margin: '0 2px' }} />
                    <div className="relative">
                      <button
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setShowFontSize(v => !v); setShowLinkInput(false); }}
                        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                        style={{ color: showFontSize ? `rgba(${nodeColor},0.9)` : 'rgba(255,255,255,0.5)', background: showFontSize ? `rgba(${nodeColor},0.14)` : 'transparent' }}
                        onMouseEnter={e => { if (!showFontSize) { e.currentTarget.style.background = `rgba(${nodeColor},0.14)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; } }}
                        onMouseLeave={e => { if (!showFontSize) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; } }}
                        title="Lettergrootte"
                      >
                        <Type size={13} />
                      </button>
                      {showFontSize && (
                        <div
                          className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-50 flex flex-col"
                          style={{
                            background: `linear-gradient(160deg, rgba(10,12,22,0.99) 0%, rgba(6,8,16,0.99) 100%)`,
                            border: `1px solid rgba(${nodeColor},0.25)`,
                            boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 20px rgba(${nodeColor},0.08)`,
                            minWidth: 90,
                          }}
                        >
                          {([['xs', 'Klein'], ['sm', 'Midden'], ['lg', 'Groot'], ['xl', 'XL']] as [string, string][]).map(([size, label]) => (
                            <button
                              key={size}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); insertFontSize(size); }}
                              className="flex items-center gap-2 px-3 py-1.5 text-left"
                              style={{ color: 'rgba(255,255,255,0.7)', background: 'transparent', fontSize: size === 'xs' ? 10 : size === 'sm' ? 12 : size === 'lg' ? 15 : 18, transition: 'all 0.15s ease' }}
                              onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.12)`; e.currentTarget.style.color = `rgba(${nodeColor},0.9)`; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {showLinkInput && (
                    <div
                      className="flex items-center gap-2 px-3 py-2 flex-wrap"
                      style={{ borderBottom: `1px solid rgba(${nodeColor},0.1)`, background: `rgba(${nodeColor},0.03)` }}
                    >
                      <input
                        autoFocus
                        value={linkText}
                        onChange={e => setLinkText(e.target.value)}
                        placeholder="Tekst"
                        className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded-lg outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(${nodeColor},0.18)`, color: 'rgba(255,255,255,0.8)', caretColor: `rgba(${nodeColor},1)`, fontFamily: 'inherit', minWidth: 80 }}
                        onKeyDown={e => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
                      />
                      <input
                        value={linkUrl}
                        onChange={e => setLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-0 text-[12px] px-2 py-1 rounded-lg outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid rgba(${nodeColor},0.18)`, color: 'rgba(255,255,255,0.8)', caretColor: `rgba(${nodeColor},1)`, fontFamily: 'inherit', minWidth: 120 }}
                        onKeyDown={e => { if (e.key === 'Enter') insertLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
                      />
                      <button
                        type="button"
                        onClick={insertLink}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-widest flex-shrink-0"
                        style={{ background: `rgba(${nodeColor},0.16)`, color: `rgba(${nodeColor},1)`, border: `1px solid rgba(${nodeColor},0.3)`, boxShadow: `0 0 10px rgba(${nodeColor},0.12)` }}
                      >
                        Voeg in
                      </button>
                    </div>
                  )}

                  <textarea
                    ref={textareaRef}
                    autoFocus
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    placeholder="Write your note here..."
                    rows={Math.max(5, (editBody.split('\n').length) + 5)}
                    className="w-full resize-none text-[14px] leading-relaxed px-4 py-3 outline-none"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255,255,255,0.88)',
                      caretColor: `rgba(${nodeColor},1)`,
                      fontFamily: 'inherit',
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                </div>

                {viewImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {viewImages.map((img, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ width: 72, height: 72, border: `1px solid rgba(${nodeColor},0.2)`, boxShadow: `0 0 12px rgba(${nodeColor},0.08)` }}>
                        <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        <button
                          onClick={img.isMain ? removeImage : () => {
                            const attIdx = editAttachments.findIndex(a => a.url === img.url);
                            if (attIdx >= 0) removeAttachment(attIdx);
                          }}
                          className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full"
                          style={{ background: 'rgba(0,0,0,0.8)', color: 'rgba(255,80,80,0.9)' }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pdfAttachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {pdfAttachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{
                          background: `rgba(${nodeColor},0.05)`,
                          border: `1px solid rgba(${nodeColor},0.15)`,
                          boxShadow: `0 0 10px rgba(${nodeColor},0.05)`,
                        }}
                      >
                        <FileText size={15} style={{ color: `rgba(${nodeColor},0.8)`, flexShrink: 0 }} />
                        <span className="text-[12px] text-white/60 flex-1 truncate">{att.name ?? 'Bijlage'}</span>
                        <button
                          onClick={() => {
                            const attIdx = editAttachments.findIndex(a => a.url === att.url);
                            if (attIdx >= 0) removeAttachment(attIdx);
                          }}
                          className="flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0"
                          style={{ color: 'rgba(255,80,80,0.7)' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 py-5 rounded-xl cursor-pointer"
                  style={{
                    border: `1.5px dashed rgba(${nodeColor},${dragOver ? 0.55 : 0.2})`,
                    background: dragOver
                      ? `rgba(${nodeColor},0.07)`
                      : `radial-gradient(ellipse at 50% 50%, rgba(${nodeColor},0.03) 0%, transparent 70%)`,
                    boxShadow: dragOver ? `inset 0 0 30px rgba(${nodeColor},0.06), 0 0 20px rgba(${nodeColor},0.08)` : 'none',
                    animation: dragOver ? 'none' : 'uploadBreath 3.5s ease-in-out infinite',
                    transition: 'all 0.25s ease',
                  }}
                >
                  {uploading ? (
                    <div
                      className="w-5 h-5 rounded-full border-2 animate-spin"
                      style={{ borderColor: `rgba(${nodeColor},0.25)`, borderTopColor: `rgba(${nodeColor},1)` }}
                    />
                  ) : (
                    <>
                      <div className="flex gap-3">
                        <Image size={16} style={{ color: `rgba(${nodeColor},0.5)`, filter: `drop-shadow(0 0 4px rgba(${nodeColor},0.4))` }} />
                        <FileText size={16} style={{ color: `rgba(${nodeColor},0.5)`, filter: `drop-shadow(0 0 4px rgba(${nodeColor},0.4))` }} />
                        <Upload size={16} style={{ color: `rgba(${nodeColor},0.5)`, filter: `drop-shadow(0 0 4px rgba(${nodeColor},0.4))` }} />
                      </div>
                      <span
                        className="text-[10px] uppercase tracking-widest"
                        style={{ color: `rgba(${nodeColor},0.4)` }}
                      >
                        Afbeelding of PDF
                      </span>
                    </>
                  )}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {content?.body && (
                  <p
                    className="text-[14px] leading-relaxed"
                    style={{
                      color: 'rgba(220,228,240,0.88)',
                      textShadow: '0 1px 12px rgba(0,0,0,0.9)',
                    }}
                  >
                    {renderRichText(content.body, nodeColor)}
                  </p>
                )}

                {viewImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {viewImages.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setLightboxIndex(idx)}
                        className="relative rounded-lg overflow-hidden flex-shrink-0 group"
                        style={{
                          width: 72,
                          height: 72,
                          border: `1px solid rgba(${nodeColor},0.22)`,
                          boxShadow: `0 0 14px rgba(${nodeColor},0.1)`,
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 0 22px rgba(${nodeColor},0.25)`; e.currentTarget.style.borderColor = `rgba(${nodeColor},0.4)`; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 14px rgba(${nodeColor},0.1)`; e.currentTarget.style.borderColor = `rgba(${nodeColor},0.22)`; }}
                      >
                        <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.82)' }} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.4)' }}>
                          <ZoomIn size={18} style={{ color: 'rgba(255,255,255,0.9)', filter: `drop-shadow(0 0 6px rgba(${nodeColor},0.8))` }} />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {pdfAttachments.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {pdfAttachments.map((att, idx) => (
                      <a
                        key={idx}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all active:opacity-70"
                        style={{
                          background: `rgba(${nodeColor},0.05)`,
                          border: `1px solid rgba(${nodeColor},0.15)`,
                          textDecoration: 'none',
                          boxShadow: `0 0 12px rgba(${nodeColor},0.05)`,
                          transition: 'all 0.18s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.1)`; e.currentTarget.style.boxShadow = `0 0 18px rgba(${nodeColor},0.12)`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = `rgba(${nodeColor},0.05)`; e.currentTarget.style.boxShadow = `0 0 12px rgba(${nodeColor},0.05)`; }}
                      >
                        <FileText size={15} style={{ color: `rgba(${nodeColor},0.8)`, flexShrink: 0, filter: `drop-shadow(0 0 4px rgba(${nodeColor},0.5))` }} />
                        <span className="text-[12px] text-white/65 truncate flex-1">{att.name ?? 'PDF bijlage'}</span>
                        <span className="text-[10px] uppercase tracking-widest flex-shrink-0" style={{ color: `rgba(${nodeColor},0.5)` }}>Open</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-shrink-0" style={{ height: 'env(safe-area-inset-bottom, 12px)', minHeight: 12 }} />
        </div>
      </div>

      {lightboxIndex !== null && (
        <LightboxViewer
          images={viewImages.map(i => i.url)}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
