"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import * as THREE from "three";

/**
 * ParticleField — the "Dala" constellation, ported and choreographed.
 *
 * One cloud of ~2400 particles that TRAVELS and MORPHS as the page scrolls. It
 * docks to alternating sides per section, and SCATTERS full-screen in the gaps
 * between sections before reassembling on the opposite side as the next shape:
 *
 *   </> → </> → gear → { } → ★ → ★ → globe
 *
 * Gaps between two IDENTICAL shapes (Hero↔About </>, Projects↔Education ★) are
 * special: instead of scattering they spin a full 360° about the vertical Y
 * axis — a visible turn that lands cleanly. Mixed-shape gaps scatter as before.
 *
 * The form itself moves only SLIGHTLY (a gentle tilt); moving the cursor
 * parallaxes the surrounding starfield AROUND it much more, so the world
 * appears to shift around the near-fixed object. Hovering the model acts like a
 * LOCALIZED lens — the small patch of points under the cursor swells in size and
 * spreads apart to make room, settling back when the pointer leaves. An entry
 * animation assembles it from a dispersed cloud on load, and a faint starfield
 * is always present.
 *
 * Targets @react-three/fiber v8 + React 18. Theme-aware (additive glow on the
 * void; darker normal-blended hues on white). Reduced-motion → a static docked
 * hero </> with stars.
 */

// denser than the original 2400 so the world-globe continents read clearly (the
// count is shared across every morph shape, which only makes the rest richer too)
const POINT_COUNT = 3600;
const STAR_COUNT = 3500;
// tiny white sea dots that fill the ocean between continents on the world globe
const OCEAN_COUNT = 3000;
const LINKS_PER_POINT = 1;

// Overall size of the morphing model. Bump this to scale every shape together;
// the starfield and the full-screen scatter spread are deliberately left
// independent of it so only the docked object grows.
const MODEL_SCALE = 1.35;

// The hero </> is the page's headline mark, so it sits larger than the matching
// About </> it morphs into. Applied as a group scale on section 0 only that eases
// to 1 across the first gap — so the Y spin shrinks the big hero glyph into the
// smaller docked About one. Every other model stays at 1.
const HERO_SCALE = 1.3;

// Hover "lens": every point within HOVER_RADIUS (cloud-local units; the model
// spans ~±2.7 after MODEL_SCALE) of the cursor IN THE SCREEN PLANE (x/y, depth
// ignored — so it works on the hollow globe too) swells to (1 + HOVER_GROW)× its
// base size and is parted outward by HOVER_SPREAD to make room for the larger
// dots. Strongest right under the pointer, easing to zero at the rim.
const HOVER_RADIUS = 1.3;
const HOVER_R2 = HOVER_RADIUS * HOVER_RADIUS;
const HOVER_GROW = 0.2;
const HOVER_SPREAD = 0.1;

// Slow per-particle shimmer: each point's brightness drifts between SHIMMER_MIN
// and full on its own phase, so the field gently blinks darker/brighter instead
// of pulsing in unison. SHIMMER_FREQ is the base angular speed (rad/s) — low is
// very slow; a per-particle speed/phase jitter is added in-shader.
const SHIMMER_MIN = 0.35;
const SHIMMER_FREQ = 2.0;

// Per-section shape + side. order.length must match the number of <section>s.
// Adjacent IDENTICAL shapes (Hero/About </>, Projects/Education ★) spin about
// the Y axis between sections instead of scattering — see rollY / spinGap below.
const ORDER = ["brackets", "brackets", "gear", "braces", "star", "star", "globe"] as const;
// even index → model docks RIGHT (+1), odd → LEFT (-1). Content sits opposite.
const sideSign = (i: number) => (i % 2 === 0 ? 1 : -1);
// How far the model docks from center, as a fraction of viewport width. The
// enlarged hero </> (section 0) docks closer in so its right edge isn't clipped.
const dockFrac = (i: number) => (i === 0 ? 0.12 : 0.25);

// ---------------------------------------------------------------- math
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Shift a point cloud in place so its vertical (Y) bounding-box center sits at
 *  the local origin. Each shape is rasterized at whatever Y it happened to be
 *  drawn at on the canvas, so this guarantees every model reads as vertically
 *  centered on screen (the model group itself stays at world y = 0). */
function centerY(arr: Float32Array): void {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 1; i < arr.length; i += 3) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  const mid = (min + max) / 2;
  for (let i = 1; i < arr.length; i += 3) arr[i] -= mid;
}

// ---------------------------------------------------------------- shape data

// India's longitude — rotated to the globe's front (+z, toward the camera) so the
// world map is "focused on India" when the globe docks at the Contact section.
const INDIA_LON = 78;
// Pitch the globe forward about X so the northern hemisphere (Asia) tilts toward
// the camera: the dead-center latitude becomes ~GLOBE_TILT_DEG, lifting India and
// Asia into full view instead of leaving the equatorial Indian Ocean facing front.
const GLOBE_TILT_DEG = 30;

/**
 * Rough equirectangular world map: filled white land over transparent ocean,
 * coarse continent outlines in (lon, lat) degrees. Detail is deliberately low —
 * the globe samples this into ~2400 dots, so continent shapes read, not borders.
 * Hand-authored (no image asset), accuracy is approximate.
 */
