/**
 * Flux Lab — candidate "flux" structures, each as a generator that fills a flat
 * Float32Array of LAB_POINT_COUNT × 3 positions for a given time `t`. Calling a
 * generator every frame produces a continuously morphing point cloud; the lab page
 * (components/flux-lab/flux-lab.tsx) lets you switch/loop between them to compare.
 *
 * Each model is `{ name, description, makeFill }`. makeFill() precomputes any fixed
 * per-particle data (so points keep their identity → smooth morphing) and returns the
 * per-frame `fill(out, t)`. Nothing here touches the production particle field; this
 * is a throwaway comparison tool. Pure math, no DOM — safe to import anywhere.
 */

export const LAB_POINT_COUNT = 9000;
const N = LAB_POINT_COUNT;
const TWO_PI = Math.PI * 2;

export type Fill = (out: Float32Array, t: number) => void;
export type LabModel = { name: string; description: string; makeFill: () => Fill };

// Optional real mesh for the Vitruvian Man: the scene (flux-lab-scene.tsx) loads
// public/models/vitruvian.glb, surface-samples it to LAB_POINT_COUNT points, and
// registers them here. While null (no file present / load failed) the model falls back
// to the procedural figure built in makeVitruvian().
let MESH_BASE: Float32Array | null = null;
export function setVitruvianMesh(points: Float32Array | null) {
  MESH_BASE = points;
}

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Recentre on the bounding-box midpoint and uniformly scale so the farthest point
 *  sits at `target` from the centre — keeps every model framed consistently as it
 *  morphs (and as you switch between them). Non-finite coords are zeroed. */
export function centerNormalize(out: Float32Array, target: number) {
  let mnx = Infinity, mny = Infinity, mnz = Infinity;
  let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < out.length; i += 3) {
    const x = out[i], y = out[i + 1], z = out[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < mnx) mnx = x; if (x > mxx) mxx = x;
    if (y < mny) mny = y; if (y > mxy) mxy = y;
    if (z < mnz) mnz = z; if (z > mxz) mxz = z;
  }
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, cz = (mnz + mxz) / 2;
  let maxd = 0;
  for (let i = 0; i < out.length; i += 3) {
    const dx = out[i] - cx, dy = out[i + 1] - cy, dz = out[i + 2] - cz;
    const d = dx * dx + dy * dy + dz * dz;
    if (Number.isFinite(d) && d > maxd) maxd = d;
  }
  const s = maxd > 0 ? target / Math.sqrt(maxd) : 1;
  for (let i = 0; i < out.length; i += 3) {
    const x = (out[i] - cx) * s, y = (out[i + 1] - cy) * s, z = (out[i + 2] - cz) * s;
    out[i] = Number.isFinite(x) ? x : 0;
    out[i + 1] = Number.isFinite(y) ? y : 0;
    out[i + 2] = Number.isFinite(z) ? z : 0;
  }
}

const TARGET = 2.2;
/** Bounding radius every model normalizes to — exported so the scene's GLB sampler
 *  scales the loaded Vitruvian mesh to match the other models. */
export const LAB_TARGET = TARGET;

// ---------------------------------------------------------------- wireframe helpers
// Shared by the polyhedral models: assign each particle once to a vertex (a bright
// cluster) or a point along an edge (a strut), plus a fixed jitter, so the wireframe
// reads as vertices + edges and the points flow smoothly while it warps.
type WireAssign = {
  isVert: Uint8Array;
  aIdx: Uint16Array; // vertex index, or edge endpoint i
  bIdx: Uint16Array; // edge endpoint j (edge points only)
  tPar: Float32Array; // parameter along the edge (edge points only)
  jit: Float32Array; // fixed offset in [-1,1]³, scaled per-model in the fill
};

function makeWireAssign(nVerts: number, nEdges: number, edges: Uint16Array, vertFrac: number): WireAssign {
  const isVert = new Uint8Array(N);
  const aIdx = new Uint16Array(N);
  const bIdx = new Uint16Array(N);
  const tPar = new Float32Array(N);
  const jit = new Float32Array(N * 3);
  for (let p = 0; p < N; p++) {
    jit[p * 3] = Math.random() * 2 - 1;
    jit[p * 3 + 1] = Math.random() * 2 - 1;
    jit[p * 3 + 2] = Math.random() * 2 - 1;
    if (Math.random() < vertFrac) {
      isVert[p] = 1;
      aIdx[p] = Math.floor(Math.random() * nVerts);
    } else {
      const e = Math.floor(Math.random() * nEdges);
      aIdx[p] = edges[e * 2];
      bIdx[p] = edges[e * 2 + 1];
      tPar[p] = Math.random();
    }
  }
  return { isVert, aIdx, bIdx, tPar, jit };
}

