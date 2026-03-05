"use client";
import React, { useRef, useCallback, useState, useEffect } from "react";

interface ChromaGridProps {
  children: React.ReactNode;
  className?: string;
  radius?: number;
  damping?: number;
}

const ChromaGrid: React.FC<ChromaGridProps> = ({
  children,
  className = "",
  radius = 350,
  damping = 0.15,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const [active, setActive] = useState(false);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const tick = useCallback(() => {
    posRef.current.x = lerp(posRef.current.x, targetRef.current.x, damping);
    posRef.current.y = lerp(posRef.current.y, targetRef.current.y, damping);
    const el = rootRef.current;
    if (el) {
      el.style.setProperty("--x", `${posRef.current.x}px`);
      el.style.setProperty("--y", `${posRef.current.y}px`);
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [damping]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick]);

  const handleMove = (e: React.PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    targetRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (!active) setActive(true);
  };

  const handleLeave = () => {
    setActive(false);
  };

  const maskGradient = `radial-gradient(circle ${radius}px at var(--x) var(--y),transparent 0%,transparent 15%,rgba(0,0,0,0.08) 30%,rgba(0,0,0,0.18) 45%,rgba(0,0,0,0.30) 60%,rgba(0,0,0,0.45) 75%,rgba(0,0,0,0.65) 88%,white 100%)`;
  const fadeMaskGradient = `radial-gradient(circle ${radius}px at var(--x) var(--y),white 0%,white 15%,rgba(255,255,255,0.92) 30%,rgba(255,255,255,0.80) 45%,rgba(255,255,255,0.65) 60%,rgba(255,255,255,0.50) 75%,rgba(255,255,255,0.30) 88%,transparent 100%)`;

  return (
    <div
      ref={rootRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`relative ${className}`}
      style={{ "--x": "50%", "--y": "50%", "--r": `${radius}px` } as React.CSSProperties}
    >
      {children}
      {/* Desaturation overlay — always visible, masked to exclude spotlight area */}
      <div
        ref={maskRef}
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backdropFilter: "grayscale(1) brightness(0.75)",
          WebkitBackdropFilter: "grayscale(1) brightness(0.75)",
          background: "rgba(0,0,0,0.001)",
          maskImage: maskGradient,
          WebkitMaskImage: maskGradient,
        }}
      />
      {/* Fade overlay — covers the spotlight hole when cursor leaves */}
      <div
        ref={fadeRef}
        className="absolute inset-0 pointer-events-none z-20 transition-opacity duration-500"
        style={{
          backdropFilter: "grayscale(1) brightness(0.75)",
          WebkitBackdropFilter: "grayscale(1) brightness(0.75)",
          background: "rgba(0,0,0,0.001)",
          maskImage: fadeMaskGradient,
          WebkitMaskImage: fadeMaskGradient,
          opacity: active ? 0 : 1,
        }}
      />
    </div>
  );
};

export default ChromaGrid;
