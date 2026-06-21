"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Globe,
  Search,
  Mail,
  Laptop,
  Users,
  Lightbulb,
  Lock,
  Smartphone,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { setModelTransitioning } from "@/components/three/model-phase";

/** Real service icons ringed around the cloud (one per node), echoing the reference:
 *  world, search, mail, laptop, people, ideas, security, mobile, commerce. */
const SERVICE_ICONS: LucideIcon[] = [
  Globe,
  Search,
  Mail,
  Laptop,
  Users,
  Lightbulb,
  Lock,
  Smartphone,
  ShoppingCart,
];

/**
 * ParticleField — the "Dala" constellation, ported and choreographed.
 *
 * One cloud of ~2400 particles that TRAVELS and MORPHS as the page scrolls. It
 * docks to alternating sides per section, and SCATTERS full-screen in the gaps
 * between sections before reassembling on the opposite side as the next shape:
 *
 *   brain → brain → cloud → DNA → flux → flux → globe
 *
 * Gaps between two IDENTICAL shapes (Hero↔About brain, Projects↔Education flux)
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
 * hero brain with stars.
 */

// Shared by every morph shape (one cloud morphs between them, so they all use the
// same count). Bumped well past the original 2400 so the brain's gyri/sulci read
// as real structure instead of a sparse scatter — which only makes the glyphs and
// the globe morph cloud richer too. The per-frame morph loop is O(this); 9000 is
// still trivial on the CPU. (The brain gets extra density from BRAINFILL_COUNT.)
const POINT_COUNT = 9000;
const STAR_COUNT = 3500;
// white sea dots that fill the ocean between continents on the world globe —
// denser than the land so the sea reads as a full surface, randomly scattered
const OCEAN_COUNT = 6000;
// Dense BRAIN fill. The shared morph cloud (POINT_COUNT) is sampled across every
// shape, so it can't be made denser for the brain alone — a separate high-count
// cloud, sampled off the same brain mesh, is layered onto the Hero/About brain
// only (the way LANDFILL_COUNT densifies the globe). Invisible on every other shape.
const BRAINFILL_COUNT = 30000;
// Same idea for the Experience DNA double helix: the shared morph cloud is too sparse
// to read as solid strands, so a separate high-count cloud sampling the same helix
// is layered on to make it bold and solid. Invisible on every other shape.
const DNAFILL_COUNT = 30000;

// Overall size of the morphing model. Bump this to scale every shape together;
// the starfield and the full-screen scatter spread are deliberately left
// independent of it so only the docked object grows.
const MODEL_SCALE = 1.35;

// Global multiplier on the per-point SIZE of the shape-forming particles (morph cloud,
// brain fill, DNA fill, globe land + ocean). Scales every dot together without moving
// them — bump to make the particles bigger, lower for finer. The data-viz accents
// (arcs, nodes, packets) and the background starfield are intentionally left out.
const PARTICLE_SIZE = 2.0;

// Radius of the world-globe shell (land + ocean dots sit on it). Kept as
// a named constant because the hover lens also needs it: the globe's lit face
// sits at z≈+GLOBE_RADIUS, which the cursor projection must account for.
const GLOBE_RADIUS = 1.5 * MODEL_SCALE;

// Per-section-0 scale: the hero (first) brain is enlarged as the page's headline
// mark, easing to 1 across the first gap so the Hero→About spin shrinks it to the
// docked About size. Trimming the stem freed the headroom to enlarge it again
// without overflowing the viewport. Raise/lower to taste.
const HERO_SCALE = 1.5;

// Hover "lens" (the dala.ai feel): every point within HOVER_RADIUS (cloud-local
// units; the model spans ~±2.7 after MODEL_SCALE) of the cursor grows in SIZE —
// biggest right under the pointer (1 + HOVER_GROW)×, smoothly shrinking back to
// its base size at the rim. Pure size, NO positional displacement, so there is no
// void: the triangles simply swell toward the cursor and ease down with distance.
// The cursor is projected onto the shape's front-surface depth (see refZ in
// useFrame) so the magnified patch tracks the pointer even on the off-centre,
// z-offset globe.
const HOVER_RADIUS = 0.85; // tight — only the patch right under the cursor reacts
const HOVER_R2 = HOVER_RADIUS * HOVER_RADIUS;
const HOVER_GROW = 3.0; // peak size boost at the cursor (×(1+this)); smooth falloff to the rim

// Slow per-particle shimmer: each point's brightness drifts between SHIMMER_MIN
// and full on its own phase, so the field gently blinks darker/brighter instead
// of pulsing in unison. SHIMMER_FREQ is the base angular speed (rad/s) — low is
// very slow; a per-particle speed/phase jitter is added in-shader.
const SHIMMER_MIN = 0.35;
const SHIMMER_FREQ = 2.0;

// Load-time entry choreography (seconds). The cloud appears SHATTERED — all particles
// dispersed across the viewport — holds briefly so the burst reads, then REJOINS into
// the brain. The rejoin is deliberately held back until the real /models/brain.glb mesh
// is ready, so the particles reassemble straight into the actual brain instead of first
// forming the procedural stand-in and then visibly morphing into the mesh. ENTRY_FADE
// ramps opacity fast so the shatter is visible; ENTRY_MAX_WAIT starts the rejoin anyway
// if the mesh is slow or fails to load (so a stalled asset can't freeze the intro).
const ENTRY_FADE = 0.4; // opacity ramp-in so the dispersed shatter is visible
const ENTRY_MIN_HOLD = 0.55; // minimum time held shattered before the rejoin begins
const ENTRY_MAX_WAIT = 2.2; // fallback: rejoin even if the brain mesh isn't ready yet
const ENTRY_DUR = 1.6; // rejoin (assembly) duration

// Per-section shape + side. order.length must match the number of <section>s.
// Adjacent IDENTICAL shapes (Hero/About brain, Projects/Education flux) spin about
// the Y axis between sections instead of scattering — see rollY / spinGap below.
const ORDER = ["brain", "brain", "cloud", "dna", "flux", "flux", "globe"] as const;

// Per-section target Y-rotation (radians), interpolated by morph progress in
// useFrame. A gap between two IDENTICAL shapes turns a VISIBLE amount: the brain
// pair a HALF turn (180°), the flux pair a FULL turn (360°). The mixed-shape gap
// right after a half-turn then adds a HIDDEN half turn (masked by the full-screen
// scatter) so the next glyph faces front again. Building absolute per-section yaws
// (rather than resetting each gap) keeps rotation.y continuous everywhere — no snap.
const SECTION_YAW: readonly number[] = (() => {
  const half = [0]; // accumulated half-turns (×π)
  for (let g = 0; g < ORDER.length - 1; g++) {
    const spin = ORDER[g] === ORDER[g + 1];
    let d = 0;
    if (spin) d = ORDER[g] === "brain" ? 1 : 2; // brain: 180°, flux/others: 360°
    else if (half[g] % 2 !== 0) d = 1; // realign a back-facing shape to front (under scatter)
    half.push(half[g] + d);
  }
  return half.map((h) => h * Math.PI);
})();

// The Hero/About brain is sampled from a real anatomical mesh (/models/brain.glb);
// until it loads (or if the fetch fails) a procedural silhouette stands in. The
// mesh is normalized so its LARGEST dimension == BRAIN_SPAN; kept smaller than the
// glyphs' 4.0·MODEL_SCALE span because the brain fills its whole silhouette (the
// glyphs don't) — an equal span overflowed the viewport on the hero.
const BRAIN_SPAN = 2.6 * MODEL_SCALE;
// Cloud (systems stage) — sampled from /models/cloud.glb when present, else the
// procedural makeCloud fallback. Normalized so its LARGEST extent == CLOUD_SPAN.
const CLOUD_SPAN = 2.6 * MODEL_SCALE;
// the cloud is wider than tall — approximate half-extents used to anchor the
// orthogonal connector elbows on the cloud's edge.
const CLOUD_HALF_W = CLOUD_SPAN * 0.5;
const CLOUD_HALF_H = CLOUD_SPAN * 0.22;
// DNA double helix (Experience stage) — sampled from /models/dna.glb when present
// (a realistic B-form helix: 10 bp/turn, 3.38Å rise, major/minor groove asymmetry),
// else the procedural makeDNA fallback. Normalized so its LARGEST extent (the vertical
// helix height) == DNA_SPAN. Taller than the other shapes so the slim, true-to-life
// helix still reads at a comparable presence.
const DNA_SPAN = 3.0 * MODEL_SCALE;
// The DNA helix is the ONLY model that auto-spins: it rotates about its vertical (+y)
// helix axis at this angular speed (rad/s) while DOCKED, and freezes the moment a
// section transition begins so the scattered particles don't rotate (see useFrame).
const DNA_SPIN_SPEED = 0.6;
// "Flux" — the continuously-morphing 3D structure at the Projects/Education stages
// (it replaced the old </> glyph). A DODECAHEDRON drawn in particles: dense bright
// clusters at its 20 VERTICES, particles strung along its 30 EDGES. Every frame the
// vertices are pushed around by a smooth, TRAVELLING displacement field (see DODECA +
// fillFlux + useFrame), so the solid continuously warps and reshapes — edges flexing
// and stretching, vertices drifting — without ever settling.
//   FLUX_R    circumradius of the (unwarped) solid
//   FLUX_WARP how far each vertex strays, in units of FLUX_R (kept moderate so the
//             wireframe stays readable rather than tangling)
//   FLUX_SPEED churn rate of the warp
//   FLUX_VJIT / FLUX_EJIT  vertex-cluster size / edge thickness, in units of FLUX_R
const FLUX_R = 1.3 * MODEL_SCALE;
const FLUX_WARP = 0.28;
const FLUX_SPEED = 1.0;
const FLUX_VJIT = 0.05;
const FLUX_EJIT = 0.016;
// The Projects/Education stage is now the Vitruvian Man, surface-sampled from
// /models/vitruvian.glb (the dodecahedron above is only the procedural fallback seed
// while the mesh loads / if it's absent). FLUX_SPAN is the size the mesh is normalized
// to — matching the other shapes' spans; ModelConstellation also uses it as its shell
// radius. dockGate.v is published each frame (1 when a shape is settled/docked, 0 while
// it scatters or during the load entry) and read by ModelConstellation to fade the
// surrounding morphing star-network in/out around EVERY model.
const FLUX_SPAN = 2.6 * MODEL_SCALE;
const dockGate = { v: 0 };
// one service node (+ icon) per SERVICE_ICONS entry, ringed around the cloud, each
// fed by a right-angle (elbow) connection trail.
const CLOUD_NODE_COUNT = SERVICE_ICONS.length;
const CONN_SAMPLES = 40; // points per connection trail (denser → reads as a line)
// Per-node positional nudges. The icon AND its whole connector translate together by
// this offset, so the line's origin shifts with the icon and (being a pure shift) every
// leg stays axis-aligned / perpendicular. Indices follow SERVICE_ICONS; only four are
// nudged per request: world(0) ↑, mail(2) ←, phone(7) →, cart(8) ↓.
const NUDGE = 0.07 * CLOUD_SPAN;
const NODE_OFFSET: [number, number][] = [
  [0, NUDGE], // 0 Globe (world)        → up
  [0, 0], // 1 Search
  [-NUDGE, 0], // 2 Mail                → left
  [0, 0], // 3 Laptop
  [0, 0], // 4 Users
  [0, 0], // 5 Lightbulb
  [0, 0], // 6 Lock
  [NUDGE, 0], // 7 Smartphone (phone)   → right
  [0, -NUDGE], // 8 ShoppingCart (cart) → down
];
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