/** Place every particle on the (already-positioned) vertices `W` per its assignment. */
function placeWire(out: Float32Array, W: Float32Array, A: WireAssign, vj: number, ej: number) {
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

// ---------------------------------------------------------------- 1) dodecahedron
function buildDodeca() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const inv = 1 / phi;
  const raw: number[][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) raw.push([x, y, z]);
  for (const a of [-inv, inv])
    for (const b of [-phi, phi]) {
      raw.push([0, a, b]);
      raw.push([a, b, 0]);
      raw.push([b, 0, a]);
    }
  let maxr = 0;
  for (const v of raw) maxr = Math.max(maxr, Math.hypot(v[0], v[1], v[2]));
  const n = raw.length;
  const verts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    verts[i * 3] = raw[i][0] / maxr;
    verts[i * 3 + 1] = raw[i][1] / maxr;
    verts[i * 3 + 2] = raw[i][2] / maxr;
  }
  const d2 = (i: number, j: number) => {
    const dx = verts[i * 3] - verts[j * 3];
    const dy = verts[i * 3 + 1] - verts[j * 3 + 1];
    const dz = verts[i * 3 + 2] - verts[j * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  let minD = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minD = Math.min(minD, d2(i, j));
  const tol = minD * 1.08;
  const edges: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d2(i, j) <= tol) edges.push(i, j);
  return { verts, edges: Uint16Array.from(edges) };
}

function makeDodeca(): Fill {
  const { verts, edges } = buildDodeca();
  const nV = verts.length / 3;
  const A = makeWireAssign(nV, edges.length / 2, edges, 0.26);
  const W = new Float32Array(verts.length);
  const R = 1.9, WARP = 0.28, s = WARP / 1.6, vj = R * 0.05, ej = R * 0.016;
  return (out, t) => {
    for (let k = 0; k < nV; k++) {
      const vx = verts[k * 3], vy = verts[k * 3 + 1], vz = verts[k * 3 + 2];
      const dx = Math.sin(2.1 * vx + 0.9 * t) + 0.6 * Math.sin(1.3 * vy - 0.5 * t + 0.7);
      const dy = Math.sin(2.4 * vy + 0.7 * t + 1.3) + 0.6 * Math.sin(1.1 * vz + 0.4 * t);
      const dz = Math.sin(2.0 * vz - 0.8 * t + 2.1) + 0.6 * Math.sin(1.5 * vx + 0.6 * t);
      W[k * 3] = (vx + dx * s) * R;
      W[k * 3 + 1] = (vy + dy * s) * R;
      W[k * 3 + 2] = (vz + dz * s) * R;
    }
    placeWire(out, W, A, vj, ej);
  };
}

// ---------------------------------------------------------------- 2) tesseract (4D)
function buildTesseract() {
  const v: number[][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) for (const d of [-1, 1]) v.push([a, b, c, d]);
  const verts4 = new Float32Array(16 * 4);
  for (let i = 0; i < 16; i++) for (let k = 0; k < 4; k++) verts4[i * 4 + k] = v[i][k];
  const edges: number[] = [];
  for (let i = 0; i < 16; i++)
    for (let j = i + 1; j < 16; j++) {
      let diff = 0;
      for (let k = 0; k < 4; k++) if (v[i][k] !== v[j][k]) diff++;
      if (diff === 1) edges.push(i, j); // neighbours differ in exactly one coordinate
    }
  return { verts4, edges: Uint16Array.from(edges) };
}

function makeTesseract(): Fill {
  const { verts4, edges } = buildTesseract();
  const A = makeWireAssign(16, edges.length / 2, edges, 0.28);
  const W = new Float32Array(16 * 3);
  return (out, t) => {
    // rotate in two independent 4D planes (XW, YZ), then project 4D→3D in perspective
    const a = t * 0.45, b = t * 0.31;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const dist = 2.4;
    for (let i = 0; i < 16; i++) {
      let x = verts4[i * 4], y = verts4[i * 4 + 1], z = verts4[i * 4 + 2], w = verts4[i * 4 + 3];
      const x1 = x * ca - w * sa, w1 = x * sa + w * ca; // XW plane
      const y1 = y * cb - z * sb, z1 = y * sb + z * cb; // YZ plane
      x = x1; w = w1; y = y1; z = z1;
      const f = 1 / (dist - w); // 4D perspective: farther-in-w shrinks
      W[i * 3] = x * f;
      W[i * 3 + 1] = y * f;
      W[i * 3 + 2] = z * f;
    }
    placeWire(out, W, A, 0.05, 0.016);
    centerNormalize(out, 2.1); // steady framing as the 4D rotation changes the extent
  };
}

