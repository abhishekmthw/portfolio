"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshSurfaceSampler } from "three/examples/jsm/math/MeshSurfaceSampler.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import {
  LAB_MODELS,
  LAB_POINT_COUNT,
  LAB_TARGET,
  centerNormalize,
  clamp01,
  easeInOut,
  setVitruvianMesh,
  type Fill,
} from "./models";

const N = LAB_POINT_COUNT;
const SWITCH_DUR = 1.2; // seconds to morph from one model into the next

/** HSL→RGB (all in [0,1]). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, tt: number) => {
    let t = tt;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/** Violet brand palette with a rare teal glint — matches the production field's feel. */
function buildColors(n: number): Float32Array {
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let h: number, s: number, l: number;
    if (Math.random() < 0.11) {
      h = 168 / 360; s = 0.6; l = 0.55; // teal glint
    } else {
      h = (250 + Math.random() * 30) / 360; // violet → orchid
      s = 0.75 + Math.random() * 0.2;
      l = 0.55 + Math.random() * 0.25;
    }
    const [r, g, b] = hslToRgb(h, s, l);
    c[i * 3] = r; c[i * 3 + 1] = g; c[i * 3 + 2] = b;
  }
  return c;
}

/** Soft round additive sprite so each particle reads as a glowing dot, not a square. */
function makeSprite(): THREE.Texture {
  const sz = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = sz;
  const ctx = cv.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function Cloud({ modelIndex }: { modelIndex: number }) {
  const pointsRef = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(N * 3), []);
  const target = useMemo(() => new Float32Array(N * 3), []);
  const from = useMemo(() => new Float32Array(N * 3), []);
  const colors = useMemo(() => buildColors(N), []);
  const sprite = useMemo(() => makeSprite(), []);

  const fillRef = useRef<Fill>(LAB_MODELS[modelIndex].makeFill());
  const transStart = useRef<number | null>(null);
  const pending = useRef(false);
  const first = useRef(true);

  // On model switch: snapshot the current cloud, build the new generator, and queue
  // a timed morph from the snapshot into the new (live, still-animating) target.
  useEffect(() => {
    if (first.current) return; // initial generator is already set
    from.set(positions);
    fillRef.current = LAB_MODELS[modelIndex].makeFill();
    pending.current = true;
  }, [modelIndex, from, positions]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    fillRef.current(target, time); // the active model, morphing continuously

    if (first.current) {
      positions.set(target);
      first.current = false;
    } else if (pending.current) {
      transStart.current = time;
      pending.current = false;
    }

    if (transStart.current !== null) {
      const e = easeInOut(clamp01((time - transStart.current) / SWITCH_DUR));
      for (let i = 0; i < positions.length; i++) positions[i] = from[i] + (target[i] - from[i]) * e;
      if (e >= 1) transStart.current = null;
    } else {
      positions.set(target);
    }

    const geo = pointsRef.current?.geometry;
    if (geo) (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        map={sprite}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

/** Surface-sample a loaded glTF scene into `n` points (positions only), centred and
 *  scaled so the farthest point sits at `target` — mirrors the production brain/DNA
 *  sampling so the Vitruvian Man uses a real mesh, not the procedural figure. */
function sampleGLB(root: THREE.Object3D, n: number, target: number): Float32Array {
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
  // The GLB already faces front via its baked node transform — no rotation (rotating a
  // flat relief tips it edge-on). centerNormalize re-centres + scales it.
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(merged)).build();
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    sampler.sample(v);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  centerNormalize(out, target);
  return out;
}

/**
 * A morphing "constellation" that surrounds the Vitruvian Man: bright anchor stars
 * drifting on a shell around the figure, faint background stars, and connecting lines
 * that appear/dissolve as anchors cross a distance threshold — so the asterisms keep
 * re-forming into new shapes. Self-contained; only mounted while the Vitruvian is shown.
 */
function Constellation() {
  const C = 46; // bright anchor stars
  const B = 420; // faint background stars
  const SHELL_MIN = 1.85, SHELL_MAX = 2.75, LINK_DIST = 1.15;
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
    []
  );
  const anchorPos = useMemo(() => new Float32Array(C * 3), []);
  const bgPos = useMemo(() => {
    const a = new Float32Array(B * 3);
    for (let i = 0; i < B; i++) {
      a[i * 3] = (Math.random() * 2 - 1) * 3.1;
      a[i * 3 + 1] = (Math.random() * 2 - 1) * 2.7;
      a[i * 3 + 2] = (Math.random() * 2 - 1) * 2.2;
    }
    return a;
  }, []);
  const linePos = useMemo(() => new Float32Array(maxPairs * 2 * 3), [maxPairs]);
  const sprite = useMemo(() => makeSprite(), []);
  const anchorsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < C; i++) {
      const A = anchors[i];
      const th = A.th + A.sth * t;
      const ph = A.ph + A.sph * t;
      const r = A.r + Math.sin(t * 0.3 + i) * 0.12; // gentle radial breathing
      const sp = Math.sin(ph);
      anchorPos[i * 3] = r * sp * Math.cos(th);
      anchorPos[i * 3 + 1] = r * Math.cos(ph);
      anchorPos[i * 3 + 2] = r * sp * Math.sin(th);
    }
    let k = 0;
    const d2 = LINK_DIST * LINK_DIST;
    for (let i = 0; i < C; i++) {
      for (let j = i + 1; j < C; j++) {
        const ax = anchorPos[i * 3], ay = anchorPos[i * 3 + 1], az = anchorPos[i * 3 + 2];
        const bx = anchorPos[j * 3], by = anchorPos[j * 3 + 1], bz = anchorPos[j * 3 + 2];
        const dx = ax - bx, dy = ay - by, dz = az - bz;
        const base = k * 6;
        const within = dx * dx + dy * dy + dz * dz < d2;
        // out-of-range pairs collapse to a zero-length (invisible) segment
        linePos[base] = ax; linePos[base + 1] = ay; linePos[base + 2] = az;
        linePos[base + 3] = within ? bx : ax;
        linePos[base + 4] = within ? by : ay;
        linePos[base + 5] = within ? bz : az;
        k++;
      }
    }
    if (anchorsRef.current)
      (anchorsRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    if (linesRef.current)
      (linesRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <group>
      <points ref={anchorsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[anchorPos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.13} map={sprite} color="#c4b6ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[bgPos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.05} map={sprite} color="#8a7fd0" transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
      </points>
      <lineSegments ref={linesRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[linePos, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#7b6cff" transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
    </group>
  );
}

export function FluxLabScene({ modelIndex }: { modelIndex: number }) {
  const isVitruvian = LAB_MODELS[modelIndex]?.name === "Vitruvian Man";
  // Try to load a real Vitruvian mesh; on success the model renders from it, on a
  // missing/failed file it silently keeps the procedural figure.
  useEffect(() => {
    let cancelled = false;
    new GLTFLoader().load(
      "/models/vitruvian.glb",
      (gltf) => {
        if (cancelled) return;
        try {
          setVitruvianMesh(sampleGLB(gltf.scene, LAB_POINT_COUNT, LAB_TARGET));
        } catch {
          setVitruvianMesh(null);
        }
      },
      undefined,
      () => {
        /* no file yet / load error → procedural fallback stays */
      }
    );
    return () => {
      cancelled = true;
      setVitruvianMesh(null);
    };
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 7], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#04050a"]} />
      <Cloud modelIndex={modelIndex} />
      {/* morphing constellation surrounds the Vitruvian; only while it's shown */}
      {isVitruvian && <Constellation />}
      {/* the Vitruvian stays flat & facing the camera (no auto-spin); other models rotate */}
      <OrbitControls enablePan={false} autoRotate={!isVitruvian} autoRotateSpeed={0.5} minDistance={3.5} maxDistance={14} />
    </Canvas>
  );
}
