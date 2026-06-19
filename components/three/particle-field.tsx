"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { setModelTransitioning } from "@/components/three/model-phase";

/**
 * ParticleField — the "Dala" constellation, ported and choreographed.
 *
 * One cloud of ~2400 particles that TRAVELS and MORPHS as the page scrolls. It
 * docks to alternating sides per section, and SCATTERS full-screen in the gaps
 * between sections before reassembling on the opposite side as the next shape:
 *
 *   brain → brain → gear → { } → </> → </> → globe
 *
 * Gaps between two IDENTICAL shapes (Hero↔About brain, Projects↔Education </>)
 * are special: instead of scattering they spin a full 360° about the vertical Y
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

// Shared by every morph shape (one cloud morphs between them, so they all use the
// same count). Bumped well past the original 2400 so the brain's gyri/sulci read
// as real structure instead of a sparse scatter — which only makes the glyphs and
// the globe morph cloud richer too. The per-frame morph/links loops are O(this);
// 9000 is still trivial on the CPU.
const POINT_COUNT = 9000;
const STAR_COUNT = 3500;
// white sea dots that fill the ocean between continents on the world globe —
// denser than the land so the sea reads as a full surface, randomly scattered
const OCEAN_COUNT = 6000;
const LINKS_PER_POINT = 1;

// Overall size of the morphing model. Bump this to scale every shape together;
// the starfield and the full-screen scatter spread are deliberately left
// independent of it so only the docked object grows.
const MODEL_SCALE = 1.35;

// Radius of the world-globe shell (land + ocean dots sit on it). Kept as
// a named constant because the hover lens also needs it: the globe's lit face
// sits at z≈+GLOBE_RADIUS, which the cursor projection must account for.
const GLOBE_RADIUS = 1.5 * MODEL_SCALE;

// Per-section-0 scale: the hero (first) brain is enlarged as the page's headline
// mark, easing to 1 across the first gap so the Hero→About spin shrinks it to the
// docked About size. Trimming the stem freed the headroom to enlarge it again
// without overflowing the viewport. Raise/lower to taste.
const HERO_SCALE = 1.5;

// Hover "lens": every point within HOVER_RADIUS (cloud-local units; the model
// spans ~±2.7 after MODEL_SCALE) of the cursor swells to (1 + HOVER_GROW)× its
// base size and is parted outward by HOVER_SPREAD to make room for the larger
// dots. Strongest right under the pointer, easing to zero at the rim. The cursor
// is projected onto the shape's front-surface depth (see refZ in useFrame) so the
// magnified patch tracks the pointer even on the off-centre, z-offset globe.
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
// Adjacent IDENTICAL shapes (Hero/About brain, Projects/Education </>) spin about
// the Y axis between sections instead of scattering — see rollY / spinGap below.
const ORDER = ["brain", "brain", "gear", "braces", "brackets", "brackets", "globe"] as const;

// The Hero/About brain is sampled from a real anatomical mesh (/models/brain.glb);
// until it loads (or if the fetch fails) a procedural silhouette stands in. The
// mesh is normalized so its LARGEST dimension == BRAIN_SPAN; kept smaller than the
// glyphs' 4.0·MODEL_SCALE span because the brain fills its whole silhouette (the
// glyphs don't) — an equal span overflowed the viewport on the hero.
const BRAIN_SPAN = 2.6 * MODEL_SCALE;
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

// Real coastline geometry, loaded lazily from /data/land-110m.json (Natural
// Earth 1:110m, public domain): an array of polygons, each an array of rings
// (ring 0 = outer, the rest = holes/lakes), each ring an array of [lon, lat].
// Null until the fetch resolves (and on SSR / fetch failure), in which case the
// globe falls back to the coarse hand-coded polygons in drawWorldMapFallback.
type Ring = number[][];
type Polygon = Ring[];
let WORLD_LAND: Polygon[] | null = null;

/** Equirectangular (lon, lat)→pixel mapping shared by the map drawers. */
const lonLatToXY = (lon: number, lat: number, W: number, H: number): [number, number] => [
  ((lon + 180) / 360) * W,
  ((90 - lat) / 180) * H,
];

/**
 * Render the loaded Natural Earth land polygons as filled white land over a
 * transparent ocean. Every ring is added to one path and filled with the
 * even-odd rule, so holes (e.g. the Caspian) read as water and disjoint
 * continents fill independently. Antarctica's [180,-90]→[-180,-90] edge draws
 * along the bottom row, correctly filling the cap down to the pole.
 */