// ---------------------------------------------------------------- globe arcs
// Great-circle "data arcs" on the Contact globe: faint dotted trails flying from
// Alappuzha out to cloud regions / hubs, each with a bright travelling head. They
// ride the SAME India-front, forward-pitched sphere as the land/ocean dots, so they
// must use the identical (lon,lat)→position transform (see sampleGlobeRandom).
const ARC_SOURCE = { lon: 76.3, lat: 9.5 }; // Alappuzha
const ARC_HUBS = [
  { lon: 72.8, lat: 19.1 }, // Mumbai
  { lon: 103.8, lat: 1.35 }, // Singapore
  { lon: 8.7, lat: 50.1 }, // Frankfurt
  { lon: -77.5, lat: 39.0 }, // N. Virginia
  { lon: 139.7, lat: 35.7 }, // Tokyo
];
const ARC_SAMPLES = 64; // points per arc trail
const ARC_LIFT = 0.18; // how high the arc bows off the surface at its midpoint

/** (lon,lat)→position on the India-front, GLOBE_TILT_DEG-pitched sphere — the exact
 *  transform sampleGlobeRandom bakes into the globe dots, factored out so arcs land
 *  precisely on the visible globe. */
function lonLatToGlobe(lonDeg: number, latDeg: number, radius: number): [number, number, number] {
  const lon0 = (INDIA_LON * Math.PI) / 180;
  const tilt = (GLOBE_TILT_DEG * Math.PI) / 180;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const lat = (latDeg * Math.PI) / 180;
  const lam = (lonDeg * Math.PI) / 180 - lon0;
  const cl = Math.cos(lat);
  const x0 = radius * cl * Math.sin(lam);
  const y0 = radius * Math.sin(lat);
  const z0 = radius * cl * Math.cos(lam);
  return [x0, y0 * ct - z0 * st, y0 * st + z0 * ct];
}

/** Sample a great-circle arc (unit-vector slerp) between two lon/lat points, bowed
 *  outward by ARC_LIFT at its midpoint. Endpoints are taken in the globe's final
 *  rotated/tilted space (radius 1 → unit vectors), so the slerp follows the visible
 *  sphere's surface. */
function buildArc(srcLon: number, srcLat: number, dstLon: number, dstLat: number, radius: number): Float32Array {
  const a = lonLatToGlobe(srcLon, srcLat, 1);
  const b = lonLatToGlobe(dstLon, dstLat, 1);
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(d);
  const sinO = Math.sin(omega);
  const out = new Float32Array(ARC_SAMPLES * 3);
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const u = i / (ARC_SAMPLES - 1);
    let vx: number, vy: number, vz: number;
    if (sinO < 1e-4) {
      vx = a[0]; vy = a[1]; vz = a[2];
    } else {
      const w0 = Math.sin((1 - u) * omega) / sinO;
      const w1 = Math.sin(u * omega) / sinO;
      vx = a[0] * w0 + b[0] * w1;
      vy = a[1] * w0 + b[1] * w1;
      vz = a[2] * w0 + b[2] * w1;
    }
    const lift = 1 + ARC_LIFT * Math.sin(Math.PI * u);
    out[i * 3] = vx * radius * lift;
    out[i * 3 + 1] = vy * radius * lift;
    out[i * 3 + 2] = vz * radius * lift;
  }
  return out;
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
function makeBrainFromMesh(root: THREE.Object3D, n: number, span: number, trim = true): Float32Array {
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

  // trim the thin brainstem so the cerebrum (not the stem) fills `span` below.
  // `trim` is bypassed for non-brain meshes (e.g. the cloud) where the heuristic
  // — tuned for the stem — would wrongly lop off a legitimate tendril.
  const mergedPos = merged.getAttribute("position");
  if (!mergedPos) return out;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(
      trim ? trimStem(mergedPos.array as Float32Array) : (mergedPos.array as Float32Array),
      3
    )
  );

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