// ---------------------------------------------------------------- 3) superformula
function supershape(angle: number, m: number, n1: number, n2: number, n3: number) {
  const aa = Math.abs(Math.cos((m * angle) / 4));
  const bb = Math.abs(Math.sin((m * angle) / 4));
  const r = Math.pow(Math.pow(aa, n2) + Math.pow(bb, n3), -1 / n1);
  if (!Number.isFinite(r)) return 0;
  return Math.min(r, 3);
}

function makeSuperformula(): Fill {
  const lat = new Float32Array(N), lon = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    lat[p] = Math.asin(Math.random() * 2 - 1); // equal-area latitude
    lon[p] = Math.random() * TWO_PI - Math.PI;
  }
  const osc = (base: number, amp: number, sp: number, ph: number, tm: number) =>
    base + amp * (0.5 + 0.5 * Math.sin(sp * tm + ph));
  return (out, t) => {
    const m1 = osc(4, 3, 0.08, 0, t), m2 = osc(4, 3, 0.06, 1, t);
    const n11 = osc(0.4, 0.6, 0.05, 0, t), n12 = osc(0.3, 1.2, 0.07, 2, t), n13 = osc(0.3, 1.2, 0.045, 0, t);
    const n21 = osc(0.4, 0.6, 0.05, 0.5, t), n22 = osc(0.3, 1.2, 0.06, 1, t), n23 = osc(0.3, 1.2, 0.05, 3, t);
    for (let p = 0; p < N; p++) {
      const la = lat[p], lo = lon[p];
      const r1 = supershape(lo, m1, n11, n12, n13);
      const r2 = supershape(la, m2, n21, n22, n23);
      const cl = Math.cos(la);
      out[p * 3] = r1 * Math.cos(lo) * r2 * cl;
      out[p * 3 + 1] = r2 * Math.sin(la);
      out[p * 3 + 2] = r1 * Math.sin(lo) * r2 * cl;
    }
    centerNormalize(out, TARGET);
  };
}

// ---------------------------------------------------------------- 4) torus knot
function makeTorusKnot(): Fill {
  const u = new Float32Array(N), ta = new Float32Array(N), tr = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    u[p] = Math.random() * TWO_PI;
    ta[p] = Math.random() * TWO_PI;
    tr[p] = Math.sqrt(Math.random()); // even fill across the tube cross-section
  }
  const tube = 0.42;
  const a: number[] = [0, 0, 0], b: number[] = [0, 0, 0];
  const curve = (uu: number, P: number, Q: number, o: number[]) => {
    const cr = 2 + Math.cos(Q * uu);
    o[0] = cr * Math.cos(P * uu);
    o[1] = cr * Math.sin(P * uu);
    o[2] = Math.sin(Q * uu);
  };
  return (out, t) => {
    // drift the winding numbers so the knot continuously ties and unties itself
    const P = 2 + 1.5 * (0.5 + 0.5 * Math.sin(0.06 * t));
    const Q = 3 + 1.5 * (0.5 + 0.5 * Math.cos(0.045 * t + 1));
    for (let p = 0; p < N; p++) {
      const uu = u[p];
      curve(uu, P, Q, a);
      curve(uu + 0.01, P, Q, b);
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; // tangent
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      let nx = -tz, ny = 0, nz = tx; // tangent × up(0,1,0)
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-4) { nx = 1; ny = 0; nz = 0; nl = 1; }
      nx /= nl; ny /= nl; nz /= nl;
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx; // binormal
      const off = tube * tr[p];
      const cc = Math.cos(ta[p]) * off, ss = Math.sin(ta[p]) * off;
      out[p * 3] = a[0] + nx * cc + bx * ss;
      out[p * 3 + 1] = a[1] + ny * cc + by * ss;
      out[p * 3 + 2] = a[2] + nz * cc + bz * ss;
    }
    centerNormalize(out, TARGET);
  };
}