function drawWorldMap(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * W,
    ((90 - lat) / 180) * H,
  ];
  const poly = (pts: number[][]) => {
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const [x, y] = P(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  };

  // North America
  poly([[-168, 65], [-160, 71], [-128, 70], [-100, 69], [-82, 73], [-60, 60], [-64, 47], [-78, 44], [-81, 25], [-97, 18], [-105, 20], [-114, 28], [-124, 40], [-125, 48], [-140, 59]]);
  // Central America
  poly([[-92, 18], [-83, 15], [-78, 8], [-83, 9], [-90, 15]]);
  // South America
  poly([[-80, 9], [-60, 11], [-50, 2], [-35, -6], [-39, -16], [-48, -25], [-58, -35], [-66, -46], [-74, -53], [-73, -44], [-70, -30], [-70, -18], [-79, -4]]);
  // Greenland
  poly([[-45, 60], [-22, 70], [-20, 80], [-38, 83], [-55, 76], [-50, 66]]);
  // Africa
  poly([[-17, 21], [0, 35], [11, 37], [25, 32], [36, 31], [43, 12], [51, 11], [42, -2], [40, -16], [33, -26], [20, -35], [14, -29], [12, -6], [9, 4], [-8, 5], [-16, 13]]);
  // Madagascar
  poly([[44, -13], [50, -16], [49, -25], [45, -22]]);
  // Europe (blob, fused to Asia)
  poly([[-10, 43], [-9, 37], [7, 37], [18, 40], [28, 41], [40, 46], [42, 60], [28, 71], [12, 64], [2, 58], [-5, 50], [-10, 52]]);
  // UK & Ireland
  poly([[-8, 52], [-2, 50], [1, 53], [-3, 59], [-7, 56]]);
  // Asia (main Eurasian mass)
  poly([[40, 46], [58, 52], [82, 56], [105, 53], [130, 55], [150, 60], [172, 66], [180, 68], [168, 58], [140, 46], [124, 40], [122, 30], [108, 21], [100, 9], [96, 16], [89, 22], [80, 30], [68, 24], [58, 26], [46, 32], [38, 40]]);
  // Arabian peninsula
  poly([[34, 30], [48, 30], [60, 25], [56, 17], [45, 12], [39, 16]]);
  // India peninsula (the focal point — a clear downward taper)
  poly([[70, 27], [73, 22], [75, 15], [78, 8], [81, 14], [86, 19], [89, 22], [85, 25], [79, 28], [73, 29]]);
  // Southeast Asia / Indonesia
  poly([[97, 7], [106, 3], [120, 1], [120, -8], [106, -8], [99, -1]]);
  // New Guinea
  poly([[131, -2], [141, -3], [150, -7], [143, -10], [132, -9]]);
  // Japan
  poly([[130, 31], [137, 35], [143, 41], [145, 44], [139, 37], [132, 33]]);
  // Australia
  poly([[113, -22], [122, -18], [130, -12], [137, -12], [143, -11], [150, -24], [153, -29], [148, -38], [138, -38], [129, -32], [120, -34], [114, -30]]);
  // Antarctica (full-width polar cap)
  ctx.fillRect(0, P(0, -66)[1], W, H - P(0, -66)[1]);
}

/**
 * World globe — sample the land mask and wrap it onto a sphere shell, rotating
 * India's longitude to the front (+z, toward the camera). Sampling is
 * area-corrected (reject by cos(lat)) so the equirectangular poles don't
 * over-fill; oceans get no points, so the continents read as land vs. empty sea.
 */
function makeWorldGlobe(n: number, radius: number): Float32Array {
  const out = new Float32Array(n * 3);
  if (typeof document === "undefined") return out;
  const W = 360;
  const H = 180;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  drawWorldMap(ctx, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const land: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 100) land.push(x, y);
    }
  }
  const landN = land.length / 2;
  const lon0 = (INDIA_LON * Math.PI) / 180;
  const tilt = (GLOBE_TILT_DEG * Math.PI) / 180;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    let lat = 0;
    let lam = 0; // longitude relative to India (0 = facing the camera)
    if (landN > 0) {
      // pick a land pixel, area-corrected by cos(lat) so the equirectangular
      // poles don't over-fill. Full sphere (both hemispheres) so it reads as a
      // balanced globe; India's longitude is rotated to the front below.
      for (let tries = 0; tries < 12; tries++) {
        const k = Math.floor(Math.random() * landN) * 2;
        const px = land[k] + Math.random();
        const py = land[k + 1] + Math.random();
        lat = Math.PI / 2 - (py / H) * Math.PI;
        lam = (px / W) * 2 * Math.PI - Math.PI - lon0;
        if (Math.random() <= Math.cos(lat)) break;
      }
    } else {
      lam = Math.random() * 2 * Math.PI - Math.PI;
      lat = Math.asin(2 * Math.random() - 1);
    }
    const cl = Math.cos(lat);
    const x0 = radius * cl * Math.sin(lam);
    const y0 = radius * Math.sin(lat);
    const z0 = radius * cl * Math.cos(lam);
    // pitch about X — tilt the northern hemisphere (Asia) toward the camera
    out[i * 3] = x0;
    out[i * 3 + 1] = y0 * ct - z0 * st;
    out[i * 3 + 2] = y0 * st + z0 * ct;
  }
  return out;
}