// Regular dodecahedron geometry (20 vertices, 30 edges), built once at module load.
// Vertices use the golden-ratio coordinate set: (±1,±1,±1) and the cyclic (0,±1/φ,±φ).
// Edges are every vertex PAIR at the minimum pairwise distance (the polyhedron's edge
// length) — in a 3-regular dodecahedron that's exactly 30. Vertices are normalized to
// a unit circumradius, so FLUX_R alone sets the on-screen size.
const DODECA = (() => {
  const phi = (1 + Math.sqrt(5)) / 2;
  const inv = 1 / phi;
  const raw: number[][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) raw.push([x, y, z]);
  for (const a of [-inv, inv])
    for (const b of [-phi, phi]) {
      raw.push([0, a, b]); // (0, ±1/φ, ±φ)
      raw.push([a, b, 0]); // (±1/φ, ±φ, 0)
      raw.push([b, 0, a]); // (±φ, 0, ±1/φ)
    }
  let maxr = 0;
  for (const v of raw) {
    const r = Math.hypot(v[0], v[1], v[2]);
    if (r > maxr) maxr = r;
  }
  const n = raw.length;
  const verts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    verts[i * 3] = raw[i][0] / maxr;
    verts[i * 3 + 1] = raw[i][1] / maxr;
    verts[i * 3 + 2] = raw[i][2] / maxr;
  }
  const dist2 = (i: number, j: number) => {
    const dx = verts[i * 3] - verts[j * 3];
    const dy = verts[i * 3 + 1] - verts[j * 3 + 1];
    const dz = verts[i * 3 + 2] - verts[j * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  let minD = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minD = Math.min(minD, dist2(i, j));
  const tol = minD * 1.08; // 8% slack on edge² (next-nearest is ~φ² further — no false edges)
  const edges: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (dist2(i, j) <= tol) edges.push(i, j);
  return { verts, edges: Uint16Array.from(edges) };
})();

// per-frame scratch holding the warped vertex positions (20 × xyz) so every particle
// on a given vertex/edge reads the same moved corner without recomputing it.
const fluxWarpBuf = new Float32Array(DODECA.verts.length);

// Fixed per-particle assignment to a vertex or a point along an edge (plus a small
// fixed jitter), chosen once so points keep their identity and flow smoothly as the
// solid warps. ~26% cluster on the vertices (bright nodes), the rest line the edges.
const FLUX_ASSIGN = (() => {
  const N = POINT_COUNT;
  const nVerts = DODECA.verts.length / 3;
  const nEdges = DODECA.edges.length / 2;
  const isVert = new Uint8Array(N);
  const aIdx = new Uint16Array(N); // vertex index, or edge endpoint i
  const bIdx = new Uint16Array(N); // edge endpoint j (edge points only)
  const tPar = new Float32Array(N); // parameter along the edge (edge points only)
  const jit = new Float32Array(N * 3); // fixed offset in [-1,1]³, scaled in fillFlux
  const VERT_FRAC = 0.26;
  for (let p = 0; p < N; p++) {
    jit[p * 3] = Math.random() * 2 - 1;
    jit[p * 3 + 1] = Math.random() * 2 - 1;
    jit[p * 3 + 2] = Math.random() * 2 - 1;
    if (Math.random() < VERT_FRAC) {
      isVert[p] = 1;
      aIdx[p] = Math.floor(Math.random() * nVerts);
    } else {
      const e = Math.floor(Math.random() * nEdges);
      aIdx[p] = DODECA.edges[e * 2];
      bIdx[p] = DODECA.edges[e * 2 + 1];
      tPar[p] = Math.random();
    }
  }
  return { isVert, aIdx, bIdx, tPar, jit };
})();

/**
 * Fill `out` with the dodecahedron-wireframe "flux" structure at time `t`. First the
 * 20 base vertices are displaced by a smooth, TRAVELLING sinusoidal field whose
 * arguments carry `t` (so the bulge pattern drifts), giving warped corner positions in
 * `fluxWarpBuf`. Then every particle is placed at its FIXED assignment on that warped
 * solid — clustered at a vertex, or interpolated along an edge between two warped
 * vertices — plus its small fixed jitter. Because each point keeps its identity, the
 * structure flows smoothly: edges flex and stretch and vertices drift as the whole
 * polyhedron continuously reshapes. Centred on the origin (no centerY needed); called
 * every frame from useFrame while flux is on screen.
 */
function fillFlux(out: Float32Array, t: number): void {
  const T = t * FLUX_SPEED;
  const V = DODECA.verts;
  const nV = V.length / 3;
  const W = fluxWarpBuf;
  const s = FLUX_WARP / 1.6; // the field below spans ≈ ±1.6 → scale its push to ±FLUX_WARP
  for (let k = 0; k < nV; k++) {
    const vx = V[k * 3], vy = V[k * 3 + 1], vz = V[k * 3 + 2];
    const dx = Math.sin(2.1 * vx + 0.9 * T) + 0.6 * Math.sin(1.3 * vy - 0.5 * T + 0.7);
    const dy = Math.sin(2.4 * vy + 0.7 * T + 1.3) + 0.6 * Math.sin(1.1 * vz + 0.4 * T);
    const dz = Math.sin(2.0 * vz - 0.8 * T + 2.1) + 0.6 * Math.sin(1.5 * vx + 0.6 * T);
    W[k * 3] = (vx + dx * s) * FLUX_R;
    W[k * 3 + 1] = (vy + dy * s) * FLUX_R;
    W[k * 3 + 2] = (vz + dz * s) * FLUX_R;
  }
  const A = FLUX_ASSIGN;
  const N = POINT_COUNT;
  const vj = FLUX_R * FLUX_VJIT;
  const ej = FLUX_R * FLUX_EJIT;
  for (let p = 0; p < N; p++) {
    const j3 = p * 3;
    if (A.isVert[p]) {
      const k = A.aIdx[p] * 3;
      out[j3] = W[k] + A.jit[j3] * vj;
      out[j3 + 1] = W[k + 1] + A.jit[j3 + 1] * vj;
      out[j3 + 2] = W[k + 2] + A.jit[j3 + 2] * vj;
    } else {
      const ka = A.aIdx[p] * 3;
      const kb = A.bIdx[p] * 3;
      const tt = A.tPar[p];
      out[j3] = W[ka] + (W[kb] - W[ka]) * tt + A.jit[j3] * ej;
      out[j3 + 1] = W[ka + 1] + (W[kb + 1] - W[ka + 1]) * tt + A.jit[j3 + 1] * ej;
      out[j3 + 2] = W[ka + 2] + (W[kb + 2] - W[ka + 2]) * tt + A.jit[j3 + 2] * ej;
    }
  }
}

/** Cloud (procedural FALLBACK) — several overlapping spheres (lobes) forming a puffy
 *  cloud; each lobe's SURFACE is sampled and points inside any OTHER lobe are dropped
 *  (the union hull), so no interior dots show. The underside is flattened to a base
 *  plane for the classic flat-bottomed cloud. Normalized so its largest extent ==
 *  `span`. The real /models/cloud.glb (sampled via makeBrainFromMesh) replaces this
 *  once it loads — mirrors the brain's procedural→mesh upgrade. */
function makeCloud(n: number, span: number): Float32Array {
  type Lobe = { x: number; y: number; z: number; r: number };
  const lobes: Lobe[] = [
    { x: -1.05, y: -0.02, z: 0.0, r: 0.5 },
    { x: -0.5, y: 0.22, z: 0.12, r: 0.68 },
    { x: 0.15, y: 0.34, z: -0.06, r: 0.8 },
    { x: 0.8, y: 0.18, z: 0.1, r: 0.62 },
    { x: 1.2, y: -0.02, z: 0.0, r: 0.46 },
    { x: 0.05, y: -0.08, z: 0.18, r: 0.86 }, // big central lobe
    { x: -0.25, y: -0.12, z: -0.22, r: 0.58 },
  ];
  const base = -0.12; // flatten the underside to this plane (the cloud's flat bottom)
  let totalArea = 0;
  for (const l of lobes) totalArea += l.r * l.r;
  const out = new Float32Array(n * 3);
  let count = 0;
  let guard = 0;
  const maxGuard = n * 60 + 10000;
  while (count < n && guard < maxGuard) {
    guard++;
    // area-weighted lobe pick
    let pickv = Math.random() * totalArea;
    let li = 0;
    for (; li < lobes.length - 1; li++) {
      pickv -= lobes[li].r * lobes[li].r;
      if (pickv <= 0) break;
    }
    const l = lobes[li];
    // uniform random point on this lobe's surface
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const px = l.x + l.r * s * Math.cos(theta);
    let py = l.y + l.r * u;
    const pz = l.z + l.r * s * Math.sin(theta);
    // union hull: drop points strictly inside another lobe
    let inside = false;
    for (let j = 0; j < lobes.length; j++) {
      if (j === li) continue;
      const o = lobes[j];
      const dx = px - o.x;
      const dy = py - o.y;
      const dz = pz - o.z;
      if (dx * dx + dy * dy + dz * dz < o.r * o.r * 0.94) {
        inside = true;
        break;
      }
    }
    if (inside) continue;
    if (py < base) py = base; // flatten the underside
    out[count * 3] = px;
    out[count * 3 + 1] = py;
    out[count * 3 + 2] = pz;
    count++;
  }
  // wrap-fill if undersampled (rare) so no zeros remain at the origin
  for (let i = count; i < n; i++) {
    const src = (count > 0 ? i % count : 0) * 3;
    out[i * 3] = out[src];
    out[i * 3 + 1] = out[src + 1];
    out[i * 3 + 2] = out[src + 2];
  }
  // normalize: center on the bounding-box midpoint, scale so largest extent == span
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, cz = (mnz + mxz) / 2;
  const ext = Math.max(mxx - mnx, mxy - mny, mxz - mnz) || 1;
  const sc = span / ext;
  for (let i = 0; i < n; i++) {
    out[i * 3] = (out[i * 3] - cx) * sc;
    out[i * 3 + 1] = (out[i * 3 + 1] - cy) * sc;
    out[i * 3 + 2] = (out[i * 3 + 2] - cz) * sc;
  }
  return out;
}

/** A DNA DOUBLE HELIX — the procedural FALLBACK only. The real Experience helix is
 *  surface-sampled from /models/dna.glb (a true-to-life B-form helix with major/minor
 *  grooves; see the GLTF effect + the eased swap in useFrame); this stands in until the
 *  mesh loads, or permanently if the fetch fails (mirrors the brain/cloud fallbacks).
 *
 *  Two sugar-phosphate BACKBONE STRANDS spiral around a common vertical (+y) axis, π out
 *  of phase, joined by horizontal BASE-PAIR RUNGS — the classic twisted-ladder. Points
 *  are split two ways: the two backbone TUBES (a small round cross-section swept along
 *  each helical strand) and the RUNGS (θ snapped to evenly-spaced slots → discrete bars
 *  stepping up the axis, twisting with the strands). The strand cross-section uses a
 *  proper Frenet-ish frame (radial dir + tangent×radial) so each backbone reads as a
 *  solid 3-D tube rather than a flat ribbon. Normalized like makeCloud (center on bbox
 *  midpoint, scale so the largest extent — here the vertical height — == span). */
function makeDNA(n: number, span: number): Float32Array {
  const out = new Float32Array(n * 3);
  const TURNS = 2.5; // full turns of the helix over its height
  const thetaMax = TURNS * Math.PI * 2;
  const HELIX_R = 1.0; // radius from the central axis to each backbone strand
  const HEIGHT = 4.2; // total vertical extent (pre-normalize); > width → reads tall
  const STRAND_TUBE = 0.17; // round cross-section radius of each backbone tube
  const RUNG_TUBE = 0.06; // jitter radius fattening each rung into a readable bar
  const STRAND_FRAC = 0.62; // share of points forming the two backbones (rest → rungs)
  const RUNGS_PER_TURN = 8; // base pairs per full turn → the ladder's step spacing
  const RUNG_COUNT = Math.max(1, Math.round(TURNS * RUNGS_PER_TURN));
  const w = thetaMax; // dθ/dt — angular rate, used for the strand tangent

  for (let i = 0; i < n; i++) {
    const roll = Math.random();

    if (roll < STRAND_FRAC) {
      // ---- BACKBONE STRAND ---- one of the two helices (phase 0 or π), as a round
      // tube of points around the strand's centre curve.
      const strand = Math.random() < 0.5 ? 0 : 1;
      const t = Math.random(); // 0 (bottom) → 1 (top) along the helix
      const theta = t * thetaMax + strand * Math.PI;
      const y = (t - 0.5) * HEIGHT;
      const ct = Math.cos(theta), st = Math.sin(theta);
      // centre-curve point on this strand
      const cx = HELIX_R * ct, cy = y, cz = HELIX_R * st;
      // tube frame perpendicular to the tangent: N1 = radial (outward in x–z, already
      // unit and ⟂ to the tangent), N2 = tangent × N1.
      let tx = -HELIX_R * w * st, ty = HEIGHT, tz = HELIX_R * w * ct; // tangent
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const n1x = ct, n1y = 0, n1z = st; // radial
      let n2x = ty * n1z - tz * n1y, n2y = tz * n1x - tx * n1z, n2z = tx * n1y - ty * n1x;
      const n2l = Math.hypot(n2x, n2y, n2z) || 1; n2x /= n2l; n2y /= n2l; n2z /= n2l;
      const a = Math.random() * Math.PI * 2, rr = STRAND_TUBE * Math.sqrt(Math.random());
      const ca = Math.cos(a) * rr, sa = Math.sin(a) * rr;
      out[i * 3] = cx + n1x * ca + n2x * sa;
      out[i * 3 + 1] = cy + n1y * ca + n2y * sa;
      out[i * 3 + 2] = cz + n1z * ca + n2z * sa;
      continue;
    }

    // ---- BASE-PAIR RUNG ---- snap to a discrete step so points cluster into distinct
    // horizontal bars; each bar spans the full diameter (strand0 → axis → strand1) and
    // twists with the helix, since its angle θ follows the strands at that height.
    const ri = Math.floor(Math.random() * RUNG_COUNT);
    const t = RUNG_COUNT > 1 ? ri / (RUNG_COUNT - 1) : 0.5;
    const theta = t * thetaMax;
    const y = (t - 0.5) * HEIGHT;
    const ct = Math.cos(theta), st = Math.sin(theta);
    const s = Math.random() * 2 - 1; // -1 (strand1) → 0 (axis) → +1 (strand0)
    const px = HELIX_R * ct * s, pz = HELIX_R * st * s;
    out[i * 3] = px + (Math.random() * 2 - 1) * RUNG_TUBE;
    out[i * 3 + 1] = y + (Math.random() * 2 - 1) * RUNG_TUBE;
    out[i * 3 + 2] = pz + (Math.random() * 2 - 1) * RUNG_TUBE;
  }
  // normalize: center on the bounding-box midpoint, scale so largest extent == span
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = out[i * 3], y = out[i * 3 + 1], z = out[i * 3 + 2];
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const ccx = (mnx + mxx) / 2, ccy = (mny + mxy) / 2, ccz = (mnz + mxz) / 2;
  const ext = Math.max(mxx - mnx, mxy - mny, mxz - mnz) || 1;
  const sc = span / ext;
  for (let i = 0; i < n; i++) {
    out[i * 3] = (out[i * 3] - ccx) * sc;
    out[i * 3 + 1] = (out[i * 3 + 1] - ccy) * sc;
    out[i * 3 + 2] = (out[i * 3 + 2] - ccz) * sc;
  }
  return out;
}

/** Build one ORTHOGONAL (right-angle) connection trail of CONN_SAMPLES dots: it
 *  leaves the cloud's edge along one axis, then bends 90° to reach the node — a
 *  circuit-trace look (like the reference image), not a straight radial spread.
 *  Side nodes exit horizontally then turn vertical; top/bottom nodes exit vertically
 *  then turn horizontal. Points are distributed by segment length so the dot spacing
 *  is even across the bend. */
function buildElbow(nx: number, ny: number, nz: number, halfW: number, halfH: number): Float32Array {
  const sgnx = nx >= 0 ? 1 : -1;
  const sgny = ny >= 0 ? 1 : -1;
  let p0: [number, number], p1: [number, number]; // start (cloud core), corner
  const p2: [number, number] = [nx, ny]; // node
  // Anchor the START deep in the cloud's DENSE CORE (near the origin), NOT on a
  // presumed bounding box. makeCloud/cloud.glb centre on the bbox midpoint, but the
  // lobes are puffy on top and flat on the bottom — so the body mass sits below the
  // origin and the upper region is sparse. A start pinned to the box edge floats
  // free of the body for off-axis nodes. Starting in the core and letting the trail
  // pass OUT through the diffuse edge guarantees every trace emerges from the cloud;
  // the visible right-angle elbow still forms outside.
  if (Math.abs(nx) >= Math.abs(ny)) {
    // exit toward the SIDE: leave the core ~horizontally, run to the node's x, turn in.
    p0 = [sgnx * halfW * 0.18, sgny * halfH * 0.12];
    p1 = [nx, sgny * halfH * 0.12];
  } else {
    // exit toward the TOP/BOTTOM: leave the core ~vertically, run to the node's y, turn in.
    p0 = [sgnx * halfW * 0.12, sgny * halfH * 0.18];
    p1 = [sgnx * halfW * 0.12, ny];
  }
  const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const total = l1 + l2 || 1;
  const out = new Float32Array(CONN_SAMPLES * 3);
  for (let i = 0; i < CONN_SAMPLES; i++) {
    const t = i / (CONN_SAMPLES - 1); // 0 (core) → 1 (node) along the whole path
    const d = t * total; // distance along the path
    let x: number, y: number;
    if (d <= l1) {
      const u = l1 > 0 ? d / l1 : 0;
      x = p0[0] + (p1[0] - p0[0]) * u;
      y = p0[1] + (p1[1] - p0[1]) * u;
    } else {
      const u = l2 > 0 ? (d - l1) / l2 : 0;
      x = p1[0] + (p2[0] - p1[0]) * u;
      y = p1[1] + (p2[1] - p1[1]) * u;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = nz; // constant depth — the whole service layer is coplanar, so a
                         // leg never changes depth and stays axis-aligned on screen
  }
  return out;
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
 * A soft TRIANGLE sprite shared by every point cloud (the dala.craftedbygc.com
 * look). Raw THREE.PointsMaterial draws SQUARE points; mapping this texture as
 * the material's alpha clips each quad to a feathered triangle — so the stars
 * and the morphing model read as little triangular glints rather than discs. The
 * shaders rotate gl_PointCoord per particle (by aPhase), so each triangle sits
 * at its own angle; the texture is drawn well inside the canvas with a fully
 * transparent margin so those rotated corners sample the empty border (clamp to
 * edge) and never smear. The white fill is multiplied by each point's vertex
 * color, so the palette is preserved.
 */
function makeTriangleTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const S = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = S / 2;
  const cy = S / 2;
  // equilateral triangle inside a circumcircle of radius R, centred on the
  // canvas so the centroid is the rotation pivot. R = 0.38·S keeps a ~6px
  // transparent margin (plus room for the feather) on every side.
  const R = S * 0.38;
  const apex = (a: number) => [cx + R * Math.cos(a), cy + R * Math.sin(a)] as const;
  const [x0, y0] = apex(-Math.PI / 2); // top vertex
  const [x1, y1] = apex(-Math.PI / 2 + (2 * Math.PI) / 3); // bottom-right
  const [x2, y2] = apex(-Math.PI / 2 + (4 * Math.PI) / 3); // bottom-left
  ctx.clearRect(0, 0, S, S);
  // soft feathered edge so it reads as a glint, not a hard polygon
  ctx.shadowColor = "rgba(255,255,255,0.9)";
  ctx.shadowBlur = 3;
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- palette

// Neutral, theme-matching replacement for the old near-white particle highlight: a soft
// low-saturation lavender-grey that sits with the violet palette instead of glaring
// white. Used wherever a particle was previously pure/near white (the palette core, the
// globe arc heads, the cloud packets). NEUTRAL_LIGHT is its deep counterpart for the
// light theme (a muted slate, like the theme's grey muted-foreground).
const NEUTRAL_DARK = "#a9a6bd";
const NEUTRAL_LIGHT = "#4a4756";

function buildColors(n: number, dark: boolean): Float32Array {
  // Shades of violet around the Plum Voltage brand (#8052ff), keyed to the
  // site: a neutral lavender-grey core (was a near-white highlight), then pale →
  // light → brand → deep-indigo → orchid violets, plus a sparse Lichen-teal
  // glint (the beam's mid-stop, --brand-2). No off-palette amber/magenta.
  const dpal = [NEUTRAL_DARK, "#c9b8ff", "#a78bff", "#8052ff", "#6d4dff", "#b46cff", "#46c2a6"];
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
  varying float vAngle;
  void main() {
    // per-particle triangle rotation — reuse the random aPhase so every triangle
    // sits at its own fixed angle (the fragment shader rotates gl_PointCoord by it).
    vAngle = aPhase;
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
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFront;
  varying float vAngle;
  // signed distance to an equilateral triangle centred at the origin (Inigo
  // Quilez) — lets us draw a CRISP triangle procedurally at any point size, so
  // the shape reads instead of blurring into a dot like a feathered sprite did.
  float sdTri(vec2 p, float r) {
    const float k = 1.7320508; // sqrt(3)
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return -length(p) * sign(p.y);
  }
  void main() {
    // rotate the point-quad coords so each triangle sits at its own angle
    vec2 c = gl_PointCoord - 0.5;
    float sa = sin(vAngle), ca = cos(vAngle);
    vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
    float d = sdTri(rc, 0.42);
    // crisp fill with a thin anti-aliased edge (fixed width — no derivatives,
    // so it compiles on the GLSL ES 1.00 ShaderMaterial path)
    float alpha = 1.0 - smoothstep(0.0, 0.06, d);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(vColor, uOpacity * alpha * vFront);
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

/** Soft round additive sprite for the constellation stars (a glowing dot, not a square). */
function makeRoundSprite(): THREE.Texture {
  const s = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

/**
 * ModelConstellation — the morphing star-network that surrounds EVERY docked model
 * (brain, cloud, DNA, Vitruvian, globe). Bright anchor stars drift on a shell around the
 * shape, and connecting lines appear/dissolve as anchors cross a distance threshold, so
 * the asterisms continuously re-form into new shapes. Lives inside the model's `inner`
 * group, so it docks / tilts / spins with whatever shape is on screen. Its opacity
 * follows dockGate.v (1 when a shape is settled, 0 during scatter / load entry), so it
 * fades out with each transition and back in on the next shape. Self-contained: own
 * buffers + per-frame loop, gated off (skipped) when invisible.
 */
function ModelConstellation() {
  const C = 46; // bright anchor stars
  const SHELL_MIN = 0.6 * FLUX_SPAN;
  const SHELL_MAX = 0.85 * FLUX_SPAN;
  const LINK = 0.42 * FLUX_SPAN; // connect anchors closer than this
  const BREATHE = 0.045 * FLUX_SPAN;
  const maxPairs = (C * (C - 1)) / 2;

  const anchors = useMemo(
    () =>
      Array.from({ length: C }, () => ({
        r: SHELL_MIN + Math.random() * (SHELL_MAX - SHELL_MIN),
        th: Math.random() * Math.PI * 2,
        ph: Math.acos(Math.random() * 2 - 1),
        sth: (Math.random() * 2 - 1) * 0.13, // azimuthal drift speed
        sph: (Math.random() * 2 - 1) * 0.09, // polar drift speed
      })),
    [SHELL_MIN, SHELL_MAX]
  );
  const anchorPos = useMemo(() => new Float32Array(C * 3), []);
  const linePos = useMemo(() => new Float32Array(maxPairs * 2 * 3), [maxPairs]);
  const sprite = useMemo(makeRoundSprite, []);
  useEffect(() => () => sprite.dispose(), [sprite]);
  const ptsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const op = useRef(0);

  useFrame((state, delta) => {
    // ease displayed opacity toward the published gate
    op.current += (dockGate.v - op.current) * Math.min(1, delta * 6);
    const o = op.current;
    if (ptsRef.current) (ptsRef.current.material as THREE.PointsMaterial).opacity = o;
    if (linesRef.current) (linesRef.current.material as THREE.LineBasicMaterial).opacity = o * 0.55;
    if (o < 0.003) return; // invisible — skip the drift + line rebuild

    const t = state.clock.elapsedTime;
    for (let i = 0; i < C; i++) {
      const A = anchors[i];
      const th = A.th + A.sth * t;
      const ph = A.ph + A.sph * t;
      const r = A.r + Math.sin(t * 0.3 + i) * BREATHE; // gentle radial breathing
      const sp = Math.sin(ph);
      anchorPos[i * 3] = r * sp * Math.cos(th);
      anchorPos[i * 3 + 1] = r * Math.cos(ph);
      anchorPos[i * 3 + 2] = r * sp * Math.sin(th);
    }
    let k = 0;
    const d2 = LINK * LINK;
    for (let i = 0; i < C; i++) {
      for (let j = i + 1; j < C; j++) {
        const ax = anchorPos[i * 3], ay = anchorPos[i * 3 + 1], az = anchorPos[i * 3 + 2];
        const bx = anchorPos[j * 3], by = anchorPos[j * 3 + 1], bz = anchorPos[j * 3 + 2];
        const dx = ax - bx, dy = ay - by, dz = az - bz;
        const base = k * 6;
        const within = dx * dx + dy * dy + dz * dz < d2;
        linePos[base] = ax; linePos[base + 1] = ay; linePos[base + 2] = az;
        linePos[base + 3] = within ? bx : ax; // out-of-range → zero-length (invisible)
        linePos[base + 4] = within ? by : ay;
        linePos[base + 5] = within ? bz : az;
        k++;
      }
    }
    if (ptsRef.current)
      (ptsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (linesRef.current)
      (linesRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <group>
      <points ref={ptsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[anchorPos, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.14}
          map={sprite}
          color="#c4b6ff"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
      <lineSegments ref={linesRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePos, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#7b6cff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

function Constellation({ animate, dark }: { animate: boolean; dark: boolean }) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const oceanRef = useRef<THREE.Points>(null); // sea dots, only shown on the globe
  const oceanHovered = useRef(false); // whether the ocean buffer currently holds a hover displacement
  const landFillRef = useRef<THREE.Points>(null); // dense land dots, only on the globe
  const landFillActive = useRef(false); // whether the land-fill buffer is currently displaced (scatter/hover)
  const brainFillRef = useRef<THREE.Points>(null); // dense brain dots, only on the brain
  const brainFillHovered = useRef(false); // whether the brain-fill buffer currently holds a hover displacement
  const dnaFillRef = useRef<THREE.Points>(null); // dense DNA-helix dots, only on Experience
  const dnaFillHovered = useRef(false); // whether the DNA-fill sizes currently hold a hover swell

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
  // continuous auto-spin angle for the DNA helix only — accumulates while the DNA is
  // on screen, resets when it leaves (see the inner-rotation block in useFrame)
  const dnaSpin = useRef(0);
  // the brain points sampled from the real mesh, set once the GLB resolves. The
  // hero shows the brain at load, so rather than a hard swap (a visible snap) the
  // useFrame eases shapes.brain toward this target, then clears it. null = nothing
  // pending (still on the procedural fallback, or already converged).
  const brainTarget = useRef<Float32Array | null>(null);
  // same idea for the dense brain-fill buffer (see brainFillBase below)
  const brainFillTarget = useRef<Float32Array | null>(null);
  // Load-time shatter→rejoin gating. brainReady flips once the real brain mesh is in
  // place (or on load failure, so a missing asset can't stall the intro). entryT0 is
  // the clock time the rejoin began (null while the cloud is still held shattered) —
  // see the entry block in useFrame.
  const brainReady = useRef(false);
  const entryT0 = useRef<number | null>(null);
  // and for the cloud body — sampled from /models/cloud.glb once it resolves, eased
  // into shapes.cloud (procedural makeCloud stands in until then / on failure).
  const cloudTarget = useRef<Float32Array | null>(null);
  // and for the DNA helix — sampled from /models/dna.glb once it resolves, eased into
  // shapes.dna (procedural makeDNA stands in until then / on failure).
  const dnaTarget = useRef<Float32Array | null>(null);
  // and for the Vitruvian Man flux shape — sampled from /models/vitruvian.glb once it
  // resolves, eased into shapes.flux (the procedural dodecahedron seed stands in until
  // then / on failure).
  const fluxTarget = useRef<Float32Array | null>(null);
  // force a render after the async brain load lands while in reduced-motion
  // ("demand" frameloop only renders on request)
  const invalidate = useThree((s) => s.invalidate);
  // reused each frame to unproject the cursor into the cloud's local space
  const cursorLocal = useMemo(() => new THREE.Vector3(), []);

  const shapes = useMemo(() => {
    const s = {
      // (draw, scale, inflate, wrinkle) — inflate puffs the flat outline into 3D
      // flux — the abstract morphing form; seeded at t=0 here, then regenerated every
      // frame in useFrame so it continuously reshapes (see fillFlux).
      flux: (() => {
        const f = new Float32Array(POINT_COUNT * 3);
        fillFlux(f, 0);
        return f;
      })(),
      cloud: makeCloud(POINT_COUNT, CLOUD_SPAN),
      // Experience stage — a DNA double helix; procedural until /models/dna.glb loads
      // and re-samples this buffer (see the GLTF effect + the eased swap in useFrame).
      dna: makeDNA(POINT_COUNT, DNA_SPAN),
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
      // globe + flux are already centred on the origin by construction
      if (key !== "globe" && key !== "flux") centerY(s[key]);
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
  // Same varied violet palette as the morph cloud / brain, so the globe reads in the
  // exact colour scheme as every other model (was a single flat orchid).
  const oceanColors = useMemo(() => buildColors(OCEAN_COUNT, dark), [dark]);
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
  // per-point sizes.
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
  // Same varied violet palette as the morph cloud (was a single flat globe color).
  const landFillColors = useMemo(() => buildColors(LANDFILL_COUNT, dark), [dark]);
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

  // Dense brain fill — extra particles on the Hero/About brain ONLY, sampled off the
  // same mesh as the morph cloud (see the GLTF effect below). Mirrors the ocean dots:
  // fades out during the scatter (so it never needs to scatter itself) and only runs a
  // per-point loop while hovered. brainFillBase is the rest layout; brainFillPositions
  // is the live buffer the hover lens writes into. Seeded with a dense procedural brain
  // until the GLB lands, then eased to the mesh sample (brainFillTarget).
  const brainFillBase = useMemo(() => {
    const a = sampleSilhouette(drawBrain, BRAINFILL_COUNT, BRAIN_SPAN, 0.6 * MODEL_SCALE, 0.35 * MODEL_SCALE);
    centerY(a);
    return a;
  }, []);
  const brainFillPositions = useMemo(() => Float32Array.from(brainFillBase), [brainFillBase]);
  // normalized scatter field ([-1,1]) for the dense fill — drives its load-time
  // shatter→rejoin, scaled by the live viewport each frame like the sparse cloud's.
  const brainFillScatter = useMemo(() => {
    const a = new Float32Array(BRAINFILL_COUNT * 3);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return a;
  }, []);

  // Load the real brain mesh and re-sample shapes.brain off its surface. Like the
  // coastline fetch above, the procedural silhouette stands in until this resolves
  // (and stays if it fails). The brain is the HERO shape: the load-time entry holds
  // the cloud SHATTERED until this lands, then sets the mesh DIRECTLY (an invisible
  // swap — the particles are fully dispersed at that moment) so the rejoin reassembles
  // straight into the real brain. brainReady releasing the hold is what lets the rejoin
  // begin. If the mesh is slow and the rejoin already started (ENTRY_MAX_WAIT), fall
  // back to easing the procedural brain into the mesh (brainTarget) to avoid a snap.
  // In reduced motion (frameloop "demand", useFrame idle) set it directly and render.
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync("/models/brain.glb")
      .then((gltf) => {
        if (cancelled) return;
        const pts = makeBrainFromMesh(gltf.scene, POINT_COUNT, BRAIN_SPAN);
        if (pts.length === 0) {
          brainReady.current = true; // no meshes — release the hold, keep the fallback
          return;
        }
        centerY(pts);
        // dense fill sampled off the same mesh (more points → readable structure)
        const fill = makeBrainFromMesh(gltf.scene, BRAINFILL_COUNT, BRAIN_SPAN);
        const hasFill = fill.length > 0;
        if (hasFill) centerY(fill);
        const applyDirect = () => {
          shapes.brain.set(pts);
          if (hasFill) {
            brainFillBase.set(fill);
            brainFillPositions.set(fill);
            if (brainFillRef.current)
              (brainFillRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          }
        };
        if (animate && entryT0.current !== null) {
          // the rejoin already started (slow load hit ENTRY_MAX_WAIT) — ease the
          // procedural brain into the mesh to avoid a snap, as before
          brainTarget.current = pts;
          if (hasFill) brainFillTarget.current = fill;
        } else {
          // still shattered (or reduced motion): drop the real brain in directly so
          // the rejoin forms IT. Releasing brainReady lets the held rejoin begin.
          applyDirect();
          brainReady.current = true;
          invalidate();
        }
      })
      .catch(() => {
        // keep the procedural fallback brain, but release the hold so the shatter
        // still rejoins (into the stand-in) rather than freezing dispersed forever
        brainReady.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, animate, invalidate, brainFillBase, brainFillPositions]);

  // Load the cloud mesh and re-sample shapes.cloud off its surface — mirrors the
  // brain loader above (procedural makeCloud stands in until this resolves, and stays
  // if it fails / the asset is absent). trimStem is bypassed (it's brain-specific).
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync("/models/cloud.glb")
      .then((gltf) => {
        if (cancelled) return;
        const pts = makeBrainFromMesh(gltf.scene, POINT_COUNT, CLOUD_SPAN, false);
        if (pts.length === 0) return; // no meshes — keep the procedural cloud
        centerY(pts);
        if (animate) {
          cloudTarget.current = pts;
        } else {
          shapes.cloud.set(pts);
          invalidate();
        }
      })
      .catch(() => {
        /* keep the procedural fallback cloud */
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, animate, invalidate]);

  // Load the Vitruvian Man mesh and re-sample shapes.flux off its surface — mirrors the
  // cloud loader (the procedural dodecahedron seed stands in until this resolves, and
  // stays if the asset is absent). The GLB already faces front (drawing in the X/Y plane,
  // thin in Z) via its baked node transform, so NO extra rotation is applied — rotating
  // a flat relief just tips it edge-on. See public/models/README.md.
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync("/models/vitruvian.glb")
      .then((gltf) => {
        if (cancelled) return;
        const pts = makeBrainFromMesh(gltf.scene, POINT_COUNT, FLUX_SPAN, false);
        if (pts.length === 0) return; // no meshes — keep the procedural fallback
        centerY(pts);
        if (animate) {
          fluxTarget.current = pts;
        } else {
          shapes.flux.set(pts);
          invalidate();
        }
      })
      .catch(() => {
        /* keep the procedural fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, animate, invalidate]);

  // soft triangle sprite shared by every cloud (clips the default square points)
  const dot = useMemo(makeTriangleTexture, []);
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

  // Dense brain-fill appearance buffers (the position buffers live above, next to
  // the loaders). Violet palette matches the morph cloud so the two read as one.
  const brainFillColors = useMemo(() => buildColors(BRAINFILL_COUNT, dark), [dark]);
  const brainFillSizes = useMemo(() => {
    const a = new Float32Array(BRAINFILL_COUNT);
    a.fill(1);
    return a;
  }, []);
  const brainFillPhases = useMemo(() => {
    const a = new Float32Array(BRAINFILL_COUNT);
    for (let i = 0; i < BRAINFILL_COUNT; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, []);
  const brainFillMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => brainFillMaterial.dispose(), [brainFillMaterial]);

  // Dense DNA fill — a second, independent particle sampling of the SAME double helix,
  // packed on so the Experience strands + rungs read bold and solid. Seeded procedurally
  // and re-sampled off /models/dna.glb once it loads. A FULL participant like the land
  // fill: it scatters into the full-screen burst during a section transition and reacts
  // to the hover lens, so it needs a live buffer + scatter field (dnaFillBase is the
  // rest layout; dnaFillPositions is what's rendered). Violet palette matches the cloud.
  const dnaFillBase = useMemo(() => makeDNA(DNAFILL_COUNT, DNA_SPAN), []);
  const dnaFillPositions = useMemo(() => Float32Array.from(dnaFillBase), [dnaFillBase]);
  // normalized scatter field ([-1,1]) — scaled by the live viewport each frame
  const dnaFillScatter = useMemo(() => {
    const a = new Float32Array(DNAFILL_COUNT * 3);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    return a;
  }, []);
  const dnaFillColors = useMemo(() => buildColors(DNAFILL_COUNT, dark), [dark]);
  const dnaFillSizes = useMemo(() => {
    const a = new Float32Array(DNAFILL_COUNT);
    a.fill(1);
    return a;
  }, []);
  const dnaFillPhases = useMemo(() => {
    const a = new Float32Array(DNAFILL_COUNT);
    for (let i = 0; i < DNAFILL_COUNT; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, []);
  const dnaFillMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => dnaFillMaterial.dispose(), [dnaFillMaterial]);

  // Load the DNA double-helix mesh and re-sample shapes.dna + the dense DNA fill off
  // its surface — mirrors the cloud loader (procedural makeDNA stands in until this
  // resolves, and stays if it fails / the asset is absent). trimStem is bypassed (it's
  // brain-specific). The Experience section sits well below the fold, so the dense fill
  // is hard-swapped (no visible snap) while the sparse morph cloud eases via dnaTarget,
  // like the cloud body.
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader()
      .loadAsync("/models/dna.glb")
      .then((gltf) => {
        if (cancelled) return;
        const pts = makeBrainFromMesh(gltf.scene, POINT_COUNT, DNA_SPAN, false);
        if (pts.length === 0) return; // no meshes — keep the procedural helix
        centerY(pts);
        // dense fill sampled off the same mesh (more points → readable strands/rungs)
        const fill = makeBrainFromMesh(gltf.scene, DNAFILL_COUNT, DNA_SPAN, false);
        if (fill.length > 0) {
          centerY(fill);
          dnaFillBase.set(fill);
          dnaFillPositions.set(fill); // rest layout the scatter eases back to
          if (dnaFillRef.current)
            (dnaFillRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
        if (animate) {
          dnaTarget.current = pts;
        } else {
          shapes.dna.set(pts);
        }
        invalidate();
      })
      .catch(() => {
        /* keep the procedural fallback helix */
      });
    return () => {
      cancelled = true;
    };
  }, [shapes, animate, invalidate, dnaFillBase, dnaFillPositions]);

  // ---- globe data arcs (Contact globe only) ----
  // Great-circle trails Alappuzha → hubs with bright travelling heads. Like the
  // ocean dots they fade in with globeness and gate off during the scatter; the
  // far-hemisphere portion hides via the shared front/back shader (uGlobeness). They
  // live in the `inner` group, so they ride the globe's tilt. Trails are static
  // (set once); only opacity (per-frame uniform) and the heads animate.
  const arcRef = useRef<THREE.Points>(null);
  const headsRef = useRef<THREE.Points>(null);
  const arcs = useMemo(
    () => ARC_HUBS.map((h) => buildArc(ARC_SOURCE.lon, ARC_SOURCE.lat, h.lon, h.lat, GLOBE_RADIUS)),
    []
  );
  const arcPositions = useMemo(() => {
    const a = new Float32Array(arcs.length * ARC_SAMPLES * 3);
    arcs.forEach((arc, k) => a.set(arc, k * ARC_SAMPLES * 3));
    return a;
  }, [arcs]);
  const arcColors = useMemo(() => {
    // violet → teal gradient along each arc, matching the site palette
    const a = new Float32Array(arcs.length * ARC_SAMPLES * 3);
    const cv = new THREE.Color("#8052ff");
    const ct = new THREE.Color("#46c2a6");
    const c = new THREE.Color();
    for (let k = 0; k < arcs.length; k++) {
      for (let i = 0; i < ARC_SAMPLES; i++) {
        c.copy(cv).lerp(ct, i / (ARC_SAMPLES - 1));
        const o = (k * ARC_SAMPLES + i) * 3;
        a[o] = c.r;
        a[o + 1] = c.g;
        a[o + 2] = c.b;
      }
    }
    return a;
  }, [arcs]);
  const arcSizes = useMemo(() => {
    const a = new Float32Array(arcs.length * ARC_SAMPLES);
    a.fill(0.85);
    return a;
  }, [arcs]);
  const arcPhases = useMemo(() => {
    const a = new Float32Array(arcs.length * ARC_SAMPLES);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, [arcs]);
  // one travelling head per arc, recycled with a fresh speed at the far end
  const arcHeads = useMemo(
    () => arcs.map((_, i) => ({ arc: i, t: Math.random(), speed: 0.22 + Math.random() * 0.22 })),
    [arcs]
  );
  const headPositions = useMemo(() => new Float32Array(arcHeads.length * 3), [arcHeads]);
  const headColors = useMemo(() => {
    const a = new Float32Array(arcHeads.length * 3);
    const c = new THREE.Color(dark ? NEUTRAL_DARK : NEUTRAL_LIGHT); // neutral beam head
    for (let i = 0; i < arcHeads.length; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    return a;
  }, [arcHeads, dark]);
  const headSizes = useMemo(() => {
    const a = new Float32Array(arcHeads.length);
    a.fill(2.4);
    return a;
  }, [arcHeads]);
  const headPhases = useMemo(() => new Float32Array(arcHeads.length), [arcHeads]);
  const arcMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => arcMaterial.dispose(), [arcMaterial]);
  const headMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => headMaterial.dispose(), [headMaterial]);

  // ---- cloud connected services (Skills cloud only) ----
  // Service nodes ringed around the cloud, fed by dotted connection trails with a
  // bright packet flowing out along each. Mirrors the globe arcs: separate layers in
  // the `inner` group, faded in by `cloudness` and off during the scatter. Trails +
  // nodes are static; only the packets animate.
  const connRef = useRef<THREE.Points>(null);
  const nodesRef = useRef<THREE.Points>(null);
  const pktRef = useRef<THREE.Points>(null);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cloudNodes = useMemo(() => {
    // an evenly-spaced elliptical ring (wider than tall, like the cloud), held
    // perfectly FLAT (z = 0). The whole service layer is one camera-facing plane, so
    // every connector leg projects as a true horizontal / vertical (no depth slant).
    // Sized so each node + its icon stays clear of the cloud and on screen.
    const R = CLOUD_SPAN * 0.78;
    const arr: [number, number, number][] = [];
    for (let i = 0; i < CLOUD_NODE_COUNT; i++) {
      const a = (i / CLOUD_NODE_COUNT) * Math.PI * 2 + 0.35;
      arr.push([
        Math.cos(a) * R * 0.95 + NODE_OFFSET[i][0],
        Math.sin(a) * R * 0.62 + NODE_OFFSET[i][1],
        0,
      ]);
    }
    return arr;
  }, []);
  const conns = useMemo(
    () =>
      cloudNodes.map((nd, i) => {
        const ox = NODE_OFFSET[i][0];
        const oy = NODE_OFFSET[i][1];
        // build the elbow from the UN-nudged node (so its in-core origin is computed
        // correctly), then translate the whole trace by the node's offset — origin and
        // endpoint shift with the icon, and the pure shift keeps every leg perpendicular.
        const e = buildElbow(nd[0] - ox, nd[1] - oy, nd[2], CLOUD_HALF_W, CLOUD_HALF_H);
        for (let k = 0; k < e.length; k += 3) {
          e[k] += ox;
          e[k + 1] += oy;
        }
        return e;
      }),
    [cloudNodes]
  );
  const connPositions = useMemo(() => {
    const a = new Float32Array(conns.length * CONN_SAMPLES * 3);
    conns.forEach((c, k) => a.set(c, k * CONN_SAMPLES * 3));
    return a;
  }, [conns]);
  const connColors = useMemo(() => {
    // violet → teal gradient out toward each node, matching the arcs
    const a = new Float32Array(conns.length * CONN_SAMPLES * 3);
    const cv = new THREE.Color("#8052ff");
    const ct = new THREE.Color("#46c2a6");
    const c = new THREE.Color();
    for (let k = 0; k < conns.length; k++) {
      for (let i = 0; i < CONN_SAMPLES; i++) {
        c.copy(cv).lerp(ct, i / (CONN_SAMPLES - 1));
        const o = (k * CONN_SAMPLES + i) * 3;
        a[o] = c.r;
        a[o + 1] = c.g;
        a[o + 2] = c.b;
      }
    }
    return a;
  }, [conns]);
  const connSizes = useMemo(() => {
    const a = new Float32Array(conns.length * CONN_SAMPLES);
    a.fill(1.3);
    return a;
  }, [conns]);
  const connPhases = useMemo(() => {
    const a = new Float32Array(conns.length * CONN_SAMPLES);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, [conns]);
  const nodePositions = useMemo(() => {
    const a = new Float32Array(cloudNodes.length * 3);
    cloudNodes.forEach((nd, k) => {
      a[k * 3] = nd[0];
      a[k * 3 + 1] = nd[1];
      a[k * 3 + 2] = nd[2];
    });
    return a;
  }, [cloudNodes]);
  const nodeColors = useMemo(() => {
    const a = new Float32Array(cloudNodes.length * 3);
    const c = new THREE.Color("#46c2a6").lerp(new THREE.Color("#f3f1ff"), 0.3);
    for (let i = 0; i < cloudNodes.length; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    return a;
  }, [cloudNodes]);
  const nodeSizes = useMemo(() => {
    const a = new Float32Array(cloudNodes.length);
    a.fill(4); // a soft glow behind each icon (the icon itself is the focal mark)
    return a;
  }, [cloudNodes]);
  const nodePhases = useMemo(() => {
    const a = new Float32Array(cloudNodes.length);
    for (let i = 0; i < cloudNodes.length; i++) a[i] = Math.random() * Math.PI * 2;
    return a;
  }, [cloudNodes]);
  // one packet per connection, flowing cloud → node, recycled at the far end
  const cloudPackets = useMemo(
    () => conns.map((_, i) => ({ conn: i, t: Math.random(), speed: 0.3 + Math.random() * 0.3 })),
    [conns]
  );
  const pktPositions = useMemo(() => new Float32Array(cloudPackets.length * 3), [cloudPackets]);
  const pktColors = useMemo(() => {
    const a = new Float32Array(cloudPackets.length * 3);
    const c = new THREE.Color(dark ? NEUTRAL_DARK : NEUTRAL_LIGHT);
    for (let i = 0; i < cloudPackets.length; i++) {
      a[i * 3] = c.r;
      a[i * 3 + 1] = c.g;
      a[i * 3 + 2] = c.b;
    }
    return a;
  }, [cloudPackets, dark]);
  const pktSizes = useMemo(() => {
    const a = new Float32Array(cloudPackets.length);
    a.fill(3);
    return a;
  }, [cloudPackets]);
  const pktPhases = useMemo(() => new Float32Array(cloudPackets.length), [cloudPackets]);
  const connMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => connMaterial.dispose(), [connMaterial]);
  const nodeMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => nodeMaterial.dispose(), [nodeMaterial]);
  const pktMaterial = useMemo(() => makePointShaderMaterial(dot, dark), [dot, dark]);
  useEffect(() => () => pktMaterial.dispose(), [pktMaterial]);

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
        varying float vAngle;
        void main() {
          // per-particle triangle rotation (same scheme as the model shader)
          vAngle = aPhase;
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
        varying float vAngle;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float sa = sin(vAngle), ca = cos(vAngle);
          vec2 rc = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca) + 0.5;
          vec4 tex = texture2D(uMap, rc);
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
    // same eased swap for the cloud body once /models/cloud.glb resolves
    if (cloudTarget.current) {
      const t = cloudTarget.current;
      const src = shapes.cloud;
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
        cloudTarget.current = null;
      }
    }
    // same eased swap for the DNA helix once /models/dna.glb resolves
    if (dnaTarget.current) {
      const t = dnaTarget.current;
      const src = shapes.dna;
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
        dnaTarget.current = null;
      }
    }
    // same eased swap for the Vitruvian flux shape once /models/vitruvian.glb resolves —
    // the dodecahedron seed morphs once into the real figure, then holds (the figure is
    // intentionally still; the surrounding constellation provides the motion).
    if (fluxTarget.current) {
      const t = fluxTarget.current;
      const src = shapes.flux;
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
        fluxTarget.current = null;
      }
    }
    // same eased swap for the dense brain fill; it isn't recomputed every frame, so
    // push the eased base into the live buffer here while the swap is in flight.
    if (brainFillTarget.current && brainFillRef.current) {
      const t = brainFillTarget.current;
      const src = brainFillBase;
      const e = Math.min(1, delta * 2);
      let maxd = 0;
      for (let j = 0; j < src.length; j++) {
        const d = t[j] - src[j];
        src[j] += d * e;
        const ad = d < 0 ? -d : d;
        if (ad > maxd) maxd = ad;
      }
      brainFillPositions.set(brainFillBase);
      (brainFillRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      if (maxd < 0.002) {
        src.set(t);
        brainFillPositions.set(t);
        brainFillTarget.current = null;
      }
    }

    // entry: hold the cloud SHATTERED until the real brain mesh is ready (or the
    // ENTRY_MAX_WAIT fallback fires), then REJOIN from the scatter field over ENTRY_DUR
    // — so the particles reassemble straight into the actual brain instead of forming
    // the procedural stand-in first and then visibly morphing. entryT0 latches the
    // moment the rejoin begins; a short ENTRY_MIN_HOLD keeps the burst on screen even
    // when the mesh is instantly ready (e.g. cached). `entry` drives the position
    // assembly; `entryFade` ramps opacity fast so the dispersed shatter stays visible.
    const elapsed = state.clock.elapsedTime;
    if (
      animate &&
      entryT0.current === null &&
      ((brainReady.current && elapsed >= ENTRY_MIN_HOLD) || elapsed > ENTRY_MAX_WAIT)
    ) {
      entryT0.current = elapsed;
    }
    const entry = !animate
      ? 1
      : entryT0.current === null
        ? 0
        : easeOutCubic(clamp01((elapsed - entryT0.current) / ENTRY_DUR));
    const entryFade = animate ? clamp01(elapsed / ENTRY_FADE) : 1;

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
    // flux (the Vitruvian Man) is a STILL shape now — its buffer is the sampled mesh
    // (eased in above), not regenerated each frame. The motion at this stage comes from
    // the surrounding FluxConstellation, not the figure.
    const a = shapes[ORDER[i]];
    const b = shapes[ORDER[next]];
    const mf = easeInOut(tt);
    // A gap between two IDENTICAL adjacent shapes (Hero↔About brain, Projects↔
    // Education Vitruvian Man) spins about the vertical Y axis instead of scattering:
    // the morph is a no-op there, so a clean turn reads better than a dissolve. The
    // brain turns 180°, the Vitruvian a full 360° (see SECTION_YAW). Mixed-shape gaps
    // scatter as before (env drives the full-screen spread).
    const spinGap = ORDER[i] === ORDER[next];
    // scatter envelope — a bell over the crossover. Fed the EASED mf (not raw tt)
    // so it leaves/returns to rest with zero velocity: particles ease outward and
    // ease back in smoothly instead of jolting at the start/end of the burst.
    const env = animate && !spinGap ? Math.sin(Math.PI * mf) : 0;
    // Y-rotation: ease from this section's target yaw to the next's (SECTION_YAW).
    // The brain gap turns a VISIBLE 180°, the </> gap a VISIBLE 360°; the mixed gap
    // after a 180° adds a HIDDEN 180° (under the scatter) to re-front the next glyph.
    // Interpolating absolute per-section yaws keeps rotation.y continuous across
    // every boundary, so there's no snap even though the brain ends facing backward.
    const rollY = animate ? lerp(SECTION_YAW[i], SECTION_YAW[next], mf) : 0;
    // how much of the CURRENT blended shape is the world globe (0..1) — drives the
    // ocean + land-fill opacity and the morph cloud's globe tint / front-back fade.
    const globeness =
      (ORDER[i] === "globe" ? 1 - mf : 0) + (ORDER[next] === "globe" ? mf : 0);
    // how much of the CURRENT blended shape is the brain (0..1) — drives the dense
    // brain-fill opacity and shrinks the morph cloud's points to match the fill.
    const brainness =
      (ORDER[i] === "brain" ? 1 - mf : 0) + (ORDER[next] === "brain" ? mf : 0);
    // how much of the CURRENT blended shape is the cloud (0..1) — drives the
    // connection / node / packet layer opacity (invisible off the cloud stage).
    const cloudness =
      (ORDER[i] === "cloud" ? 1 - mf : 0) + (ORDER[next] === "cloud" ? mf : 0);
    // how much of the CURRENT blended shape is the DNA helix (0..1) — drives the dense
    // DNA-fill opacity and shrinks the morph cloud's points to match the fill.
    const dnaness =
      (ORDER[i] === "dna" ? 1 - mf : 0) + (ORDER[next] === "dna" ? mf : 0);
    // the surrounding star-network shows around EVERY settled model: gate purely on
    // docked-ness — 1 when a shape is held (env 0) and assembled (entry 1), fading to 0
    // during the scatter and the load entry. Published so ModelConstellation reads it.
    dockGate.v = (1 - env) * entry;
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
      // hover SIZE lens (the dala.ai feel): points near the cursor simply grow —
      // biggest at the cursor, smoothly shrinking to base size at the rim. No
      // positional push, so the cloud never tears open a void; the triangles just
      // swell toward the pointer (and the bigger they get, the more their shape
      // reads) and ease back down as the cursor moves away.
      let grow = 0;
      if (lens > 0.001) {
        // 2D (screen-plane) distance — ignore depth so the lens reaches points at
        // ANY z under the cursor. Essential for the hollow globe shell, whose
        // surface points otherwise all sit ~radius away from a z=0 cursor in 3D.
        const dx = mx - lcx;
        const dy = my - lcy;
        const cd2 = dx * dx + dy * dy;
        if (cd2 < HOVER_R2) {
          const f = 1 - Math.sqrt(cd2) / HOVER_RADIUS; // 1 at cursor → 0 at the rim
          const ff = f * f * (3 - 2 * f); // smoothstep falloff for a soft gradient
          grow = HOVER_GROW * ff * lens; // bigger triangles under the pointer
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

    // ocean sea-dots: only on the settled globe — fade in with globeness, gated
    // off during the scatter (1 - env) so they don't appear while it's dispersed.
    // uGlobeness drives the front/back fade so the far-hemisphere sea hides too.
    const oc = oceanMaterial.uniforms;
    oc.uSize.value = (dark ? 0.02 : 0.018) * PARTICLE_SIZE * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
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
          const f = 1 - Math.sqrt(cd2) / HOVER_RADIUS;
          const ff = f * f * (3 - 2 * f);
          grow = HOVER_GROW * ff * lens;
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
    lf.uSize.value = (dark ? 0.032 : 0.03) * PARTICLE_SIZE * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
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
            const f = 1 - Math.sqrt(cd2) / HOVER_RADIUS;
            const ff = f * f * (3 - 2 * f);
            grow = HOVER_GROW * ff * lens;
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

    // dense brain fill — extra brain dots, on the Hero/About brain only. Like the
    // ocean it fades out during the scatter (1 - env) so it never has to scatter,
    // and only runs a per-point loop while hovered; otherwise it holds its rest
    // layout. It lives inside the inner group, so it docks / tilts / spins with the
    // brain. No front/back fade (uGlobeness 0) — the brain isn't a sphere shell.
    const bf = brainFillMaterial.uniforms;
    bf.uSize.value = (dark ? 0.034 : 0.03) * PARTICLE_SIZE * state.gl.getPixelRatio();
    bf.uScale.value = state.size.height * 0.5;
    // stays LIT while it bursts apart (no (1 - env)) like the land fill / sparse cloud,
    // so the whole brain scatters as one bright burst; brainness fades it out as the
    // brain hands off to the next shape.
    bf.uOpacity.value = (dark ? 0.95 : 0.9) * brainness * entryFade * (mobile ? 0.6 : 1);
    bf.uTime.value = state.clock.elapsedTime;
    bf.uShimmer.value = animate ? 1 : 0;
    bf.uGlobeness.value = 0;
    // A FULL participant like the land fill: it scatters into the full-screen burst
    // during a section transition (env) AND flies in from the shatter on the load entry
    // (entry), exactly like the sparse cloud — so the WHOLE brain disperses, leaving no
    // lingering structure on screen. The per-point loop runs only while it's actually
    // moving (transition / entry / hover); on the settled brain it holds its rest layout
    // (reset once). (A brain→brain spin gap has env 0, so it spins in shape, not scatter.)
    const bfMoving = brainness > 0.001 && (env > 0.001 || lens > 0.001 || entry < 0.999);
    if (brainFillRef.current && bfMoving) {
      for (let q = 0; q < BRAINFILL_COUNT; q++) {
        const ix = q * 3;
        const iy = ix + 1;
        const iz = ix + 2;
        const mx = brainFillBase[ix];
        const my = brainFillBase[iy];
        const mz = brainFillBase[iz];
        // hover swell (size only)
        let grow = 0;
        if (lens > 0.001) {
          const dx = mx - lcx;
          const dy = my - lcy;
          const cd2 = dx * dx + dy * dy;
          if (cd2 < HOVER_R2) {
            const f = 1 - Math.sqrt(cd2) / HOVER_RADIUS;
            const ff = f * f * (3 - 2 * f);
            grow = HOVER_GROW * ff * lens;
          }
        }
        brainFillSizes[q] = 1 + grow;
        // scatter blend, then entry blend — identical pipeline to the morph cloud
        const ex = lerp(mx, brainFillScatter[ix] * sx, env);
        const ey = lerp(my, brainFillScatter[iy] * sy, env);
        const ez = lerp(mz, brainFillScatter[iz] * sz, env);
        brainFillPositions[ix] = lerp(brainFillScatter[ix] * sx, ex, entry);
        brainFillPositions[iy] = lerp(brainFillScatter[iy] * sy, ey, entry);
        brainFillPositions[iz] = lerp(brainFillScatter[iz] * sz, ez, entry);
      }
      const bg = brainFillRef.current.geometry;
      (bg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (bg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      brainFillHovered.current = true;
    } else if (brainFillRef.current && brainFillHovered.current) {
      brainFillPositions.set(brainFillBase);
      brainFillSizes.fill(1);
      const bg = brainFillRef.current.geometry;
      (bg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (bg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      brainFillHovered.current = false;
    }

    // dense DNA fill — extra particles sampling the same double helix, on the
    // Experience section only. A FULL participant like the brain fill / land fill: it
    // scatters into the full-screen burst during a section transition (env) so the whole
    // helix disperses with no lingering structure, and reacts to the hover size-lens.
    const cf = dnaFillMaterial.uniforms;
    cf.uSize.value = (dark ? 0.03 : 0.027) * PARTICLE_SIZE * state.gl.getPixelRatio();
    cf.uScale.value = state.size.height * 0.5;
    // stays LIT while it bursts apart (no (1 - env)); dnaness fades it out as the helix
    // hands off to the next shape.
    cf.uOpacity.value = (dark ? 0.9 : 0.85) * dnaness * entry * (mobile ? 0.6 : 1);
    cf.uTime.value = state.clock.elapsedTime;
    cf.uShimmer.value = animate ? 1 : 0;
    cf.uGlobeness.value = 0;
    // runs only while moving (transition / entry / hover); on the settled helix it holds
    // its rest layout (reset once).
    const dfMoving = dnaness > 0.001 && (env > 0.001 || lens > 0.001 || entry < 0.999);
    if (dnaFillRef.current && dfMoving) {
      for (let q = 0; q < DNAFILL_COUNT; q++) {
        const ix = q * 3;
        const iy = ix + 1;
        const iz = ix + 2;
        const mx = dnaFillBase[ix];
        const my = dnaFillBase[iy];
        const mz = dnaFillBase[iz];
        // hover swell (size only)
        let grow = 0;
        if (lens > 0.001) {
          const dx = mx - lcx;
          const dy = my - lcy;
          const cd2 = dx * dx + dy * dy;
          if (cd2 < HOVER_R2) {
            const f = 1 - Math.sqrt(cd2) / HOVER_RADIUS;
            const ff = f * f * (3 - 2 * f);
            grow = HOVER_GROW * ff * lens;
          }
        }
        dnaFillSizes[q] = 1 + grow;
        // scatter blend, then entry blend — identical pipeline to the morph cloud
        const ex = lerp(mx, dnaFillScatter[ix] * sx, env);
        const ey = lerp(my, dnaFillScatter[iy] * sy, env);
        const ez = lerp(mz, dnaFillScatter[iz] * sz, env);
        dnaFillPositions[ix] = lerp(dnaFillScatter[ix] * sx, ex, entry);
        dnaFillPositions[iy] = lerp(dnaFillScatter[iy] * sy, ey, entry);
        dnaFillPositions[iz] = lerp(dnaFillScatter[iz] * sz, ez, entry);
      }
      const dg = dnaFillRef.current.geometry;
      (dg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (dg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      dnaFillHovered.current = true;
    } else if (dnaFillRef.current && dnaFillHovered.current) {
      dnaFillPositions.set(dnaFillBase);
      dnaFillSizes.fill(1);
      const dg = dnaFillRef.current.geometry;
      (dg.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (dg.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
      dnaFillHovered.current = false;
    }

    // globe data arcs — faint great-circle trails + bright travelling heads, only on
    // the Contact globe. Opacity gates on globeness (invisible off the globe) and on
    // (1 - env) so they vanish during the scatter; uGlobeness hides the far-hemisphere
    // portion. The trails are static; only the heads move (a tiny per-arc loop, run
    // only while the globe is on screen).
    const ar = arcMaterial.uniforms;
    ar.uSize.value = (dark ? 0.03 : 0.028) * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
    ar.uScale.value = state.size.height * 0.5;
    ar.uOpacity.value = (dark ? 0.78 : 0.68) * globeness * (1 - env) * entry;
    ar.uTime.value = state.clock.elapsedTime;
    ar.uShimmer.value = animate ? 0.4 : 0;
    ar.uGlobeness.value = globeness;
    const hd = headMaterial.uniforms;
    hd.uSize.value = (dark ? 0.05 : 0.045) * state.gl.getPixelRatio();
    hd.uScale.value = state.size.height * 0.5;
    hd.uOpacity.value = (dark ? 1 : 0.95) * globeness * (1 - env) * entry;
    hd.uTime.value = state.clock.elapsedTime;
    hd.uShimmer.value = 0;
    hd.uGlobeness.value = globeness;
    if (headsRef.current && globeness > 0.001) {
      for (let h = 0; h < arcHeads.length; h++) {
        const head = arcHeads[h];
        if (animate) {
          head.t += delta * head.speed;
          if (head.t >= 1) {
            head.t = 0;
            head.speed = 0.22 + Math.random() * 0.22;
          }
        }
        const arc = arcs[head.arc];
        const f = head.t * (ARC_SAMPLES - 1);
        const i0 = Math.min(ARC_SAMPLES - 1, Math.floor(f));
        const i1 = Math.min(ARC_SAMPLES - 1, i0 + 1);
        const fr = f - i0;
        headPositions[h * 3] = arc[i0 * 3] + (arc[i1 * 3] - arc[i0 * 3]) * fr;
        headPositions[h * 3 + 1] = arc[i0 * 3 + 1] + (arc[i1 * 3 + 1] - arc[i0 * 3 + 1]) * fr;
        headPositions[h * 3 + 2] = arc[i0 * 3 + 2] + (arc[i1 * 3 + 2] - arc[i0 * 3 + 2]) * fr;
      }
      (headsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // cloud connected services — trails + nodes + flowing packets, only on the Skills
    // cloud. Opacity gates on cloudness and (1 - env) so they fade in on settle and
    // vanish during the scatter. Trails/nodes are static; packets ride their trail
    // (a tiny per-packet loop, run only while the cloud is on screen).
    const cn = connMaterial.uniforms;
    cn.uSize.value = (dark ? 0.045 : 0.042) * state.gl.getPixelRatio();
    cn.uScale.value = state.size.height * 0.5;
    cn.uOpacity.value = (dark ? 0.95 : 0.85) * cloudness * (1 - env) * entry;
    cn.uTime.value = state.clock.elapsedTime;
    cn.uShimmer.value = animate ? 0.25 : 0; // steadier so the lines read as lines
    cn.uGlobeness.value = 0;
    const nm = nodeMaterial.uniforms;
    nm.uSize.value = (dark ? 0.09 : 0.08) * state.gl.getPixelRatio();
    nm.uScale.value = state.size.height * 0.5;
    nm.uOpacity.value = (dark ? 1 : 0.95) * cloudness * (1 - env) * entry;
    nm.uTime.value = state.clock.elapsedTime;
    nm.uShimmer.value = animate ? 0.5 : 0;
    nm.uGlobeness.value = 0;
    const pk = pktMaterial.uniforms;
    pk.uSize.value = (dark ? 0.06 : 0.055) * state.gl.getPixelRatio();
    pk.uScale.value = state.size.height * 0.5;
    pk.uOpacity.value = (dark ? 1 : 0.95) * cloudness * (1 - env) * entry;
    pk.uTime.value = state.clock.elapsedTime;
    pk.uShimmer.value = 0;
    pk.uGlobeness.value = 0;
    if (pktRef.current && cloudness > 0.001) {
      for (let q = 0; q < cloudPackets.length; q++) {
        const p = cloudPackets[q];
        if (animate) {
          p.t += delta * p.speed;
          if (p.t >= 1) {
            p.t = 0;
            p.speed = 0.3 + Math.random() * 0.3;
          }
        }
        const c = conns[p.conn];
        const f = p.t * (CONN_SAMPLES - 1);
        const i0 = Math.min(CONN_SAMPLES - 1, Math.floor(f));
        const i1 = Math.min(CONN_SAMPLES - 1, i0 + 1);
        const fr = f - i0;
        pktPositions[q * 3] = c[i0 * 3] + (c[i1 * 3] - c[i0 * 3]) * fr;
        pktPositions[q * 3 + 1] = c[i0 * 3 + 1] + (c[i1 * 3 + 1] - c[i0 * 3 + 1]) * fr;
        pktPositions[q * 3 + 2] = c[i0 * 3 + 2] + (c[i1 * 3 + 2] - c[i0 * 3 + 2]) * fr;
      }
      (pktRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    // fade the service ICONS (DOM via <Html>) with the cloud stage — same gate as the
    // connection/node/packet layers. Imperative DOM writes (no React re-render).
    const iconOp = cloudness * (1 - env) * entry;
    for (let q = 0; q < iconRefs.current.length; q++) {
      const el = iconRefs.current[q];
      if (el) el.style.opacity = iconOp < 0.01 ? "0" : iconOp.toFixed(3);
    }

    // drive the morph cloud's material. On the GLOBE its (sparse) land dots ease to
    // the dense land-fill style — size → 0.032, opacity, shimmer → 0.5 — so they
    // blend into the dense fill rather than reading as a second, chunkier layer. The
    // colour is left untinted so the globe keeps the shared violet palette (the land
    // fill now uses the same palette). uGlobeness drives the shared front/back fade.
    const mu = modelMaterial.uniforms;
    // shrink the (chunky) morph points wherever a dense companion fill exists — the
    // globe (land fill), the brain (brain fill) AND the DNA helix (DNA fill) — so
    // the two layers read as one fine cloud instead of chunky dots over fine ones.
    const dense = Math.max(globeness, brainness, dnaness);
    const landBase = dark ? lerp(0.055, 0.032, dense) : lerp(0.05, 0.03, dense);
    mu.uSize.value = landBase * PARTICLE_SIZE * state.gl.getPixelRatio() * (1 + 0.3 * globeness);
    mu.uScale.value = state.size.height * 0.5;
    mu.uOpacity.value =
      lerp(dark ? 0.95 : 0.85, dark ? 0.95 : 0.9, globeness) *
      entryFade *
      (mobile ? lerp(0.55, 0.6, globeness) : 1);
    mu.uTime.value = state.clock.elapsedTime;
    mu.uShimmer.value = animate ? lerp(1, 0.5, globeness) : 0;
    mu.uGlobeness.value = globeness;
    mu.uTintAmount.value = 0; // no globe tint — keep the shared violet palette

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
      // DNA-only auto-spin, applied only while the helix is DOCKED so scattered
      // particles never rotate. It accumulates when the DNA is on screen AND essentially
      // un-scattered (env≈0); the instant a transition begins (env rises past the
      // threshold) the angle FREEZES — the burst disperses without spinning. At the peak
      // of the burst (env near 1, fully dispersed) the angle is dropped to 0, an
      // invisible reset at max dispersal, so the cloud re-docks on the neighbouring shape
      // with no leftover rotation. Applied directly (not ×dnaness): off the DNA dnaSpin
      // is 0, so no other shape ever inherits a rotation.
      if (animate && dnaness > 0.5 && env < 0.03) dnaSpin.current += delta * DNA_SPIN_SPEED;
      else if (env > 0.95 || dnaness < 0.001) dnaSpin.current = 0;
      inner.current.rotation.y = tiltY.current + rollY + dnaSpin.current;
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
    su.uOpacity.value = (dark ? 0.85 : 0.6) * entryFade;
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
          {/* dense brain fill — extra particles on the Hero/About brain only
              (opacity gated by brainness, hover lens in useFrame). Inside the inner
              group, so it docks / tilts / spins with the brain. */}
          <points ref={brainFillRef} material={brainFillMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[brainFillPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[brainFillColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[brainFillSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[brainFillPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* dense DNA fill — extra particles on the Experience double helix only
              (opacity gated by dnaness, hover size-lens in useFrame). Inside the inner
              group, so it docks / tilts / spins with the helix. Full participant:
              scatters with the transition (positions animated in useFrame). */}
          <points ref={dnaFillRef} material={dnaFillMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[dnaFillPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[dnaFillColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[dnaFillSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[dnaFillPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* morphing star-network around EVERY model (opacity follows dockGate in
              useFrame — fades out during transitions). Inside `inner`, so it docks /
              tilts / spins with whatever shape is on screen. */}
          <ModelConstellation />
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
          {/* globe data arcs — faint great-circle trails from Alappuzha (opacity
              gated by globeness; invisible off the globe). Inside `inner`, so they
              tilt with the globe. */}
          <points ref={arcRef} material={arcMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[arcPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[arcColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[arcSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[arcPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* bright travelling heads riding each arc (position animated in useFrame) */}
          <points ref={headsRef} material={headMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[headPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[headColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[headSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[headPhases, 1]} />
            </bufferGeometry>
          </points>
        </group>
        {/* cloud connected services — trails + node glows + packets + icons. Kept
            OUTSIDE the tilting `inner` group as a FLAT, camera-facing layer (every
            point at z = 0) so each right-angle connector stays perfectly perpendicular
            on screen AT ALL TIMES — `inner`'s cursor tilt would otherwise foreshorten
            the legs into slants. Still a child of `outer`, so it docks / scales with
            the cloud (cloudness gates its opacity in useFrame; off the cloud stage it
            fades to invisible). */}
        <group>
          <points ref={connRef} material={connMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[connPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[connColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[connSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[connPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* glowing service nodes at the end of each trail */}
          <points ref={nodesRef} material={nodeMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[nodePositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[nodeColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[nodeSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[nodePhases, 1]} />
            </bufferGeometry>
          </points>
          {/* bright packets flowing cloud → node (position animated in useFrame) */}
          <points ref={pktRef} material={pktMaterial} frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pktPositions, 3]} />
              <bufferAttribute attach="attributes-aColor" args={[pktColors, 3]} />
              <bufferAttribute attach="attributes-aSize" args={[pktSizes, 1]} />
              <bufferAttribute attach="attributes-aPhase" args={[pktPhases, 1]} />
            </bufferGeometry>
          </points>
          {/* real service ICONS (lucide) at each node, projected to screen by drei
              <Html>. In the flat service group, so they dock with the cloud (no tilt)
              and line up with the perpendicular trails. Opacity is driven per frame
              from `cloudness` (see useFrame) so they fade with the stage. Flat,
              pointer-events-none, behind page content like the rest of the backdrop. */}
          {cloudNodes.map((nd, i) => {
            const Icon = SERVICE_ICONS[i % SERVICE_ICONS.length];
            return (
              <Html key={i} position={nd} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
                <div
                  ref={(el) => {
                    iconRefs.current[i] = el;
                  }}
                  style={{
                    opacity: 0,
                    color: dark ? "#8ff0dd" : "#0f766e",
                    filter: dark ? "drop-shadow(0 0 7px rgba(70,194,166,0.85))" : "none",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
                </div>
              </Html>
            );
          })}
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
