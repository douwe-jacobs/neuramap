import React, { useMemo, useEffect, useRef, useState } from 'react';

interface StarFieldProps {
  scrollX?: number;
  scrollY?: number;
  accentH?: number;
  accentS?: number;
  accentL?: number;
}

export function StarField({ scrollX = 0, scrollY = 0, accentH = 190, accentS = 88, accentL = 58 }: StarFieldProps) {
  const nebulae = useMemo(() => [
    { x: 18,  y: 12,  r: 55,  color: '30,60,120',  opacity: 0.18, parallax: 0.018 },
    { x: 72,  y: 68,  r: 42,  color: '10,40,90',   opacity: 0.14, parallax: 0.024 },
    { x: 50,  y: 30,  r: 70,  color: '20,50,110',  opacity: 0.10, parallax: 0.010 },
    { x: 85,  y: 20,  r: 38,  color: '40,70,140',  opacity: 0.12, parallax: 0.032 },
    { x: 30,  y: 75,  r: 48,  color: '15,35,80',   opacity: 0.13, parallax: 0.020 },
    { x: 62,  y: 50,  r: 60,  color: '25,55,105',  opacity: 0.08, parallax: 0.014 },
  ], []);

  const dust = useMemo(() => [
    { x: 35, y: 20, rx: 60, ry: 28, color: '50,90,180', opacity: 0.06, parallax: 0.008 },
    { x: 70, y: 55, rx: 48, ry: 20, color: '30,60,140', opacity: 0.05, parallax: 0.016 },
    { x: 20, y: 60, rx: 55, ry: 22, color: '40,80,160', opacity: 0.06, parallax: 0.012 },
  ], []);

  const smoothH = useRef(accentH);
  const smoothS = useRef(accentS);
  const smoothL = useRef(accentL);
  const [displayH, setDisplayH] = useState(accentH);
  const [displayS, setDisplayS] = useState(accentS);
  const [displayL, setDisplayL] = useState(accentL);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef({ h: accentH, s: accentS, l: accentL });

  useEffect(() => {
    targetRef.current = { h: accentH, s: accentS, l: accentL };
  }, [accentH, accentS, accentL]);

  useEffect(() => {
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const lerpAngle = (a: number, b: number, t: number) => {
      let diff = ((b - a + 540) % 360) - 180;
      return a + diff * t;
    };
    const speed = 0.015;

    const tick = () => {
      const { h, s, l } = targetRef.current;
      smoothH.current = lerpAngle(smoothH.current, h, speed);
      smoothS.current = lerp(smoothS.current, s, speed);
      smoothL.current = lerp(smoothL.current, l, speed);
      setDisplayH(Math.round(smoothH.current));
      setDisplayS(Math.round(smoothS.current));
      setDisplayL(Math.round(smoothL.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const accentRgb = useMemo(() => {
    const h = displayH / 360;
    const s = displayS / 100;
    const l = displayL / 100;
    const k = (n: number) => (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
    return `${f(0)},${f(8)},${f(4)}`;
  }, [displayH, displayS, displayL]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 0,
      pointerEvents: 'none',
      background: 'rgb(2,5,12)',
      overflow: 'hidden',
    }}>
      {nebulae.map((n, i) => {
        const dx = scrollX * n.parallax;
        const dy = scrollY * n.parallax;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `calc(${n.x}% + ${dx * 0.05}px)`,
              top:  `calc(${n.y}% + ${dy * 0.05}px)`,
              width:  `${n.r}vmax`,
              height: `${n.r}vmax`,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(${n.color},${n.opacity}) 0%, rgba(${n.color},0) 70%)`,
              willChange: 'transform',
            }}
          />
        );
      })}

      {dust.map((d, i) => {
        const dx = scrollX * d.parallax;
        const dy = scrollY * d.parallax;
        return (
          <div
            key={`d${i}`}
            style={{
              position: 'absolute',
              left: `calc(${d.x}% + ${dx * 0.05}px)`,
              top:  `calc(${d.y}% + ${dy * 0.05}px)`,
              width:  `${d.rx}vmax`,
              height: `${d.ry}vmax`,
              transform: 'translate(-50%, -50%) rotate(-15deg)',
              borderRadius: '50%',
              background: `radial-gradient(ellipse, rgba(${d.color},${d.opacity}) 0%, rgba(${d.color},0) 65%)`,
              willChange: 'transform',
            }}
          />
        );
      })}

      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(10,25,80,0.55) 0%, transparent 65%)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 80% 100%, rgba(5,15,60,0.40) 0%, transparent 55%)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at 15% 50%, rgba(8,20,70,0.30) 0%, transparent 55%)',
      }} />

      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 50% 50%, rgba(${accentRgb},0.06) 0%, rgba(${accentRgb},0.02) 40%, transparent 70%)`,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 30% 70%, rgba(${accentRgb},0.04) 0%, transparent 55%)`,
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at 70% 25%, rgba(${accentRgb},0.03) 0%, transparent 45%)`,
      }} />
    </div>
  );
}