/**
 * Ocean glints — tiny dots scattered over the SEA of the same globe. Samples the
 * sphere area-uniformly and keeps points where the land mask is water, using the
 * identical India-front + tilt orientation and radius as makeWorldGlobe, so they
 * fill the empty water between the continents and the whole sphere reads as Earth.
 */
function makeGlobeOcean(n: number, radius: number): Float32Array {
  const out = new Float32Array(n * 3);
  if (typeof document === "undefined") return out;
  const W = 360;
  const H = 180;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  drawWorldMap(ctx, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  const lon0 = (INDIA_LON * Math.PI) / 180;
  const tilt = (GLOBE_TILT_DEG * Math.PI) / 180;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let i = 0; i < n; i++) {
    let lat = 0;
    let lon = 0;
    for (let tries = 0; tries < 12; tries++) {
      lon = Math.random() * 2 * Math.PI - Math.PI;
      lat = Math.asin(2 * Math.random() - 1); // area-uniform over the sphere
      const px = Math.min(W - 1, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * W));
      const py = Math.min(H - 1, Math.floor(((Math.PI / 2 - lat) / Math.PI) * H));
      if (data[(py * W + px) * 4 + 3] <= 100) break; // keep only sea pixels
    }
    const lam = lon - lon0;
    const cl = Math.cos(lat);
    const x0 = radius * cl * Math.sin(lam);
    const y0 = radius * Math.sin(lat);
    const z0 = radius * cl * Math.cos(lam);
    out[i * 3] = x0;
    out[i * 3 + 1] = y0 * ct - z0 * st;
    out[i * 3 + 2] = y0 * st + z0 * ct;
  }
  return out;
}

/**
 * Rasterize a 2D shape (drawn by `draw`) to an offscreen canvas, then sample N
 * points and INFLATE them into a real 3D volume: a distance transform gives
 * each pixel its distance to the silhouette edge, and z is set to
 * ±sqrt(dist)·inflate — thick through the middle, thin at the rim — so a flat
 * outline becomes a rounded, volumetric body. `wrinkle` adds surface bumpiness
 * (gyri) for the brain. Sampling is biased toward the crisp edge + the fill.
 */
function sampleSilhouette(
  draw: (ctx: CanvasRenderingContext2D, S: number) => void,
  n: number,
  scale: number,
  inflate: number,
  wrinkle = 0
): Float32Array {
  const out = new Float32Array(n * 3);
  if (typeof document === "undefined") return out;

  const S = 240;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;

  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = "#fff";
  draw(ctx, S);
  const data = ctx.getImageData(0, 0, S, S).data;
  const solid = new Uint8Array(S * S);
  for (let idx = 0; idx < S * S; idx++) solid[idx] = data[idx * 4 + 3] > 100 ? 1 : 0;
  const op = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : solid[y * S + x]);

  // distance-to-edge via two-pass chamfer transform
  const INF = 1e9;
  const D = 1;
  const D2 = 1.4142;
  const dist = new Float32Array(S * S);
  for (let idx = 0; idx < S * S; idx++) dist[idx] = solid[idx] ? INF : 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const idx = y * S + x;
      if (!solid[idx]) continue;
      let d = dist[idx];
      if (x > 0) d = Math.min(d, dist[idx - 1] + D);
      if (y > 0) d = Math.min(d, dist[idx - S] + D);
      if (x > 0 && y > 0) d = Math.min(d, dist[idx - S - 1] + D2);
      if (x < S - 1 && y > 0) d = Math.min(d, dist[idx - S + 1] + D2);
      dist[idx] = d;
    }
  }
  const edge: number[] = [];
  const fill: number[] = [];
  let maxD = 1;
  for (let y = S - 1; y >= 0; y--) {
    for (let x = S - 1; x >= 0; x--) {
      const idx = y * S + x;
      if (!solid[idx]) continue;
      let d = dist[idx];
      if (x < S - 1) d = Math.min(d, dist[idx + 1] + D);
      if (y < S - 1) d = Math.min(d, dist[idx + S] + D);
      if (x < S - 1 && y < S - 1) d = Math.min(d, dist[idx + S + 1] + D2);
      if (x > 0 && y < S - 1) d = Math.min(d, dist[idx + S - 1] + D2);
      dist[idx] = d;
      if (d > maxD) maxD = d;
      const isEdge = !op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1);
      (isEdge ? edge : fill).push(x, y);
    }
  }

  const edgeN = edge.length / 2;
  const fillN = fill.length / 2;
  for (let i = 0; i < n; i++) {
    let sx: number, sy: number;
    const useEdge = edgeN > 0 && (fillN === 0 || Math.random() < 0.4);
    if (useEdge) {
      const k = Math.floor(Math.random() * edgeN) * 2;
      sx = edge[k];
      sy = edge[k + 1];
    } else if (fillN > 0) {
      const k = Math.floor(Math.random() * fillN) * 2;
      sx = fill[k];
      sy = fill[k + 1];
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.42;
      out[i * 3] = Math.cos(a) * r * scale;
      out[i * 3 + 1] = Math.sin(a) * r * scale;
      out[i * 3 + 2] = 0;
      continue;
    }
    // inflate: spherical-cap thickness from the distance field
    const thickness = Math.sqrt(dist[sy * S + sx] / maxD) * inflate;
    let z = (Math.random() * 2 - 1) * thickness;
    if (wrinkle > 0) {
      z += (Math.sin(sx * 0.28) * Math.sin(sy * 0.26) + Math.sin((sx + sy) * 0.17)) * wrinkle;
    }
    out[i * 3] = (sx / S - 0.5) * scale;
    out[i * 3 + 1] = -(sy / S - 0.5) * scale;
    out[i * 3 + 2] = z;
  }
  return out;
}

