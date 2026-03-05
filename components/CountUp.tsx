"use client";
import { useInView, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
}

export default function CountUp({
  to,
  from = 0,
  duration = 1,
  className = "",
  startWhen = true,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, {
    damping: 20 + 40 * (1 / duration),
    stiffness: 100 * (1 / duration),
  });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  useEffect(() => {
    if (ref.current) ref.current.textContent = String(from);
  }, [from]);

  useEffect(() => {
    if (isInView && startWhen) {
      motionValue.set(to);
    }
  }, [isInView, startWhen, motionValue, to]);

  useEffect(() => {
    const unsub = springValue.on("change", (latest: number) => {
      if (ref.current) ref.current.textContent = String(Math.round(latest));
    });
    return () => unsub();
  }, [springValue]);

  return <span className={className} ref={ref} />;
}
