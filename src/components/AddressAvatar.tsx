import { useMemo } from "react";
import { cx } from "./ui";

// FNV-1a hash → 32-bit unsigned seed.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small deterministic PRNG so the same seed always yields the same avatar.
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A MetaMask-style generated avatar: a colored background plus a few rotated
 * shapes, derived deterministically from `seed` (typically an account address).
 */
export function AddressAvatar({ seed, size = 36, className }: { seed: string; size?: number; className?: string }) {
  const { bg, shapes } = useMemo(() => {
    const rand = mulberry32(hashSeed(seed || "?"));
    const base = rand() * 360;
    const shapes = Array.from({ length: 3 }, (_, i) => ({
      fill: `hsl(${Math.round((base + 100 + i * 110 + rand() * 50) % 360)} 70% 58%)`,
      tx: (rand() - 0.5) * 90,
      ty: (rand() - 0.5) * 90,
      rot: rand() * 360,
    }));
    return { bg: `hsl(${Math.round(base)} 65% 55%)`, shapes };
  }, [seed]);

  return (
    <span
      style={{ width: size, height: size }}
      aria-hidden
      className={cx("inline-block shrink-0 select-none overflow-hidden rounded-full", className)}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        <rect width="100" height="100" fill={bg} />
        {shapes.map((s, i) => (
          <rect
            key={i}
            width="100"
            height="100"
            fill={s.fill}
            transform={`translate(${s.tx.toFixed(1)} ${s.ty.toFixed(1)}) rotate(${s.rot.toFixed(1)} 50 50)`}
          />
        ))}
      </svg>
    </span>
  );
}
