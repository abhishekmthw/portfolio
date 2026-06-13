"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PointMaterial, Points } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";

/**
 * HeroScene — a tasteful, GPU-light R3F background for the hero: a tilted
 * wireframe terrain that undulates like a wave, over an ambient point cloud.
 *
 * Targets @react-three/fiber v8 + @react-three/drei v9 (React 18). Pointer
 * parallax is read from a window `pointermove` listener (NOT R3F pointer events)
 * because the Canvas wrapper in the hero is pointer-events-none.
 * reduced-motion => a single static frame (frameloop="demand", no animation).
 */

// Brand blue (217 91% 60%) and brand-2 cyan (190 95% 55%) as THREE colors.
const BRAND = new THREE.Color().setHSL(217 / 360, 0.91, 0.6);
const BRAND_2 = new THREE.Color().setHSL(190 / 360, 0.95, 0.55);

const POINT_COUNT = 3500;

/** ~POINT_COUNT points in a loose, soft sphere/cloud (ambient backdrop). */
function makeCloudPositions() {
  const positions = new Float32Array(POINT_COUNT * 3);
  for (let i = 0; i < POINT_COUNT; i++) {
    const r = 2.2 + Math.cbrt(Math.random()) * 2.6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function PointCloud() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(makeCloudPositions, []);
  useFrame((_, d) => {
    if (!ref.current) return;
    ref.current.rotation.y += d * 0.04;
    ref.current.rotation.x += d * 0.012;
  });
  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={BRAND}
        size={0.022}
        sizeAttenuation
        depthWrite={false}
        opacity={0.7}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
}

/** A tilted wireframe plane mesh undulating like terrain. */
function Terrain({ animate }: { animate: boolean }) {
  const geo = useMemo(() => new THREE.PlaneGeometry(7.5, 7.5, 48, 48), []);
  useFrame((state) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const y = pos.getY(k);
      pos.setZ(k, Math.sin(x * 0.9 + t) * 0.4 + Math.cos(y * 0.9 + t * 0.8) * 0.4);
    }
    pos.needsUpdate = true;
  });
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2.3, 0, 0]} position={[0, -0.7, 0]}>
      <meshBasicMaterial color={BRAND_2} wireframe transparent opacity={0.4} />
    </mesh>
  );
}

/**
 * Lerps the whole group toward the pointer for subtle parallax. Pointer is
 * normalized to -1..1 from a window listener (the Canvas wrapper is
 * pointer-events-none, so R3F pointer events would never fire here).
 */
function Scene({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!animate || typeof window === "undefined") return;
    const handle = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", handle, { passive: true });
    return () => window.removeEventListener("pointermove", handle);
  }, [animate]);

  useFrame(() => {
    if (!animate || !group.current) return;
    const targetY = pointer.current.x * 0.2;
    const targetX = pointer.current.y * 0.12;
    group.current.rotation.y += (targetY - group.current.rotation.y) * 0.04;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.04;
  });

  return (
    <group ref={group}>
      <PointCloud />
      <Terrain animate={animate} />
    </group>
  );
}

export default function HeroScene() {
  const reduced = useReducedMotion();
  const animate = !reduced;

  return (
    <Canvas
      className="absolute inset-0"
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, 0, 6], fov: 45 }}
      frameloop={animate ? "always" : "demand"}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.8} color={BRAND} />
      <pointLight position={[-5, -3, 2]} intensity={0.5} color={BRAND_2} />
      <Scene animate={animate} />
    </Canvas>
  );
}