// ---------------------------------------------------------------- 5) spherical harmonics
function makeHarmonics(): Fill {
  const th = new Float32Array(N), ph = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    th[p] = Math.acos(Math.random() * 2 - 1);
    ph[p] = Math.random() * TWO_PI;
  }
  return (out, t) => {
    for (let p = 0; p < N; p++) {
      const a = th[p], b = ph[p];
      let r =
        1 +
        0.55 *
          (Math.sin(2 * a + 0.6 * t) * Math.cos(3 * b) +
            Math.sin(3 * a - 0.4 * t) * Math.sin(2 * b + 0.5 * t) +
            0.6 * Math.cos(4 * b - 0.7 * t));
      if (r < 0.15) r = 0.15;
      const sa = Math.sin(a);
      out[p * 3] = r * sa * Math.cos(b);
      out[p * 3 + 1] = r * Math.cos(a);
      out[p * 3 + 2] = r * sa * Math.sin(b);
    }
    centerNormalize(out, TARGET);
  };
}

// ---------------------------------------------------------------- 6) klein bottle
function makeKlein(): Fill {
  const uu = new Float32Array(N), vv = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    uu[p] = Math.random() * TWO_PI;
    vv[p] = Math.random() * TWO_PI;
  }
  return (out, t) => {
    const R = 2.0;
    const g = 0.5 + 0.5 * Math.sin(0.1 * t); // morph between a twisted torus (0) and full Klein (1)
    for (let p = 0; p < N; p++) {
      const u = uu[p], v = vv[p];
      const cu = Math.cos(u / 2), su = Math.sin(u / 2);
      const sv = Math.sin(v), s2v = Math.sin(2 * v);
      const rr = R + cu * sv - g * su * s2v;
      out[p * 3] = rr * Math.cos(u);
      out[p * 3 + 1] = rr * Math.sin(u);
      out[p * 3 + 2] = su * sv + g * cu * s2v;
    }
    centerNormalize(out, TARGET);
  };
}

// ---------------------------------------------------------------- 7) aizawa attractor
function makeAttractor(): Fill {
  return (out, t) => {
    const a = 0.95, b = 0.7, c = 0.6, e = 0.25, f = 0.1;
    const d = 3.5 + 0.7 * Math.sin(0.05 * t); // slow drift → the orbit reshapes
    let x = 0.1, y = 0, z = 0;
    const dt = 0.01;
    for (let i = 0; i < N; i++) {
      const dx = (z - b) * x - d * y;
      const dy = d * x + (z - b) * y;
      const dz = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * (x * x * x);
      x += dx * dt; y += dy * dt; z += dz * dt;
      out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
    }
    centerNormalize(out, TARGET);
  };
}

// ---------------------------------------------------------------- 8) gyroid
function makeGyroid(): Fill {
  const seed = new Float32Array(N * 3);
  for (let i = 0; i < N * 3; i++) seed[i] = (Math.random() * 2 - 1) * Math.PI;
  return (out, t) => {
    const s = 0.4 * t; // phase shift flows the lattice
    for (let p = 0; p < N; p++) {
      let x = seed[p * 3], y = seed[p * 3 + 1], z = seed[p * 3 + 2];
      // Newton-project the fixed seed onto the gyroid's zero level set
      for (let it = 0; it < 5; it++) {
        const F = Math.sin(x + s) * Math.cos(y) + Math.sin(y + s) * Math.cos(z) + Math.sin(z + s) * Math.cos(x);
        const Fx = Math.cos(x + s) * Math.cos(y) - Math.sin(z + s) * Math.sin(x);
        const Fy = -Math.sin(x + s) * Math.sin(y) + Math.cos(y + s) * Math.cos(z);
        const Fz = -Math.sin(y + s) * Math.sin(z) + Math.cos(z + s) * Math.cos(x);
        const g2 = Fx * Fx + Fy * Fy + Fz * Fz || 1;
        const k = F / g2;
        x -= k * Fx; y -= k * Fy; z -= k * Fz;
      }
      out[p * 3] = x; out[p * 3 + 1] = y; out[p * 3 + 2] = z;
    }
    centerNormalize(out, 2.3);
  };
}