function drawLandGeo(ctx: CanvasRenderingContext2D, W: number, H: number, polys: Polygon[]) {
  ctx.beginPath();
  for (const rings of polys) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = lonLatToXY(ring[i][0], ring[i][1], W, H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  ctx.fill("evenodd");
}

/**
 * Equirectangular world map: filled white land over transparent ocean. Prefers
 * the accurate Natural Earth coastlines once loaded; until then it falls back to
 * the coarse hand-authored polygons below. The globe samples this mask into dots,
 * so continent SHAPES read (not borders).
 */
function drawWorldMap(ctx: CanvasRenderingContext2D, W: number, H: number) {
  if (WORLD_LAND) {
    drawLandGeo(ctx, W, H, WORLD_LAND);
    return;
  }
  drawWorldMapFallback(ctx, W, H);
}

/**
 * Coarse hand-authored fallback (approximate, ~15 vertices per continent) used
 * only before the Natural Earth data loads or if that fetch fails — so the globe
 * always has sensible land rather than a blank or uniform sphere.
 */
function drawWorldMapFallback(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const P = (lon: number, lat: number): [number, number] => lonLatToXY(lon, lat, W, H);
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

// Dense LAND FILL — the morph cloud's land is only POINT_COUNT dots (far too
// sparse), so the continents are filled by a separate dense cloud of randomly
// scattered land dots (see sampleGlobeRandom).
const LANDFILL_COUNT = 48000;

/**
 * Random globe sampler. Rejection-samples uniform-random points on the sphere
 * (equal-area: z uniform in [-1,1], longitude uniform) and keeps those that pass
 * `keep` against the Natural Earth land mask, until `target` points are gathered.
 * The scatter is deliberately RANDOM — natural clumps and gaps, like a starfield —
 * rather than a regular lattice. Positions are rotated so India faces the camera
 * (+z) and pitched by GLOBE_TILT_DEG, matching every globe layer.
 */
function sampleGlobeRandom(
  target: number,
  radius: number,
  keep: (isLand: (lonDeg: number, latDeg: number) => boolean, lonDeg: number, latDeg: number) => boolean
): Float32Array {
  const out = new Float32Array(target * 3);
  if (typeof document === "undefined") return out;
  const W = 720;
  const H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return out;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  drawWorldMap(ctx, W, H);
  const data = ctx.getImageData(0, 0, W, H).data;
  // land test in degrees; longitude wraps at the antimeridian, latitude clamps
  const isLand = (lonDeg: number, latDeg: number) => {
    let px = Math.floor(((lonDeg + 180) / 360) * W);
    let py = Math.floor(((90 - latDeg) / 180) * H);
    px = ((px % W) + W) % W;
    py = py < 0 ? 0 : py >= H ? H - 1 : py;
    return data[(py * W + px) * 4 + 3] > 100;
  };
  const lon0 = (INDIA_LON * Math.PI) / 180;
  const tilt = (GLOBE_TILT_DEG * Math.PI) / 180;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  let filled = 0;
  // cap tries so a degenerate (empty) mask can't spin forever; normally the loop
  // exits far sooner (land ≈ 3-4 tries/point, ocean ≈ 1.5).
  const maxTries = target * 80 + 100000;
  for (let t = 0; filled < target && t < maxTries; t++) {
    const z = Math.random() * 2 - 1; // equal-area latitude
    const lat = Math.asin(z);
    let lon = Math.random() * 2 * Math.PI;
    if (lon > Math.PI) lon -= 2 * Math.PI; // [-π, π]
    if (!keep(isLand, (lon * 180) / Math.PI, (lat * 180) / Math.PI)) continue;
    const lam = lon - lon0; // longitude relative to India (front = +z)
    const cl = Math.cos(lat);
    const x0 = radius * cl * Math.sin(lam);
    const y0 = radius * Math.sin(lat);
    const z0 = radius * cl * Math.cos(lam);
    out[filled * 3] = x0;
    out[filled * 3 + 1] = y0 * ct - z0 * st; // pitch about X (Asia toward the camera)
    out[filled * 3 + 2] = y0 * st + z0 * ct;
    filled++;
  }
  return out;
}

/** World globe — random land dots scattered over every landmass. */
function makeWorldGlobe(n: number, radius: number): Float32Array {
  return sampleGlobeRandom(n, radius, (isLand, lon, lat) => isLand(lon, lat));
}

/** Dense land fill — the SAME random land sampling at a much higher count so the
 *  continents read as filled. A separate cloud; the sparse POINT_COUNT morph globe
 *  stays only to drive the transition. */
function makeGlobeLandFill(n: number, radius: number): Float32Array {
  return sampleGlobeRandom(n, radius, (isLand, lon, lat) => isLand(lon, lat));
}

/** Ocean glints — random points scattered over the sea (the land's complement). */
function makeGlobeOcean(n: number, radius: number): Float32Array {
  return sampleGlobeRandom(n, radius, (isLand, lon, lat) => !isLand(lon, lat));
}

/**
 * Trim the thin brainstem/spinal stub off a non-indexed triangle soup so the
 * cerebrum — not the stem — dominates. The stem stretches the model's longest
 * axis well past the brain bulk; since makeBrainFromMesh scales by the largest
 * extent, leaving it in shrinks the actual brain. We bin vertices along the
 * longest axis, measure each band's cross-section (its extent in the other two
 * axes), then keep only the contiguous band — grown outward from the widest
 * slice — whose cross-section stays a healthy fraction of the widest one. The
 * stem's tiny section falls below that cutoff and is dropped. A stemless or
 * gently-tapering model keeps ~everything (effectively a no-op).
 */
function trimStem(pos: Float32Array): Float32Array {
  const verts = pos.length / 3;
  if (verts < 30) return pos;
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const sx = mxx - mnx, sy = mxy - mny, sz = mxz - mnz;
  // ax = longest axis (the one the stem extends along); ca/cb = the cross axes
  const ax = sy >= sx && sy >= sz ? 1 : sx >= sz ? 0 : 2;
  const ca = ax === 0 ? 1 : 0;
  const cb = ax === 2 ? 1 : 2;
  const min = ax === 0 ? mnx : ax === 1 ? mny : mnz;
  const len = ax === 0 ? sx : ax === 1 ? sy : sz;
  if (len <= 0) return pos;

  const BINS = 48;
  const caLo = new Float32Array(BINS).fill(Infinity);
  const caHi = new Float32Array(BINS).fill(-Infinity);
  const cbLo = new Float32Array(BINS).fill(Infinity);
  const cbHi = new Float32Array(BINS).fill(-Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    let b = (((pos[i + ax] - min) / len) * BINS) | 0;
    if (b < 0) b = 0; else if (b >= BINS) b = BINS - 1;
    const va = pos[i + ca], vb = pos[i + cb];
    if (va < caLo[b]) caLo[b] = va; if (va > caHi[b]) caHi[b] = va;
    if (vb < cbLo[b]) cbLo[b] = vb; if (vb > cbHi[b]) cbHi[b] = vb;
  }
  const width = new Float32Array(BINS);
  let maxW = 0, peak = 0;
  for (let b = 0; b < BINS; b++) {
    const wa = caHi[b] > caLo[b] ? caHi[b] - caLo[b] : 0;
    const wb = cbHi[b] > cbLo[b] ? cbHi[b] - cbLo[b] : 0;
    const w = wa > wb ? wa : wb;
    width[b] = w;
    if (w > maxW) { maxW = w; peak = b; }
  }
  if (maxW <= 0) return pos;
  const thr = 0.32 * maxW;
  let lo = peak, hi = peak;
  while (lo - 1 >= 0 && width[lo - 1] >= thr) lo--;
  while (hi + 1 < BINS && width[hi + 1] >= thr) hi++;
  if (lo === 0 && hi === BINS - 1) return pos; // nothing thin to trim

  const keepMin = min + (lo / BINS) * len;
  const keepMax = min + ((hi + 1) / BINS) * len;
  const kept: number[] = [];
  for (let i = 0; i < pos.length; i += 9) {
    const c = (pos[i + ax] + pos[i + 3 + ax] + pos[i + 6 + ax]) / 3; // triangle centroid
    if (c >= keepMin && c <= keepMax) {
      for (let j = 0; j < 9; j++) kept.push(pos[i + j]);
    }
  }
  return kept.length >= 90 ? Float32Array.from(kept) : pos;
}

/**
 * Sample a Float32 point cloud off the SURFACE of a loaded 3D mesh (the brain
 * GLB). Every mesh in the scene is flattened to world space, reduced to its
 * position attribute, de-indexed and merged into one geometry, then area-weighted
 * surface sampling (MeshSurfaceSampler) draws `n` evenly-distributed points — so
 * the real gyri/sulci come for free from the geometry. The thin brainstem is
 * trimmed first (see trimStem) so the cerebrum fills the frame; the result is then
 * recentred on its bounding box and uniformly scaled so its largest dimension ==
 * `span`, to match the glyph shapes. Returns zeros if the scene has no meshes.
 */
function makeBrainFromMesh(root: THREE.Object3D, n: number, span: number): Float32Array {
  const out = new Float32Array(n * 3);
  root.updateMatrixWorld(true);
  const geoms: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const pos = src.getAttribute("position");
    if (!pos) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", pos.clone());
    g.applyMatrix4(o.matrixWorld); // bake the node transform into the vertices
    geoms.push(g);
  });
  if (geoms.length === 0) return out;
  const merged = geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (!merged) return out;

  // trim the thin brainstem so the cerebrum (not the stem) fills `span` below
  const mergedPos = merged.getAttribute("position");
  if (!mergedPos) return out;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(trimStem(mergedPos.array as Float32Array), 3));

  // normalize: center on the bounding-box midpoint, scale so the largest extent == span
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  if (!bb) return out;
  const mid = new THREE.Vector3();
  const size = new THREE.Vector3();
  bb.getCenter(mid);
  bb.getSize(size);
  const ext = Math.max(size.x, size.y, size.z) || 1;
  geom.translate(-mid.x, -mid.y, -mid.z);
  geom.scale(span / ext, span / ext, span / ext);

  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geom)).build();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    sampler.sample(p);
    out[i * 3] = p.x;
    out[i * 3 + 1] = p.y;
    out[i * 3 + 2] = p.z;
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

