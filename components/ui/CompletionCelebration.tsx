"use client";

import React, { useEffect, useState, useCallback } from "react";

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  rotation: number;
  scale: number;
  velocityX: number;
  velocityY: number;
}

const COLORS = [
  "#ef4444", // red
  "#f59e0b", // amber/gold
  "#10b981", // emerald
  "#6366f1", // indigo
  "#ec4899", // pink
  "#8b5cf6", // violet
];

/**
 * Lightweight confetti burst that plays once and cleans up.
 * Trigger by mounting with show=true; auto-unmounts after animation.
 */
export default function CompletionCelebration({
  show,
  onComplete,
}: {
  show: boolean;
  onComplete?: () => void;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);

  const generateParticles = useCallback(() => {
    const count = 24;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 4;
      newParticles.push({
        id: i,
        x: 50,
        y: 50,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.5,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
      });
    }
    return newParticles;
  }, []);

  useEffect(() => {
    if (!show) return;

    setParticles(generateParticles());

    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 800);

    return () => clearTimeout(timer);
  }, [show, generateParticles, onComplete]);

  if (!show || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[200]" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute w-2 h-2 rounded-sm animate-confetti-burst"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            "--vx": `${p.velocityX * 40}px`,
            "--vy": `${p.velocityY * 40}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
