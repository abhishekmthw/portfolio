"use client";

import * as React from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * DataFlowDiagram — a dedicated, crisp SVG "data-flow" graphic for the Experience
 * section (replaces the point-cloud approximation for THIS section only).
 *
 * Structure: several neatly-spaced LINES (rows) of binary code on the left act as
 * sources. From each, a curved glowing line flows right and MERGES into one of THREE
 * distinct destination lines of (different) binary code on the right. Many sources
 * randomly converge onto the 3 destination nodes, where the "arriving" data reads
 * brighter. Travelling packets run along the curves as live flow (off under reduced
 * motion).
 *
 * The particle backdrop fades its cloud out while this section is docked (see the
 * `dataflowness` gate in particle-field.tsx), so this graphic owns the stage here.
 *
 * Colours stay on the site's brand authority — Plum Voltage violets + a Lichen-teal
 * glint. The three merge groups are tinted by GROUP_COLORS so the 3-way convergence
 * reads clearly; swap those for the reference image's multi-hue spectrum to match it
 * literally.
 */

// Deterministic PRNG so server and client render identical markup (no hydration drift).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VB_W = 640;
const VB_H = 440;

// the three merge-group hues (one per destination line)
const GROUP_COLORS = ["#8052ff", "#46c2a6", "#b46cff"];
const DIGIT_BRIGHT = "#f3f1ff";
const DIGIT_DIM = "#9d92c4";

// layout (viewBox units)
const SRC_X = 40; // left edge of source rows
const SRC_LEN = 7; // digits per source row
const SRC_DX = 14; // digit spacing
const SRC_ANCHOR_X = SRC_X + SRC_LEN * SRC_DX + 10; // right end where the curve departs
const SRC_ROWS = 9;
const SRC_Y0 = 56;
const SRC_DY = 41; // 56 .. 384

const DST_NODE_X = 432; // merge node (curves arrive here)
const DST_DIG_X = 450; // destination digits start just right of the node
const DST_LEN = 11;
const DST_DX = 16;
const DST_Y = [118, 222, 326];

type Bit = { x: number; ch: string };
type Source = { y: number; bits: Bit[]; twinkle: boolean[] };
type Dest = { y: number; bits: Bit[]; color: string };
type Curve = { id: string; d: string; color: string; width: number; opacity: number; packet: boolean; dur: number; delay: number };

function makeBits(rnd: () => number, n: number, x0: number, dx: number): Bit[] {
  const out: Bit[] = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * dx, ch: rnd() < 0.5 ? "0" : "1" });
  return out;
}

function buildScene() {
  const rnd = mulberry32(0x5ea11ce); // fixed seed → stable layout

  // source lines of binary (left), evenly spaced
  const sources: Source[] = [];
  for (let r = 0; r < SRC_ROWS; r++) {
    const y = SRC_Y0 + r * SRC_DY;
    const bits = makeBits(rnd, SRC_LEN, SRC_X, SRC_DX);
    const twinkle = bits.map(() => rnd() < 0.22);
    sources.push({ y, bits, twinkle });
  }

  // three destination lines of a different binary set (right)
  const dests: Dest[] = DST_Y.map((y, di) => ({
    y,
    bits: makeBits(rnd, DST_LEN, DST_DIG_X, DST_DX),
    color: GROUP_COLORS[di],
  }));

  // curved glowing lines: each source departs and merges into one of the 3 dests.
  // First three seed one source per dest (so none is empty); the rest pick randomly.
  const curves: Curve[] = sources.map((s, k) => {
    const di = k < 3 ? k : Math.floor(rnd() * 3);
    const sx = SRC_ANCHOR_X;
    const sy = s.y - 4; // sit on the row's mid-line
    const ex = DST_NODE_X;
    const ey = DST_Y[di];
    const c1x = sx + 95 + rnd() * 30; // leave the source horizontally
    const c1y = sy;
    const c2x = ex - (95 + rnd() * 30); // approach the merge node horizontally
    const c2y = ey;
    return {
      id: `df-curve-${k}`,
      d: `M${sx} ${sy} C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${ex} ${ey}`,
      color: GROUP_COLORS[di],
      width: 1 + rnd() * 0.8,
      opacity: 0.5 + rnd() * 0.4,
      packet: rnd() < 0.6,
      dur: 2.4 + rnd() * 2.6,
      delay: rnd() * 3,
    };
  });

  return { sources, dests, curves };
}

export function DataFlowDiagram({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const opacity = useTransform(scrollYProgress, [0.05, 0.2, 0.82, 0.96], [0, 1, 1, 0.1]);

  const scene = React.useMemo(buildScene, []);
  const animate = !reduce;
  const MONO = 'ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace';

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 hidden lg:block", className)}
    >
      {/* pinned to the viewport so it stays centred on the left while the (very tall)
          section scrolls past — mirrors how the fixed particle backdrop docks */}
      <motion.div
        style={{ opacity }}
        className="sticky top-0 flex h-screen w-[58%] items-center justify-center"
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-auto max-h-[80%] w-full"
          fill="none"
        >
          <defs>
            <filter id="df-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="2.2" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* merging glowing curves (drawn under the text) */}
          <g filter="url(#df-glow)">
            {scene.curves.map((c) => (
              <path
                key={c.id}
                id={c.id}
                d={c.d}
                stroke={c.color}
                strokeWidth={c.width}
                strokeLinecap="round"
                opacity={c.opacity}
              />
            ))}
          </g>

          {/* travelling data packets along the curves */}
          {animate &&
            scene.curves
              .filter((c) => c.packet)
              .map((c) => (
                <circle key={`pk-${c.id}`} r={1.9} fill={DIGIT_BRIGHT} filter="url(#df-glow)">
                  <animateMotion dur={`${c.dur.toFixed(2)}s`} begin={`${c.delay.toFixed(2)}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#${c.id}`} />
                  </animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur={`${c.dur.toFixed(2)}s`} begin={`${c.delay.toFixed(2)}s`} repeatCount="indefinite" />
                </circle>
              ))}

          {/* source lines of binary (left), neatly spaced — dim */}
          <g fontFamily={MONO} fontSize={13} fontWeight={600} textAnchor="middle">
            {scene.sources.map((s, si) =>
              s.bits.map((b, bi) => (
                <text key={`s-${si}-${bi}`} x={b.x} y={s.y} fill={DIGIT_DIM} opacity={0.7}>
                  {b.ch}
                  {animate && s.twinkle[bi] && (
                    <animate attributeName="opacity" values="0.7;0.15;0.7" dur={`${(2 + (bi % 4)).toFixed(2)}s`} begin={`${(si * 0.3).toFixed(2)}s`} repeatCount="indefinite" />
                  )}
                </text>
              ))
            )}
          </g>

          {/* three merge nodes + the destination lines of binary (right) — bright */}
          {scene.dests.map((d, di) => (
            <g key={`dst-${di}`}>
              <circle cx={DST_NODE_X} cy={d.y} r={4.5} fill={d.color} filter="url(#df-glow)" />
              <g fontFamily={MONO} fontSize={14} fontWeight={700} textAnchor="middle">
                {d.bits.map((b, bi) => (
                  <text key={`dst-${di}-${bi}`} x={b.x} y={d.y + 4.5} fill={bi % 4 === 0 ? d.color : DIGIT_BRIGHT} opacity={0.95}>
                    {b.ch}
                  </text>
                ))}
              </g>
            </g>
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
