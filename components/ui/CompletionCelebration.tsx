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
  shape: "square" | "diamond" | "sword" | "gem" | "circle";
}

// DCC palette: crimson, gold, dungeon-purple, ember-orange
const DCC_COLORS = [
  "#dc2626", // crimson
  "#f59e0b", // gold
  "#7c3aed", // dungeon-purple
  "#ea580c", // ember-orange
  "#dc2626", // more crimson
  "#eab308", // bright gold
];

const SHAPES = ["square", "diamond", "sword", "gem", "circle"] as const;

function ParticleShape({ shape, color }: { shape: string; color: string }) {
  switch (shape) {
    case "sword":
      return (
        <svg width="10" height="14" viewBox="0 0 10 14" fill={color}>
          <path d="M5 0 L6.5 8 L5 10 L3.5 8 Z" />
          <rect x="4" y="10" width="2" height="2" />
          <rect x="3" y="11" width="4" height="1" />
        </svg>
      );
    case "gem":
      return (
        <svg width="10" height="10" viewBox="0 0 10 10" fill={color}>
          <polygon points="5,0 10,4 5,10 0,4" />
        </svg>
      );
    case "diamond":
      return <div className="w-2 h-2 rotate-45" style={{ backgroundColor: color }} />;
    case "circle":
      return <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
    default:
      return <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />;
  }
}

/**
 * DCC-themed completion celebration with confetti burst,
 * dungeon-themed particle shapes, and +XP floating text.
 */
export default function CompletionCelebration({
  show,
  onComplete,
  xpAmount = 10,
}: {
  show: boolean;
  onComplete?: () => void;
  xpAmount?: number;
}) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [showXP, setShowXP] = useState(false);

  const generateParticles = useCallback(() => {
    const count = 28;
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 5;
      newParticles.push({
        id: i,
        x: 50,
        y: 50,
        color: DCC_COLORS[Math.floor(Math.random() * DCC_COLORS.length)],
        rotation: Math.random() * 360,
        scale: 0.5 + Math.random() * 0.6,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      });
    }
    return newParticles;
  }, []);

  useEffect(() => {
    if (!show) return;

    setParticles(generateParticles());
    setShowXP(true);

    const timer = setTimeout(() => {
      setParticles([]);
      setShowXP(false);
      onComplete?.();
    }, 1200);

    return () => clearTimeout(timer);
  }, [show, generateParticles, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[200]" aria-hidden="true">
      {/* Confetti particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-burst"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            "--vx": `${p.velocityX * 40}px`,
            "--vy": `${p.velocityY * 40}px`,
          } as React.CSSProperties}
        >
          <ParticleShape shape={p.shape} color={p.color} />
        </div>
      ))}

      {/* +XP floating text */}
      {showXP && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 animate-xp-float"
          style={{
            animation: "xpFloat 1.2s ease-out forwards",
          }}
        >
          <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 drop-shadow-lg">
            +{xpAmount} XP
          </span>
        </div>
      )}

      {/* Inline keyframes */}
      <style>{`
        @keyframes xpFloat {
          0% { opacity: 0; transform: translate(-50%, 0) scale(0.5); }
          20% { opacity: 1; transform: translate(-50%, -20px) scale(1.2); }
          60% { opacity: 1; transform: translate(-50%, -60px) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -100px) scale(0.8); }
        }
      `}</style>
    </div>
  );
}