// --- 2D drawers (unit canvas of size S, shape centered) ---

function drawBrackets(ctx: CanvasRenderingContext2D, S: number) {
  ctx.font = `900 ${Math.floor(S * 0.5)}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("</>", S / 2, S / 2 + S * 0.02);
}

/** Curly braces { } — a clean code glyph (like </>), rasterized from the same
 *  monospace face so it reads crisply as a point cloud. */
function drawBraces(ctx: CanvasRenderingContext2D, S: number) {
  ctx.font = `900 ${Math.floor(S * 0.52)}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("{ }", S / 2, S / 2 + S * 0.02);
}

/** Cog/gear — a body disc ringed by radial teeth, with a bored-out hub. The
 *  teeth are rotated rectangles laid around the rim; the hub is carved last. */
function drawGear(ctx: CanvasRenderingContext2D, S: number) {
  const cx = 0.5 * S;
  const cy = 0.5 * S;
  const rBody = 0.22 * S; // solid disc radius
  const rTip = 0.31 * S; // outer radius at the tooth tips
  const teeth = 9;
  const toothW = 0.085 * S; // tangential tooth width
  // teeth first (rotated rects reaching from just inside the body out to rTip)
  for (let i = 0; i < teeth; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i / teeth) * Math.PI * 2);
    ctx.fillRect(-toothW / 2, -rTip, toothW, rTip - rBody + 0.04 * S);
    ctx.restore();
  }
  // body disc
  ctx.beginPath();
  ctx.arc(cx, cy, rBody, 0, Math.PI * 2);
  ctx.fill();
  // hub bore (carve)
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx, cy, 0.085 * S, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

/** Five-point star — a clean filled polygon (outer/inner radii), pointing up.
 *  Simple and crisp as a point cloud, distinct from the code glyphs. */