/** Procedural brain silhouette — the FALLBACK only. The real Hero/About brain is
 *  sampled from /models/brain.glb (see makeBrainFromMesh); this stands in until the
 *  mesh loads, or permanently if the fetch fails (mirrors the world-map fallback).
 *  A lobed blob (two hemispheres + a cerebellum bump + a short stem); sampled with
 *  a non-zero `wrinkle` so the inflated body gets gyri-like surface bumpiness. */
function drawBrain(ctx: CanvasRenderingContext2D, S: number) {
  const cx = 0.5 * S;
  const cy = 0.47 * S;
  const rx = 0.34 * S;
  const ry = 0.27 * S;
  const blob = (x: number, y: number, ax: number, ay: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, ax, ay, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(cx, cy, rx, ry); // main cerebrum
  blob(cx - rx * 0.45, cy - ry * 0.15, rx * 0.55, ry * 0.8); // left hemisphere bulge
  blob(cx + rx * 0.45, cy - ry * 0.15, rx * 0.55, ry * 0.8); // right hemisphere bulge
  blob(cx + rx * 0.5, cy + ry * 0.65, rx * 0.3, ry * 0.38); // cerebellum, lower back
  blob(cx + rx * 0.12, cy + ry * 1.0, rx * 0.1, ry * 0.32); // brainstem
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
// The globe particle color, used by the dense land-fill cloud and by the land
// morph cloud's globe tint so the whole globe reads as one particle style. Uses the
// orchid violet from the palette below (hue ~269°), NOT the brand #8052ff: the brand
// is blue-dominant (B=255), so rendered bright + dense the globe read as blue. Orchid
// keeps the globe clearly PURPLE, matching how the faint node-link lines read.
const GLOBE_DOT_COLOR = (dark: boolean) => (dark ? "#b46cff" : "#8e4fe0");

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

// ---------------------------------------------------------------- point material
// Shared by the morphing model, the dense land fill AND the ocean dots so size
// can vary PER POINT (THREE.PointsMaterial only exposes one global size).
// Reproduces the PointsMaterial look: vertex color × soft sprite alpha,
// perspective size attenuation (uScale/-z, matching three's own formula),
// theme-aware additive/normal blend, plus the slow per-particle shimmer.
//
// uGlobeness (0→1) drives a FRONT/BACK fade for the world globe: the globe is a
// hollow shell centred at the local origin, so each surface point's radial
// direction is its sphere normal — points whose normal faces away from the camera
// (the far hemisphere) fade out and shrink, so only the side facing the screen
// shows and the back doesn't bleed through. At uGlobeness 0 (the flat glyph
// shapes) the fade is a no-op. uSize/uScale/uOpacity/uTime/uShimmer/uGlobeness
// are refreshed each frame in useFrame.
const POINT_VERTEX_SHADER = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  uniform float uSize;
  uniform float uScale;
  uniform float uTime;
  uniform float uShimmer;
  uniform float uGlobeness;
  uniform vec3 uTint;
  uniform float uTintAmount;
  varying vec3 vColor;
  varying float vFront;
  void main() {
    // slow per-particle brightness drift (per-point phase + speed jitter)
    float spd = ${SHIMMER_FREQ.toFixed(3)} * (0.6 + 0.8 * fract(aPhase * 0.31831));
    float s = ${SHIMMER_MIN.toFixed(3)} + ${(1 - SHIMMER_MIN).toFixed(3)} * (0.5 + 0.5 * sin(uTime * spd + aPhase));
    float bright = mix(1.0, s, uShimmer);
    // uTintAmount shifts the per-vertex color toward uTint — the land cloud uses
    // this to match the dense land fill's bright color on the globe (amount = globeness),
    // while the flat glyph shapes (amount 0) keep their own palette.
    vColor = mix(aColor, uTint, uTintAmount) * bright;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // front/back fade — normal is the radial direction on the globe shell; its
    // view-space z is +1 toward the camera (front), -1 away (back). Keep the front
    // cap + limb bright, fade the far hemisphere to nothing. Gated by uGlobeness.
    float plen = length(position);
    vec3 nrm = plen > 1e-4 ? position / plen : vec3(0.0, 0.0, 1.0);
    float facing = normalize(normalMatrix * nrm).z;
    vFront = mix(1.0, smoothstep(-0.25, 0.1, facing), uGlobeness);
    // back dots also shrink so the limb softens into a blur rather than a hard edge
    float sizeFade = mix(1.0, 0.4 + 0.6 * vFront, uGlobeness);
    gl_PointSize = uSize * aSize * sizeFade * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const POINT_FRAGMENT_SHADER = `
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFront;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    if (tex.a < 0.02) discard;
    gl_FragColor = vec4(vColor, uOpacity * tex.a * vFront);
  }
`;
function makePointShaderMaterial(dot: THREE.Texture | null, dark: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: dot },
      uSize: { value: 0.05 },
      uScale: { value: 300 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uShimmer: { value: 1 },
      uGlobeness: { value: 0 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uTintAmount: { value: 0 },
    },
    vertexShader: POINT_VERTEX_SHADER,
    fragmentShader: POINT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ---------------------------------------------------------------- scene

function Constellation({ animate, dark }: { animate: boolean; dark: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const oceanRef = useRef<THREE.Points>(null); // sea dots, only shown on the globe
  const oceanHovered = useRef(false); // whether the ocean buffer currently holds a hover displacement
  const landFillRef = useRef<THREE.Points>(null); // dense land dots, only on the globe
  const landFillActive = useRef(false); // whether the land-fill buffer is currently displaced (scatter/hover)

  const seg = useRef(0); // target segment (i + f) from scroll
  const segSmooth = useRef(0);
  // Each content section's document-space top & bottom. The morph is keyed off the
  // empty GAPS between these boxes, not the section centers, so transitions run
  // only while content is offscreen (see onScroll below).
  const bounds = useRef<{ top: number; bottom: number }[]>([]);
  const pointer = useRef({ x: 0, y: 0, active: false });
  const hover = useRef(0);
  // eased cursor yaw, kept apart from inner.rotation.y so the first-gap Y spin
  // (rollY) can be added on top without the easing dragging it back down
  const tiltY = useRef(0);
  // the brain points sampled from the real mesh, set once the GLB resolves. The
  // hero shows the brain at load, so rather than a hard swap (a visible snap) the
  // useFrame eases shapes.brain toward this target, then clears it. null = nothing
  // pending (still on the procedural fallback, or already converged).
  const brainTarget = useRef<Float32Array | null>(null);
  // force a render after the async brain load lands while in reduced-motion
  // ("demand" frameloop only renders on request)
  const invalidate = useThree((s) => s.invalidate);
  // reused each frame to unproject the cursor into the cloud's local space
  const cursorLocal = useMemo(() => new THREE.Vector3(), []);

  const shapes = useMemo(() => {
    const s = {
      // (draw, scale, inflate, wrinkle) — inflate puffs the flat outline into 3D
      brackets: sampleSilhouette(drawBrackets, POINT_COUNT, 4.0 * MODEL_SCALE, 0.5 * MODEL_SCALE),
      gear: sampleSilhouette(drawGear, POINT_COUNT, 4.0 * MODEL_SCALE, 0.7 * MODEL_SCALE),
      braces: sampleSilhouette(drawBraces, POINT_COUNT, 4.0 * MODEL_SCALE, 0.5 * MODEL_SCALE),
      // Hero/About brain — a procedural silhouette with gyri-like wrinkle, used
      // only until /models/brain.glb loads and re-samples this buffer in place
      // (see the GLTF effect + the eased swap in useFrame).
      brain: sampleSilhouette(drawBrain, POINT_COUNT, BRAIN_SPAN, 0.6 * MODEL_SCALE, 0.35 * MODEL_SCALE),
      // smaller than the other shapes so the whole India-facing sphere fits in
      // the open space beside the Contact cards (the eastern/Asia side would
      // otherwise run off the right edge when docked).
      globe: makeWorldGlobe(POINT_COUNT, GLOBE_RADIUS),
    };
    // recenter every shape vertically so each reads as centered on screen — except
    // the globe, a sphere already centered at the origin that must stay there so
    // the separate ocean-dot sphere lines up with it.
    (Object.keys(s) as (keyof typeof s)[]).forEach((key) => {
      if (key !== "globe") centerY(s[key]);
    });
    return s as Record<(typeof ORDER)[number], Float32Array>;
  }, []);

  // live render buffer + smoothed positions, seeded at the hero brain
  const positions = useMemo(() => Float32Array.from(shapes.brain), [shapes]);
  const colors = useMemo(() => buildColors(POINT_COUNT, dark), [dark]);

  // sea dots on the same sphere/radius as the world globe (not centered, matching
  // the globe shape) — faded in only while the globe is on screen. On the shared
  // point shader (not PointsMaterial) so the far-hemisphere sea hides and the dots
  // get the same per-point hover swell as the land. oceanBase is the rest layout;
  // oceanPositions is the live buffer the hover lens writes into.
  const oceanBase = useMemo(() => makeGlobeOcean(OCEAN_COUNT, GLOBE_RADIUS), []);
  const oceanPositions = useMemo(() => Float32Array.from(oceanBase), [oceanBase]);
  const oceanColors = useMemo(() => {
    // orchid violet — same as the land fill / GLOBE_DOT_COLOR — so the sea reads as
    // part of the same purple globe (was white, then briefly the blue-leaning brand)
    const c = new THREE.Color(dark ? "#b46cff" : "#8e4fe0");
    const a = new Float32Array(OCEAN_COUNT * 3);
    for (let i = 0; i < OCEAN_COUNT; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    return a;
  }, [dark]);
  const oceanSizes = useMemo(() => {
    const a = new Float32Array(OCEAN_COUNT);
    a.fill(1);
    return a;
  }, []);
  // ocean doesn't shimmer (uShimmer 0), so phases are unused — zeros satisfy the
  // shader's aPhase attribute without a per-point twinkle.
  const oceanPhases = useMemo(() => new Float32Array(OCEAN_COUNT), []);

  // Dense land fill — the continents, randomly scattered (see sampleGlobeRandom). A
  // FULL participant like the morph cloud: it scatters with the transition and reacts
  // to the hover lens (see useFrame), so it needs a live buffer + scatter field +
  // per-point sizes. Bright globe color, driven in useFrame.
  const landFillBase = useMemo(() => makeGlobeLandFill(LANDFILL_COUNT, GLOBE_RADIUS), []);
  const landFillPositions = useMemo(() => Float32Array.from(landFillBase), [landFillBase]);
  const landFillScatter = useMemo(() => {
    const a = new Float32Array(LANDFILL_COUNT * 3);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return a;
  }, []);
  const landFillSizes = useMemo(() => {
    const a = new Float32Array(LANDFILL_COUNT);
    a.fill(1);
    return a;
  }, []);
  const landFillColors = useMemo(() => {
    const c = new THREE.Color(GLOBE_DOT_COLOR(dark));
    const a = new Float32Array(LANDFILL_COUNT * 3);
    for (let i = 0; i < LANDFILL_COUNT; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    return a;
  }, [dark]);
  const landFillPhases = useMemo(() => {
    const a = new Float32Array(LANDFILL_COUNT);
    for (let i = 0; i < LANDFILL_COUNT; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, []);

  // Lazily upgrade the coarse fallback continents to real Natural Earth 1:110m
  // coastlines. The ~75KB file is fetched (not bundled) the first time the field
  // mounts; once it lands we RE-SAMPLE the globe/ocean/outline clouds in place —
  // mutating the existing buffers — so the continents snap to accurate shapes.
  // The globe docks at the last section, so this resolves long before it scrolls
  // into view. On fetch failure the hand-coded fallback simply stays.
  useEffect(() => {
    const rebuild = () => {
      shapes.globe.set(makeWorldGlobe(POINT_COUNT, GLOBE_RADIUS));
      oceanBase.set(makeGlobeOcean(OCEAN_COUNT, GLOBE_RADIUS));
      oceanPositions.set(oceanBase);
      landFillBase.set(makeGlobeLandFill(LANDFILL_COUNT, GLOBE_RADIUS));
      landFillPositions.set(landFillBase);
      if (oceanRef.current)
        (oceanRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      if (landFillRef.current)
        (landFillRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      // the model morph buffer (from shapes.globe) is rewritten every frame in
      // useFrame; the ocean and land fill move only during transition/hover, so
      // seed their live buffers from the rebuilt bases here.
    };
    if (WORLD_LAND) {
      rebuild();
      return;
    }
    let cancelled = false;
    fetch("/data/land-110m.json")
      .then((r) => r.json())
      .then((polys: Polygon[]) => {
        if (cancelled) return;
        WORLD_LAND = polys;
        rebuild();
      })
      .catch(() => {
        /* keep the hand-coded fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, oceanBase, oceanPositions, landFillBase, landFillPositions]);

  // Load the real brain mesh and re-sample shapes.brain off its surface. Like the
  // coastline fetch above, the procedural silhouette stands in until this resolves
  // (and stays if it fails). The brain is the HERO shape, on screen at load, so a
  // hard buffer swap would snap — instead store the sampled cloud as a target that
  // useFrame eases shapes.brain toward. In reduced motion (frameloop "demand",
  // useFrame idle) set it directly and request a single render.
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync("/models/brain.glb")
      .then((gltf) => {
        if (cancelled) return;
        const pts = makeBrainFromMesh(gltf.scene, POINT_COUNT, BRAIN_SPAN);
        if (pts.length === 0) return; // no meshes — keep the fallback
        centerY(pts);
        if (animate) {
          brainTarget.current = pts;
        } else {
          shapes.brain.set(pts);
          invalidate();
        }
      })
      .catch(() => {
        /* keep the procedural fallback brain */
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, animate, invalidate]);

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

  // Custom per-point-size material (see makePointShaderMaterial). uSize/uScale/
  // uOpacity/uTime/uShimmer are refreshed each frame in useFrame.
  const modelMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => modelMaterial.dispose(), [modelMaterial]);
  // On the globe the morph cloud's land dots adopt the bright globe color
  // (uTintAmount = globeness in useFrame) so they match the dense land-fill cloud.
  useEffect(() => {
    modelMaterial.uniforms.uTint.value.set(GLOBE_DOT_COLOR(dark));
  }, [modelMaterial, dark]);
  // Same shader for the ocean dots so the far-hemisphere sea fades out too.
  const oceanMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => oceanMaterial.dispose(), [oceanMaterial]);
  // Same shader for the dense land fill — the continents.
  const landFillMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => landFillMaterial.dispose(), [landFillMaterial]);

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
      const bs: { top: number; bottom: number }[] = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          const r = el.getBoundingClientRect();
          const top = r.top + window.scrollY;
          bs.push({ top, bottom: top + r.height });
        }
      }
      bounds.current = bs;
    };
    // Map scroll position → seg ∈ [0, last]. Integer part = the section currently
    // filling the viewport (held shape); fractional part = morph progress. The
    // cloud holds its shape while content is centered, then morphs/scatters/spins
    // as the viewport crosses the empty gap between two sections.
    const onScroll = () => {
      const bs = bounds.current;
      const last = bs.length - 1;
      if (last < 1) {
        seg.current = 0;
        return;
      }
      const y = window.scrollY;
      const vh = window.innerHeight;
      // How far the morph reaches OUTSIDE the fully-empty gap, into the tail of
      // the outgoing section and the head of the incoming one. vh/2 → the morph
      // starts when the outgoing content is half a screen from leaving and ends
      // when the incoming content is half a screen into view: span == gapHeight
      // (a full-viewport scrub, smooth), and the vh terms cancel so the scrub
      // distance is stable across mobile address-bar height changes.
      const lead = vh * 0.5;
      if (y <= bs[0].bottom - lead) {
        seg.current = 0; // hero still in view — hold shape 0
        return;
      }
      if (y >= bs[last].top - vh + lead) {
        seg.current = last; // last section in view — hold final shape
        return;
      }
      for (let k = 0; k < last; k++) {
        const gapStart = bs[k].bottom - lead; // outgoing section half a screen from leaving
        const gapEnd = bs[k + 1].top - vh + lead; // incoming section half a screen into view
        if (y < gapStart) {
          seg.current = k; // section k hold zone
          return;
        }
        if (y <= gapEnd) {
          // scrubbing the morph from shape k to shape k+1
          const span = gapEnd - gapStart;
          seg.current = k + (span > 0 ? clamp01((y - gapStart) / span) : 1);
          return;
        }
        // else: past gap k — section k+1 now overlaps; resolved as its hold next loop
      }
      seg.current = last;
    };
    const onPointer = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
      pointer.current.active = true;
    };
    // re-measure AND re-resolve the segment on resize: section box tops/bottoms
    // and the viewport height both move (incl. mobile address-bar show/hide), so
    // seg must update without waiting for the next scroll event.
    const onResize = () => { measure(); onScroll(); };
    measure();
    onScroll();
    const t1 = window.setTimeout(measure, 400);
    const t2 = window.setTimeout(() => { measure(); onScroll(); }, 1200);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, [animate]);

  useFrame((state: RootState, delta: number) => {
    if (!pointsRef.current) return;
    const k = Math.min(1, delta * 5);

    // ease the brain SOURCE buffer from the procedural fallback into the real
    // sampled-mesh cloud once the GLB resolves. The per-frame morph reads
    // shapes.brain directly (a = shapes[ORDER[i]]), so easing the source here
    // morphs the on-screen hero smoothly instead of snapping. Clears the target
    // once converged so this loop stops running.
    if (brainTarget.current) {
      const t = brainTarget.current;
      const src = shapes.brain;
      const e = Math.min(1, delta * 2);
      let maxd = 0;
      for (let j = 0; j < src.length; j++) {
        const d = t[j] - src[j];
        src[j] += d * e;
        const ad = d < 0 ? -d : d;
        if (ad > maxd) maxd = ad;
      }
      if (maxd < 0.002) {
        src.set(t);
        brainTarget.current = null;
      }
    }

    // entry: assemble from the scatter field over ~1.6s
    const entry = animate ? easeOutCubic(clamp01(state.clock.elapsedTime / 1.6)) : 1;

    // smooth the scroll segment. The morph now lives inside a ~1-viewport gap, so
    // a laggy follow would let it bleed past the gap into readable content; keep
    // the ease tight (Lenis already smooths the raw scroll) but non-zero to absorb
    // velocity spikes / resize re-measures. Raise toward *12 if bleed, lower to *6
    // if it snaps.
    const segK = Math.min(1, delta * 8);
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
    // A gap between two IDENTICAL adjacent shapes (Hero↔About brain, Projects↔
    // Education </>) spins about the vertical Y axis instead of scattering: the
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

    // publish the model's transition state so content sections wait for it to
    // settle before revealing (see Reveal). Settled = entry assembly done AND
    // docked at a section's hold band (tt ≈ 0 or 1); otherwise it's mid-morph,
    // scattering, or spinning — i.e. transitioning.
    setModelTransitioning(!(entry > 0.98 && (tt <= 0.02 || tt >= 0.98)));

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
      // Map the cursor to the shape's FRONT-SURFACE depth, not the z=0 plane. The
      // globe's lit face sits at z≈+GLOBE_RADIUS; under perspective a cursor at a
      // given screen-x maps to a SMALLER world-x there (the viewport narrows toward
      // the camera), so referencing z=0 made the lens land outboard of the pointer
      // on the off-centre docked globe. Flat glyphs sit at z≈0, so blend the
      // reference depth by globeness (0 for glyphs → full radius for the globe).
      const camZ = state.camera.position.z;
      const refZ = globeness * GLOBE_RADIUS;
      const persp = (camZ - refZ) / camZ; // viewport shrinks toward the camera
      cursorLocal.set((pointer.current.x * vw * persp) / 2, (pointer.current.y * vh * persp) / 2, refZ);
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
    // uGlobeness drives the front/back fade so the far-hemisphere sea hides too.
    const oc = oceanMaterial.uniforms;
    oc.uSize.value = (dark ? 0.02 : 0.018) * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
    oc.uScale.value = state.size.height * 0.5;
    oc.uOpacity.value = (dark ? 0.5 : 0.4) * globeness * (1 - env) * entry;
    oc.uTime.value = state.clock.elapsedTime;
    oc.uShimmer.value = 0; // steady faint sea, no twinkle
    oc.uGlobeness.value = globeness;
    // ocean hover lens — the sea dots swell + part under the cursor like the land.
    // The ocean doesn't scatter, so it only needs updating WHILE a hover is active
    // (lens > 0); once it fades, reset the buffer to its rest layout exactly once.
    if (oceanRef.current && globeness > 0.001 && lens > 0.001) {
      for (let q = 0; q < OCEAN_COUNT; q++) {
        const ix = q * 3;
        const iy = ix + 1;
        let mx = oceanBase[ix];
        let my = oceanBase[iy];
        let grow = 0;
        const dx = mx - lcx;
        const dy = my - lcy;
        const cd2 = dx * dx + dy * dy;
        if (cd2 < HOVER_R2) {
          const cd = Math.sqrt(cd2) || 1e-4;
          const f = 1 - cd / HOVER_RADIUS;
          const ff = f * f;
          grow = HOVER_GROW * ff * lens;
          const spread = (HOVER_SPREAD * ff * lens) / cd;
          mx += dx * spread;
          my += dy * spread;
        }
        oceanSizes[q] = 1 + grow;
        oceanPositions[ix] = mx;
        oceanPositions[iy] = my;
        oceanPositions[ix + 2] = oceanBase[ix + 2];
      }
      const og = oceanRef.current.geometry;
      (og.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (og.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      oceanHovered.current = true;
    } else if (oceanRef.current && oceanHovered.current) {
      oceanPositions.set(oceanBase);
      oceanSizes.fill(1);
      const og = oceanRef.current.geometry;
      (og.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (og.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      oceanHovered.current = false;
    }

    // dense land fill — the continents. A FULL participant: it scatters with the
    // transition and reacts to the hover lens, just like the morph cloud. Opacity
    // gates on globeness (invisible off the globe) and entry, but NOT on (1 - env)
    // so it stays lit while it bursts apart. The per-point loop only runs while
    // it's actually moving (transition/entry/hover); on the settled idle globe it
    // holds its rest layout (reset once) to avoid a needless 48k-point update.
    const lf = landFillMaterial.uniforms;
    lf.uSize.value = (dark ? 0.032 : 0.03) * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
    lf.uScale.value = state.size.height * 0.5;
    lf.uOpacity.value = (dark ? 0.95 : 0.9) * globeness * entry * (mobile ? 0.6 : 1);
    lf.uTime.value = state.clock.elapsedTime;
    lf.uShimmer.value = animate ? 0.5 : 0;
    lf.uGlobeness.value = globeness;
    const lfMoving = globeness > 0.001 && (env > 0.001 || lens > 0.001 || entry < 0.999);
    if (landFillRef.current && lfMoving) {
      for (let q = 0; q < LANDFILL_COUNT; q++) {
        const ix = q * 3;
        const iy = ix + 1;
        const iz = ix + 2;
        let mx = landFillBase[ix];
        let my = landFillBase[iy];
        const mz = landFillBase[iz];
        // hover lens (swell + part outward)
        let grow = 0;
        if (lens > 0.001) {
          const dx = mx - lcx;
          const dy = my - lcy;
          const cd2 = dx * dx + dy * dy;
          if (cd2 < HOVER_R2) {
            const cd = Math.sqrt(cd2) || 1e-4;
            const f = 1 - cd / HOVER_RADIUS;
            const ff = f * f;
            grow = HOVER_GROW * ff * lens;
            const spread = (HOVER_SPREAD * ff * lens) / cd;
            mx += dx * spread;
            my += dy * spread;
          }
        }
        landFillSizes[q] = 1 + grow;
        // scatter blend, then entry blend — identical pipeline to the morph cloud
        const ex = lerp(mx, landFillScatter[ix] * sx, env);
        const ey = lerp(my, landFillScatter[iy] * sy, env);
        const ez = lerp(mz, landFillScatter[iz] * sz, env);
        landFillPositions[ix] = lerp(landFillScatter[ix] * sx, ex, entry);
        landFillPositions[iy] = lerp(landFillScatter[iy] * sy, ey, entry);
        landFillPositions[iz] = lerp(landFillScatter[iz] * sz, ez, entry);
      }
      const lg = landFillRef.current.geometry;
      (lg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (lg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      landFillActive.current = true;
    } else if (landFillRef.current && landFillActive.current) {
      landFillPositions.set(landFillBase);
      landFillSizes.fill(1);
      const lg = landFillRef.current.geometry;
      (lg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (lg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      landFillActive.current = false;
    }

    // drive the morph cloud's material. On the GLOBE its (sparse) land dots ease to
    // the dense land-fill style — size → 0.032, color → globe color (uTintAmount),
    // opacity, shimmer → 0.5 — so they blend into the dense fill rather than reading
    // as a second, chunkier layer. uGlobeness drives the shared front/back fade.
    const mu = modelMaterial.uniforms;
    const landBase = dark ? lerp(0.055, 0.032, globeness) : lerp(0.05, 0.03, globeness);
    mu.uSize.value = landBase * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
    mu.uScale.value = state.size.height * 0.5;
    mu.uOpacity.value =
      lerp(dark ? 0.95 : 0.85, dark ? 0.95 : 0.9, globeness) *
      entry *
      (mobile ? lerp(0.55, 0.6, globeness) : 1);
    mu.uTime.value = state.clock.elapsedTime;
    mu.uShimmer.value = animate ? lerp(1, 0.5, globeness) : 0;
    mu.uGlobeness.value = globeness;
    mu.uTintAmount.value = globeness;

    // outer = horizontal dock + per-section scale (HERO_SCALE on section 0, all
    // else 1; eases to 1 across the first gap). NO auto-rotation / bob.
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
          {/* sea dots filling the ocean of the world globe (opacity + front/back
              fade + hover swell driven per-frame via the shared shader — invisible
              on every other shape, and the far-hemisphere sea hides like the land) */}
          <points ref={oceanRef} material={oceanMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[oceanPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[oceanColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[oceanSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[oceanPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* dense land fill — the continents, randomly scattered (sampleGlobeRandom).
              Full participant: scatters with the transition and reacts to the hover
              lens (positions/sizes animated in useFrame, opacity by globeness). */}
          <points ref={landFillRef} material={landFillMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[landFillPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[landFillColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[landFillSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[landFillPhases, 1]} />
            </bufferGeometry>
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