// ---------------------------------------------------------------- 9) vitruvian man
// Leonardo's figure as particles: a humanoid (head, torso, spine, two arms, two legs)
// inscribed in a CIRCLE and a SQUARE. The two canonical poses are animated — arms sweep
// between horizontal and raised while legs sweep between together and apart — so the
// figure continuously cycles through da Vinci's superimposed double exposure. Built in
// the XY plane with round-tube limbs (real z-thickness) so it reads as a 3-D relief.
function makeVitruvian(): Fill {
  const CIRCLE = 0, SQUARE = 1, HEAD = 2, TORSO = 3, SPINE = 4, SHOULDERS = 5, HIPS = 6, ARM = 7, LEG = 8;
  const weights: [number, number][] = [
    [CIRCLE, 0.16], [SQUARE, 0.15], [HEAD, 0.07], [TORSO, 0.17], [SPINE, 0.05],
    [SHOULDERS, 0.03], [HIPS, 0.03], [ARM, 0.16], [LEG, 0.18],
  ];
  const part = new Uint8Array(N);
  const iparam = new Int8Array(N); // square edge 0–3, or arm/leg side ±1
  const q1 = new Float32Array(N), q2 = new Float32Array(N), q3 = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    let r = Math.random(), pc = CIRCLE;
    for (const [code, w] of weights) { if (r < w) { pc = code; break; } r -= w; }
    part[p] = pc;
    q1[p] = Math.random();
    q2[p] = Math.random() * TWO_PI;
    q3[p] = Math.random();
    if (pc === SQUARE) iparam[p] = Math.floor(Math.random() * 4);
    else if (pc === ARM || pc === LEG) iparam[p] = Math.random() < 0.5 ? -1 : 1;
  }

  // proportions (navel at origin, y up): square side = height, circle radius = navel→limb
  const S = 1.7, RC = 1.7;
  const shX = 0.42, shY = 0.95, hipX = 0.2, hipY = -0.1, armLen = 1.3, legLen = 1.65;
  const headCY = 1.38, headR = 0.3;
  const torsoCY = 0.42, trx = 0.34, tryy = 0.55, trz = 0.22;
  const SCALE = 0.9; // fits the square's corners within ~TARGET; no per-frame rescale
  // square edges as [ax, ay, bx, by] (z = 0)
  const SQ: [number, number, number, number][] = [
    [-S, -S, S, -S], [S, -S, S, S], [S, S, -S, S], [-S, S, -S, -S],
  ];

  const o3 = [0, 0, 0];
  const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
  // a round 3-D tube point between (ax,ay,az)→(bx,by,bz): one perpendicular stays in
  // the XY plane, the other carries z, so limbs read as cylinders when rotated.
  const tube = (
    ax: number, ay: number, az: number, bx: number, by: number, bz: number,
    tr: number, t: number, a: number, rr: number
  ) => {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    let e1x = dy, e1y = -dx, e1z = 0;
    let e1l = Math.hypot(e1x, e1y, e1z);
    if (e1l < 1e-4) { e1x = 1; e1y = 0; e1z = 0; e1l = 1; }
    e1x /= e1l; e1y /= e1l; e1z /= e1l;
    const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x;
    const ro = tr * Math.sqrt(rr), ca = Math.cos(a) * ro, sa = Math.sin(a) * ro;
    o3[0] = ax + (bx - ax) * t + e1x * ca + e2x * sa;
    o3[1] = ay + (by - ay) * t + e1y * ca + e2y * sa;
    o3[2] = az + (bz - az) * t + e1z * ca + e2z * sa;
  };

  const procedural: Fill = (out, t) => {
    const phi = 0.5 + 0.5 * Math.sin(0.45 * t); // 0 = square pose, 1 = circle pose
    const armA = lerp(0.0, 0.85, phi); // arm elevation: horizontal → raised
    const legA = lerp(0.06, 0.6, phi); // leg spread from vertical
    const handX = shX + armLen * Math.cos(armA), handY = shY + armLen * Math.sin(armA);
    const footX = hipX + legLen * Math.sin(legA), footY = hipY - legLen * Math.cos(legA);
    for (let p = 0; p < N; p++) {
      const pc = part[p];
      let x = 0, y = 0, z = 0;
      if (pc === CIRCLE) {
        const ang = q1[p] * TWO_PI, tr = 0.05 * Math.sqrt(q3[p]);
        const rx = Math.cos(ang), ry = Math.sin(ang), c = Math.cos(q2[p]) * tr;
        x = RC * rx + rx * c; y = RC * ry + ry * c; z = Math.sin(q2[p]) * tr;
      } else if (pc === SQUARE) {
        const e = SQ[iparam[p]];
        tube(e[0], e[1], 0, e[2], e[3], 0, 0.05, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      } else if (pc === HEAD) {
        const ct = 2 * q1[p] - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), rad = headR * (0.85 + 0.15 * q3[p]);
        x = st * Math.cos(q2[p]) * rad; y = headCY + ct * rad; z = st * Math.sin(q2[p]) * rad;
      } else if (pc === TORSO) {
        const ct = 2 * q1[p] - 1, st = Math.sqrt(Math.max(0, 1 - ct * ct)), f = 0.8 + 0.2 * q3[p];
        x = st * Math.cos(q2[p]) * trx * f; y = torsoCY + ct * tryy * f; z = st * Math.sin(q2[p]) * trz * f;
      } else if (pc === SPINE) {
        tube(0, shY, 0, 0, hipY, 0, 0.1, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      } else if (pc === SHOULDERS) {
        tube(-shX, shY, 0, shX, shY, 0, 0.07, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      } else if (pc === HIPS) {
        tube(-hipX, hipY, 0, hipX, hipY, 0, 0.08, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      } else if (pc === ARM) {
        const s = iparam[p];
        tube(s * shX, shY, 0, s * handX, handY, 0, 0.07, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      } else {
        const s = iparam[p];
        tube(s * hipX, hipY, 0, s * footX, footY, 0, 0.09, q1[p], q2[p], q3[p]);
        x = o3[0]; y = o3[1]; z = o3[2];
      }
      out[p * 3] = x * SCALE;
      out[p * 3 + 1] = y * SCALE;
      out[p * 3 + 2] = z * SCALE;
    }
  };

  // Prefer the real sampled mesh (public/models/vitruvian.glb) once the scene loads it;
  // otherwise use the procedural figure above. The mesh gets a gentle, continuous warp
  // so it still reads as a "morphing" structure in the lab.
  return (out, t) => {
    const base = MESH_BASE;
    if (base && base.length === N * 3) {
      const w = 0.08; // gentle continuous warp so the figure still reads as "alive"
      const FIG = 0.68; // shrink so the morphing constellation has room around it
      for (let p = 0; p < N; p++) {
        const ix = p * 3;
        const bx = base[ix], by = base[ix + 1], bz = base[ix + 2];
        out[ix] = (bx + Math.sin(1.6 * by + 0.7 * t) * w) * FIG;
        out[ix + 1] = (by + Math.sin(1.4 * bz + 0.6 * t + 1.0) * w) * FIG;
        out[ix + 2] = (bz + Math.sin(1.5 * bx - 0.5 * t + 2.0) * w) * FIG;
      }
      return;
    }
    procedural(out, t);
  };
}

// ---------------------------------------------------------------- registry
export const LAB_MODELS: LabModel[] = [
  { name: "Dodecahedron", description: "Wireframe solid — 20 vertices, 30 edges — whose corners drift so edges flex and the whole polyhedron warps.", makeFill: makeDodeca },
  { name: "Tesseract", description: "4D hypercube rotating in two 4D planes and projected to 3D — the iconic inside-out cube-through-cube turn.", makeFill: makeTesseract },
  { name: "Superformula", description: "One formula, endless forms: parameters drift so it flows through crystalline, floral and spiky shapes.", makeFill: makeSuperformula },
  { name: "Torus Knot", description: "A glowing tube whose winding numbers drift, so the knot continuously ties and unties itself in space.", makeFill: makeTorusKnot },
  { name: "Spherical Harmonics", description: "An organic lobed surface whose harmonics breathe and recombine — soft, slow, ever-shifting bulges.", makeFill: makeHarmonics },
  { name: "Klein Bottle", description: "A figure-8 immersion that morphs between a twisted torus and the full self-passing Klein bottle.", makeFill: makeKlein },
  { name: "Aizawa Attractor", description: "Particles riding a chaotic orbit — a living, breathing swirl that endlessly reshapes within its silhouette.", makeFill: makeAttractor },
  { name: "Gyroid", description: "A triply-periodic minimal-surface lattice; its phase flows so the high-tech mesh perpetually streams.", makeFill: makeGyroid },
  { name: "Vitruvian Man", description: "Leonardo's figure in circle + square; arms/legs sweep between his two poses. Renders from a real mesh if /models/vitruvian.glb is present.", makeFill: makeVitruvian },
];