function drawStar(ctx: CanvasRenderingContext2D, S: number) {
  const cx = 0.5 * S;
  const cy = 0.5 * S;
  const rOuter = 0.31 * S;
  const rInner = 0.135 * S;
  const tips = 5;
  ctx.beginPath();
  for (let i = 0; i < tips * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = -Math.PI / 2 + (i * Math.PI) / tips; // first tip at the top
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- sprite
/**
 * A soft round sprite (radial alpha) shared by every point cloud. Raw
 * THREE.PointsMaterial draws SQUARE points; mapping this texture as the
 * material's alpha clips each quad to a feathered disc — so the stars and the
 * morphing model read as round glints rather than little squares. The white
 * fill is multiplied by each point's vertex color, so the palette is preserved.
 */
function makeDotTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(0.75, "rgba(255,255,255,0.25)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- palette
function buildColors(n: number, dark: boolean): Float32Array {
  // Shades of violet around the Plum Voltage brand (#8052ff), keyed to the
  // site: a near-white lavender core (the beam's bright head), then pale →
  // light → brand → deep-indigo → orchid violets, plus a sparse Lichen-teal
  // glint (the beam's mid-stop, --brand-2). No off-palette amber/magenta.
  const dpal = ["#f3f1ff", "#c9b8ff", "#a78bff", "#8052ff", "#6d4dff", "#b46cff", "#46c2a6"];
  const lpal = ["#2a2540", "#5b46c9", "#7c5cf0", "#6b3df0", "#4f3cc4", "#8e4fe0", "#17977c"];
  const pal = (dark ? dpal : lpal).map((h) => new THREE.Color(h));
  // weight toward the brand violet; teal stays a rare accent (1 in 9)
  const weighted = [pal[0], pal[1], pal[2], pal[3], pal[3], pal[3], pal[4], pal[5], pal[6]];
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = weighted[Math.floor(Math.random() * weighted.length)];
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

// ---------------------------------------------------------------- scene

function Constellation({ animate, dark }: { animate: boolean; dark: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const oceanRef = useRef<THREE.Points>(null); // tiny sea dots, only shown on the globe

  const seg = useRef(0); // target segment (i + f) from scroll
  const segSmooth = useRef(0);
  const centers = useRef<number[]>([]);
  const pointer = useRef({ x: 0, y: 0, active: false });
  const hover = useRef(0);
  // eased cursor yaw, kept apart from inner.rotation.y so the first-gap Y spin
  // (rollY) can be added on top without the easing dragging it back down
  const tiltY = useRef(0);
  // reused each frame to unproject the cursor into the cloud's local space
  const cursorLocal = useMemo(() => new THREE.Vector3(), []);

  const shapes = useMemo(() => {
    const s = {
      // (draw, scale, inflate, wrinkle) — inflate puffs the flat outline into 3D
      brackets: sampleSilhouette(drawBrackets, POINT_COUNT, 4.0 * MODEL_SCALE, 0.5 * MODEL_SCALE),
      gear: sampleSilhouette(drawGear, POINT_COUNT, 4.0 * MODEL_SCALE, 0.7 * MODEL_SCALE),
      braces: sampleSilhouette(drawBraces, POINT_COUNT, 4.0 * MODEL_SCALE, 0.5 * MODEL_SCALE),
      star: sampleSilhouette(drawStar, POINT_COUNT, 4.0 * MODEL_SCALE, 0.6 * MODEL_SCALE),
      // smaller than the other shapes so the whole India-facing sphere fits in
      // the open space beside the Contact cards (the eastern/Asia side would
      // otherwise run off the right edge when docked).
      globe: makeWorldGlobe(POINT_COUNT, 1.5 * MODEL_SCALE),
    };
    // recenter every shape vertically so each reads as centered on screen — except
    // the globe, a sphere already centered at the origin that must stay there so
    // the separate ocean-dot sphere lines up with it.
    (Object.keys(s) as (keyof typeof s)[]).forEach((key) => {
      if (key !== "globe") centerY(s[key]);
    });
    return s as Record<(typeof ORDER)[number], Float32Array>;
  }, []);

  // live render buffer + smoothed positions, seeded at the hero </> brackets
  const positions = useMemo(() => Float32Array.from(shapes.brackets), [shapes]);
  const colors = useMemo(() => buildColors(POINT_COUNT, dark), [dark]);

  // static sea dots on the same sphere/radius as the world globe (not centered,
  // matching the globe shape) — faded in only while the globe is on screen
  const oceanPos = useMemo(() => makeGlobeOcean(OCEAN_COUNT, 1.5 * MODEL_SCALE), []);

  // soft round sprite shared by both clouds (clips the default square points)
  const dot = useMemo(makeDotTexture, []);
  useEffect(() => () => dot?.dispose(), [dot]);

  // per-point size multipliers (1 = base). The hover lens writes >1 here for
  // points near the cursor each frame so they render larger than their neighbours.
  const sizes = useMemo(() => {
    const a = new Float32Array(POINT_COUNT);
    a.fill(1);
    return a;
  }, []);

  // per-point shimmer phase (random) — each point twinkles on its own offset
  const phases = useMemo(() => {
    const a = new Float32Array(POINT_COUNT);
    for (let i = 0; i < POINT_COUNT; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, []);

  // Custom points material so size can vary PER POINT — THREE.PointsMaterial only
  // exposes one global size. It reproduces the PointsMaterial look: vertex color ×
  // soft sprite alpha, perspective size attenuation (uScale/-z, matching three's
  // own formula), theme-aware additive/normal blend. It also adds the slow
  // per-particle shimmer (brightness drift). uSize/uScale/uOpacity/uTime are
  // refreshed each frame in useFrame.
  const modelMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: dot },
        uSize: { value: 0.05 },
        uScale: { value: 300 },
        uOpacity: { value: dark ? 0.95 : 0.85 },
        uTime: { value: 0 },
        uShimmer: { value: 1 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        uniform float uSize;
        uniform float uScale;
        uniform float uTime;
        uniform float uShimmer;
        varying vec3 vColor;
        void main() {
          // slow per-particle brightness drift (per-point phase + speed jitter)
          float spd = ${SHIMMER_FREQ.toFixed(3)} * (0.6 + 0.8 * fract(aPhase * 0.31831));
          float s = ${SHIMMER_MIN.toFixed(3)} + ${(1 - SHIMMER_MIN).toFixed(3)} * (0.5 + 0.5 * sin(uTime * spd + aPhase));
          float bright = mix(1.0, s, uShimmer);
          vColor = aColor * bright;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * aSize * (uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(vColor, uOpacity * tex.a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }, [dot, dark]);
  useEffect(() => () => modelMaterial.dispose(), [modelMaterial]);

  // normalized scatter field ([-1,1]) — scaled by the live viewport each frame
  const scatter = useMemo(() => {
    const a = new Float32Array(POINT_COUNT * 3);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return a;
  }, []);

  // fixed node-graph links
  const linkPairs = useMemo(() => {
    const arr = new Int32Array(POINT_COUNT * LINKS_PER_POINT * 2);
    for (let i = 0; i < POINT_COUNT; i++) {
      for (let k = 0; k < LINKS_PER_POINT; k++) {
        const j = (i + 1 + k * 41 + ((i * 7) % 17)) % POINT_COUNT;
        const slot = (i * LINKS_PER_POINT + k) * 2;
        arr[slot] = i;
        arr[slot + 1] = j;
      }
    }
    return arr;
  }, []);
  const linkPositions = useMemo(
    () => new Float32Array(POINT_COUNT * LINKS_PER_POINT * 2 * 3),
    []
  );

  // ---- starfield (always on) ----
  // Laid out exactly like the deployed (main-branch) hero point cloud: a soft
  // sphere centered at the origin (radius ~2.2–4.8). Centering it here is what
  // makes the constant tumble read as a rotating globe of stars rather than a
  // sparse field shearing past — i.e. the "same motion and position" as main.
  const starPos = useMemo(() => {
    const a = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 2.2 + Math.cbrt(Math.random()) * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      a[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      a[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      a[i * 3 + 2] = r * Math.cos(phi);
    }
    return a;
  }, []);
  const starColors = useMemo(() => buildColors(STAR_COUNT, dark), [dark]);
  // per-star shimmer phase — the same per-particle brightness drift the model
  // uses, so the background twinkles independently instead of pulsing as one.
  const starPhases = useMemo(() => {
    const a = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, []);
  const stars = useRef<THREE.Points>(null);
  const starParallax = useRef<THREE.Group>(null);

  // Star material — mirrors the model's shimmer shader (per-particle brightness
  // drift via aPhase/uTime/uShimmer) but with a single uniform point size (no
  // hover lens on the background). uSize/uScale/uOpacity/uTime refresh per frame.
  const starMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: dot },
        uSize: { value: dark ? 0.032 : 0.03 },
        uScale: { value: 300 },
        uOpacity: { value: dark ? 0.85 : 0.6 },
        uTime: { value: 0 },
        uShimmer: { value: 1 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aPhase;
        uniform float uSize;
        uniform float uScale;
        uniform float uTime;
        uniform float uShimmer;
        varying vec3 vColor;
        void main() {
          // slow per-particle brightness drift (per-point phase + speed jitter)
          float spd = ${SHIMMER_FREQ.toFixed(3)} * (0.6 + 0.8 * fract(aPhase * 0.31831));
          float s = ${SHIMMER_MIN.toFixed(3)} + ${(1 - SHIMMER_MIN).toFixed(3)} * (0.5 + 0.5 * sin(uTime * spd + aPhase));
          float bright = mix(1.0, s, uShimmer);
          vColor = aColor * bright;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          if (tex.a < 0.02) discard;
          gl_FragColor = vec4(vColor, uOpacity * tex.a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }, [dot, dark]);
  useEffect(() => () => starMaterial.dispose(), [starMaterial]);

  // ---- scroll + pointer ----
  useEffect(() => {
    if (!animate || typeof window === "undefined") return;
    const ids = ["top", "about", "skills", "experience", "projects", "education", "contact"];
    const measure = () => {
      const cs: number[] = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          const r = el.getBoundingClientRect();
          cs.push(r.top + window.scrollY + r.height / 2);
        }
      }
      centers.current = cs;
    };
    const onScroll = () => {
      const cs = centers.current;
      const vc = window.scrollY + window.innerHeight / 2;
      if (cs.length < 2) {
        seg.current = 0;
        return;
      }
      if (vc <= cs[0]) seg.current = 0;
      else if (vc >= cs[cs.length - 1]) seg.current = cs.length - 1;
      else {
        for (let k = 0; k < cs.length - 1; k++) {
          if (vc >= cs[k] && vc < cs[k + 1]) {
            seg.current = k + (vc - cs[k]) / (cs[k + 1] - cs[k]);
            break;
          }
        }
      }
    };
    const onPointer = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.current.active = true;
    };
    measure();
    onScroll();
    const t1 = window.setTimeout(measure, 400);
    const t2 = window.setTimeout(() => { measure(); onScroll(); }, 1200);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [animate]);

  useFrame((state: RootState, delta: number) => {
    if (!pointsRef.current) return;
    const k = Math.min(1, delta * 5);

    // entry: assemble from the scatter field over ~1.6s
    const entry = animate ? easeOutCubic(clamp01(state.clock.elapsedTime / 1.6)) : 1;

    // smooth the scroll segment — a gentler factor than `k` so the cloud eases
    // between shapes over more scroll distance instead of snapping
    const segK = Math.min(1, delta * 2.2);
    segSmooth.current += (seg.current - segSmooth.current) * segK;
    const last = ORDER.length - 1;
    let i = Math.floor(segSmooth.current);
    if (i < 0) i = 0;
    if (i > last) i = last;
    // Hold the docked shape across part of a section; the morph + scatter run in
    // a WIDE band around the boundary so the transition reads smooth, not snappy.
    // (Widen/narrow the [lo, hi] window to lengthen/shorten the whole crossover.)
    const p = i >= last ? 0 : clamp01(segSmooth.current - i);
    const tt = p <= 0.12 ? 0 : p >= 0.88 ? 1 : (p - 0.12) / 0.76;
    const next = Math.min(i + 1, last);
    const a = shapes[ORDER[i]];
    const b = shapes[ORDER[next]];
    const mf = easeInOut(tt);
    // A gap between two IDENTICAL adjacent shapes (Hero↔About </>, Projects↔
    // Education brain) spins about the vertical Y axis instead of scattering: the
    // morph is a no-op there, so a clean turn reads better than a dissolve.
    // Mixed-shape gaps scatter as before (env drives the full-screen spread).
    const spinGap = ORDER[i] === ORDER[next];
    // scatter envelope — a bell over the crossover. Fed the EASED mf (not raw tt)
    // so it leaves/returns to rest with zero velocity: particles ease outward and
    // ease back in smoothly instead of jolting at the start/end of the burst.
    const env = animate && !spinGap ? Math.sin(Math.PI * mf) : 0;
    // 0 → 2π across a spin gap (eased to match the morph). A FULL turn, not a
    // half: a 180° turn about Y would land on the mirrored back face and snap at
    // the boundary. rollY drops to 0 at the next section, but tt has saturated to
    // 1 by then so the spin is already a full 2π — and a full turn == 0, so the
    // reset is imperceptible and later shapes stay upright.
    const rollY = spinGap ? 2 * Math.PI * mf : 0;
    // how much of the CURRENT blended shape is the world globe (0..1). The
    // node-link web reads as clutter over a map, so links fade out as it forms.
    const globeness =
      (ORDER[i] === "globe" ? 1 - mf : 0) + (ORDER[next] === "globe" ? mf : 0);

    // hover detect — is the cursor over the docked cloud's bounding region?
    // Generous thresholds just GATE the lens on/off; the per-point falloff below
    // is what actually keeps it confined to the patch under the pointer.
    const vw = state.viewport.width;
    const vh = state.viewport.height;
    const mobile = state.size.width < 1024;
    const dock = mobile ? 0 : lerp(sideSign(i) * vw * dockFrac(i), sideSign(next) * vw * dockFrac(next), tt);
    const centerNdcX = vw > 0 ? (dock * (1 - env)) / (vw / 2) : 0;
    const near =
      pointer.current.active &&
      Math.abs(pointer.current.x - centerNdcX) < 0.9 &&
      Math.abs(pointer.current.y) < 0.8;
    hover.current += ((near && !mobile ? 1 : 0) - hover.current) * Math.min(1, delta * 4);

    // Scatter spread — how far particles disperse at the peak of a transition.
    // Pushed well past the viewport edges (x/y) and deeper in z for a dramatic
    // full-screen burst before they reassemble into the next shape.
    const sx = vw * 0.85;
    const sy = vh * 0.85;
    const sz = 3.0;

    // hover lens: project the cursor into the cloud's own space so the magnified
    // patch tracks the pointer wherever it sits over the model. Gated off while
    // scattered/assembling via (1 - env) * entry. Using last frame's matrixWorld
    // is fine — the tilt eases far slower than a single frame.
    const lens = hover.current * (1 - env) * entry;
    let lcx = 1e9, lcy = 0;
    if (lens > 0.001 && inner.current && vw > 0) {
      cursorLocal.set((pointer.current.x * vw) / 2, (pointer.current.y * vh) / 2, 0);
      inner.current.worldToLocal(cursorLocal);
      lcx = cursorLocal.x;
      lcy = cursorLocal.y;
    }

    for (let p = 0; p < POINT_COUNT; p++) {
      const ix = p * 3;
      const iy = ix + 1;
      const iz = ix + 2;
      // morphed shape (lerp between the two active shapes)
      let mx = lerp(a[ix], b[ix], mf);
      let my = lerp(a[iy], b[iy], mf);
      let mz = lerp(a[iz], b[iz], mf);
      // hover lens: points near the cursor swell (grow) and part outward (spread)
      // to make room for the larger dots — strongest at the cursor, 0 at the rim.
      let grow = 0;
      if (lens > 0.001) {
        // 2D (screen-plane) distance — ignore depth so the lens reaches points at
        // ANY z under the cursor. Essential for the hollow globe shell, whose
        // surface points otherwise all sit ~radius away from a z=0 cursor in 3D.
        const dx = mx - lcx;
        const dy = my - lcy;
        const cd2 = dx * dx + dy * dy;
        if (cd2 < HOVER_R2) {
          const cd = Math.sqrt(cd2) || 1e-4;
          const f = 1 - cd / HOVER_RADIUS; // 1 at cursor → 0 at the rim
          const ff = f * f;
          grow = HOVER_GROW * ff * lens; // bigger dots under the pointer
          const spread = (HOVER_SPREAD * ff * lens) / cd; // part them to make room
          mx += dx * spread;
          my += dy * spread;
        }
      }
      sizes[p] = 1 + grow;
      // scatter blend
      const ex = lerp(mx, scatter[ix] * sx, env);
      const ey = lerp(my, scatter[iy] * sy, env);
      const ez = lerp(mz, scatter[iz] * sz, env);
      // entry blend (from dispersed → assembled)
      positions[ix] = lerp(scatter[ix] * sx, ex, entry);
      positions[iy] = lerp(scatter[iy] * sy, ey, entry);
      positions[iz] = lerp(scatter[iz] * sz, ez, entry);
    }
    (pointsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (pointsRef.current.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;

    // links follow live positions; fade out while scattered
    if (linesRef.current) {
      const lp = linkPositions;
      const np = linkPairs.length / 2;
      for (let l = 0; l < np; l++) {
        const ai = linkPairs[l * 2] * 3;
        const bi = linkPairs[l * 2 + 1] * 3;
        const o = l * 6;
        lp[o] = positions[ai];
        lp[o + 1] = positions[ai + 1];
        lp[o + 2] = positions[ai + 2];
        lp[o + 3] = positions[bi];
        lp[o + 4] = positions[bi + 1];
        lp[o + 5] = positions[bi + 2];
      }
      (linesRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const lm = linesRef.current.material as THREE.LineBasicMaterial;
      // very faint — links hint at a network without filling the silhouette;
      // fully faded on the world globe, where the web would obscure the land.
      lm.opacity = (dark ? 0.04 : 0.03) * (1 - env) * entry * (1 - globeness);
    }

    // ocean sea-dots: only on the settled globe — fade in with globeness, gated
    // off during the scatter (1 - env) so they don't appear while it's dispersed.
    if (oceanRef.current) {
      const om = oceanRef.current.material as THREE.PointsMaterial;
      om.opacity = (dark ? 0.5 : 0.4) * globeness * (1 - env) * entry;
    }

    // drive the custom material: base size (DPR + perspective attenuation, matching
    // three's PointsMaterial formula so the look is unchanged), plus entry/mobile
    // dimmed opacity. Base size nudged up a touch to keep the larger model from
    // reading as too sparse.
    const mu = modelMaterial.uniforms;
    mu.uSize.value = (dark ? 0.055 : 0.05) * state.gl.getPixelRatio();
    mu.uScale.value = state.size.height * 0.5;
    mu.uOpacity.value = (dark ? 0.95 : 0.85) * entry * (mobile ? 0.55 : 1);
    mu.uTime.value = state.clock.elapsedTime;
    mu.uShimmer.value = animate ? 1 : 0;

    // outer = horizontal dock + per-section scale (the hero </> is enlarged, all
    // else 1; the scale eases to 1 across the first gap so the spin shrinks the
    // big hero glyph into the smaller docked About one). NO auto-rotation / bob.
    if (outer.current) {
      outer.current.position.x = dock * (1 - env) * entry;
      outer.current.position.y = 0;
      outer.current.scale.setScalar(i === 0 ? lerp(HERO_SCALE, 1, tt) : 1);
    }
    // inner = a SLIGHT tilt toward the cursor (the form barely moves), plus the
    // first-gap Y spin. The eased yaw lives in tiltY; rotation.y = yaw + rollY is
    // set DIRECTLY so the 2π → 0 reset at the section-1 boundary snaps invisibly
    // (a full turn looks the same as none).
    if (inner.current) {
      const tx = animate ? -pointer.current.y * 0.1 : 0;
      const ty = animate ? pointer.current.x * 0.12 : 0;
      inner.current.rotation.x += (tx - inner.current.rotation.x) * k;
      tiltY.current += (ty - tiltY.current) * k;
      inner.current.rotation.y = tiltY.current + rollY;
    }

    // starfield motion — replicated verbatim from the deployed (main-branch)
    // hero scene: a constant slow tumble on the cloud itself, plus a gentle
    // pointer parallax applied as ROTATION on its wrapper group. No positional
    // translation, so the field stays centered exactly as it did on main.
    if (stars.current && animate) {
      stars.current.rotation.y += delta * 0.04;
      stars.current.rotation.x += delta * 0.012;
    }
    if (starParallax.current) {
      const ty = animate ? pointer.current.x * 0.2 : 0;
      const tx = animate ? pointer.current.y * 0.12 : 0;
      starParallax.current.rotation.y += (ty - starParallax.current.rotation.y) * 0.04;
      starParallax.current.rotation.x += (tx - starParallax.current.rotation.x) * 0.04;
    }
    // drive the star shimmer shader — same per-particle drift as the model. Size
    // matches three's PointsMaterial attenuation (base size × DPR, height·0.5/-z),
    // so the stars look unchanged except that each now twinkles on its own phase.
    const su = starMaterial.uniforms;
    su.uSize.value = (dark ? 0.032 : 0.03) * state.gl.getPixelRatio();
    su.uScale.value = state.size.height * 0.5;
    su.uOpacity.value = (dark ? 0.85 : 0.6) * entry;
    su.uTime.value = state.clock.elapsedTime;
    su.uShimmer.value = animate ? 1 : 0;
  });

  return (
    <>
      {/* persistent starfield (independent of the morphing cloud). The wrapper
          group carries the pointer parallax (rotation); the points tumble
          constantly inside it — same composition as the deployed hero scene. */}
      <group ref={starParallax}>
        <points ref={stars} material={starMaterial} frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[starPos, 3]} />
            <bufferAttribute attach="attributes-aColor" args={[starColors, 3]} />
            <bufferAttribute attach="attributes-aPhase" args={[starPhases, 1]} />
          </bufferGeometry>
        </points>
      </group>

      <group ref={outer}>
        <group ref={inner}>
          <points ref={pointsRef} material={modelMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[positions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
            </bufferGeometry>
          </points>
          <lineSegments ref={linesRef} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[linkPositions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial
              color={dark ? "#8052ff" : "#6b3df0"}
              transparent
              opacity={dark ? 0.09 : 0.07}
              depthWrite={false}
              blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
          </lineSegments>
          {/* tiny sea dots filling the ocean of the world globe (opacity driven
              per-frame by globeness — invisible on every other shape) */}
          <points ref={oceanRef} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[oceanPos, 3]} />
            </bufferGeometry>
            <pointsMaterial
              map={dot ?? undefined}
              color={dark ? "#ffffff" : "#64748b"}
              size={dark ? 0.02 : 0.018}
              sizeAttenuation
              transparent
              opacity={0}
              depthWrite={false}
              blending={dark ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
          </points>
        </group>
      </group>
    </>
  );
}

export default function ParticleField() {
  const reduced = useReducedMotion();
  const animate = !reduced;
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";

  return (
    <Canvas
      className="absolute inset-0"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 6], fov: 45 }}
      frameloop={animate ? "always" : "demand"}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      {/* keyed by theme so palette + blending rebuild cleanly on toggle */}
      <Constellation key={dark ? "dark" : "light"} animate={animate} dark={dark} />
    </Canvas>
  );
}
