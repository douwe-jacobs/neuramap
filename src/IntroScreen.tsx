import React from 'react';
import { APP_VERSION } from './worldData';

interface IntroScreenProps {
  phase: 'visible' | 'exit' | 'done';
  onTap: () => void;
}

export function IntroScreen({ phase, onTap }: IntroScreenProps) {
  const exit = phase === 'exit';
  const vw = window.innerWidth;
  const blobW = Math.min(vw * 0.663, 289);
  const blobH = blobW * 1.02;
  const overlap = blobH * 0.30;

  const blobStyle = (i: number, extraStyle?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    left: '50%',
    width: blobW,
    height: blobH,
    top: `calc(50% - ${blobH * 1.5 - overlap}px + ${i * (blobH - overlap)}px)`,
    transform: 'translateX(-50%)',
    borderRadius: '42% 58% 70% 30% / 45% 45% 55% 55%',
    border: '2px solid rgba(255,255,255,0.3)',
    ...extraStyle,
  });

  return (
    <div className="fixed inset-0 z-[3000] bg-black overflow-hidden" style={{ height: '100dvh', cursor: 'default' }} onClick={onTap}>
      <style>{[
        '@keyframes introBlob{0%,100%{border-radius:42% 58% 70% 30%/45% 45% 55% 55%}33%{border-radius:60% 40% 65% 35%/35% 65% 35% 65%}66%{border-radius:45% 55% 35% 65%/65% 35% 65% 35%}}',
        '@keyframes wordmarkFade{0%{opacity:0}100%{opacity:1}}',
      ].join('')}</style>

      <div style={{
        ...blobStyle(0),
        animation: 'introBlob 9s ease-in-out infinite',
        transform: exit ? `translateX(-50%) translateY(-130vh)` : 'translateX(-50%)',
        transition: exit ? 'transform 1s cubic-bezier(0.4,0,0.2,1)' : 'none',
      }} />

      <div style={{
        ...blobStyle(1),
        animation: 'introBlob 12s ease-in-out infinite reverse',
        border: '2px solid rgba(255,255,255,0.3)',
        opacity: exit ? 0 : 1,
        transition: exit ? 'opacity 0.7s ease 0.15s' : 'none',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'wordmarkFade 1.4s 0.5s both ease-out',
          opacity: exit ? 0 : undefined,
          transition: exit ? 'opacity 0.3s ease' : 'none',
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1061 204"
            style={{ width: blobW * 0.72, height: 'auto' }}>
            <g>
              <path fill="#e6e6e6" d="M772,154.5v-79.5l-55.75,79c-1.01.84-7.5.81-8.49,0l-54.34-77.66-1.42-.83v79h-12V42h7.25l66.01,94,1.23-.76,65.52-92.98c2.22-.26,5.7-.91,7.49.49v111l-.75.75h-14.75Z"/>
              <path fill="#e6e6e6" d="M393.5,42c20.95.98,43.48-1.98,64.12,1.63,22.34,3.91,36.37,15.98,34.38,40.11-1.49,18.07-13.22,27.09-28.8,33.21-.52.2-.86-.27-.69.79l34,36.76h-19.75l-30.37-33.64-36.88.14v32.75l-.75.75h-15.25V42ZM409.5,51.25v60.5c.44.71,1,.69,1.72.78,6.14.72,17.58.3,24.05,0,23.98-1.12,43.33-10.36,40.66-37.71-1.96-20.09-23.23-23.62-39.66-24.34-6.79-.29-18.6-.76-25.05,0-.73.09-1.29.06-1.72.78Z"/>
              <path fill="#e6e6e6" d="M48.75,42c26,27.47,52.41,54.6,78.76,81.74,1.23,1.26,1.83,3.52,3.99,3.26V42h12v112.5h-7.75c-.26,0-1.07-1.64-1.48-2.03-23.92-22.67-46.58-48.55-69.75-72.23-3.46-3.54-7.07-6.95-10.52-10.5l-1,.5v84.25h-12V42h7.75Z"/>
              <path fill="#e6e6e6" d="M286,42v76.25c0,4.94,3.6,13.42,6.74,17.26,13.11,16,49.42,15.36,59.34-4.17,1.37-2.68,3.91-10.78,3.91-13.59V42h15.5v77.75c0,15.32-14.32,28.72-28.09,32.91-26.83,8.16-68.3,1.16-72.85-31.97-3.29-23.95,1.32-52.52-.59-76.97l.78-1.72h15.25Z"/>
              <path fill="#e6e6e6" d="M950,121v33.5h-16V42c24.33,1.59,55.97-4.33,78.34,6.91,24.25,12.18,22.76,47.74,1.32,61.99-18.68,12.41-42.26,9.89-63.65,10.1ZM950,51.25v60.5c.44.71,1,.69,1.72.78,5.52.65,15.74.27,21.55,0,22.46-1.05,42.2-9.39,40.75-35.29-1.23-22.05-21.45-25.95-39.75-26.75-6.13-.27-16.73-.69-22.55,0-.73.09-1.29.06-1.72.78Z"/>
              <path fill="#e6e6e6" d="M624.5,154.5h-16.5l-10.55-22.2-1.67-.83-63.95.11-11.33,22.92h-13.5l54.55-111.7c.97-1.25,7.39-1.3,8.4,0l54.55,111.7ZM592.5,122.5l-28.25-56.99-28.25,56.99h56.5Z"/>
              <path fill="#e6e6e6" d="M803,154.5l54.07-111.18c1.5-2.45,5.25-.89,7.7-1.36l55.73,112.54h-16.25l-11.59-23.02-64.94-.02-11.98,23.04h-12.75ZM832,122.5h56l-27.76-57-28.24,57Z"/>
              <path fill="#e6e6e6" d="M247.5,42v10.5l-64.5-2v41.5c3.74-.09,7.52.12,11.27.02,13.75-.35,27.7-.65,41.46-1.04,2.65-.08,6.64-.47,8.77.77v9l-61.5-.25v45.5l68-1.5v10h-84V42h80.5Z"/>
            </g>
          </svg>
        </div>
      </div>

      <div style={{
        ...blobStyle(2),
        animation: 'introBlob 11s ease-in-out infinite 1.5s',
        transform: exit ? `translateX(-50%) translateY(130vh)` : 'translateX(-50%)',
        transition: exit ? 'transform 1s cubic-bezier(0.4,0,0.2,1) 0.08s' : 'none',
      }} />

      <div style={{
        position: 'absolute', bottom: 32, left: 28,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 9, letterSpacing: '0.3em', fontFamily: 'monospace',
        opacity: exit ? 0 : 1,
        transition: exit ? 'opacity 0.3s ease' : 'none',
      }}>v{APP_VERSION}</div>
    </div>
  );
}
