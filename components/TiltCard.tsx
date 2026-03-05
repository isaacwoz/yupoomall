"use client";
import { useRef } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  rotateAmplitude?: number;
  scaleOnHover?: number;
}

const springConfig = { damping: 30, stiffness: 150, mass: 1 };

export default function TiltCard({
  children,
  className = "",
  rotateAmplitude = 8,
  scaleOnHover = 1.02,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useSpring(useMotionValue(0), springConfig);
  const rotateY = useSpring(useMotionValue(0), springConfig);
  const scale = useSpring(1, springConfig);

  function onMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const ox = e.clientX - rect.left - rect.width / 2;
    const oy = e.clientY - rect.top - rect.height / 2;
    rotateX.set((oy / (rect.height / 2)) * -rotateAmplitude);
    rotateY.set((ox / (rect.width / 2)) * rotateAmplitude);
  }

  function onEnter() {
    scale.set(scaleOnHover);
  }

  function onLeave() {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  }

  return (
    <div style={{ perspective: 800 }} className={`${className} h-fit`}>
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, scale, height: "auto" }}
        onMouseMove={onMove}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className="h-fit"
      >
        {children}
      </motion.div>
    </div>
  );
}
