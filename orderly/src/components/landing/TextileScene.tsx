"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useMemo, useRef, Suspense } from "react";
import * as THREE from "three";

/**
 * A flowing "textile" — a finely subdivided plane whose vertices ripple like
 * fabric in a slow breeze, rendered with a brass, semi-metallic material and a
 * woven wireframe overlay. This is the centerpiece of the hero: premium,
 * tactile, and entirely procedural (no asset downloads).
 */
function Cloth() {
  const mesh = useRef<THREE.Mesh>(null!);
  const wire = useRef<THREE.Mesh>(null!);
  const geom = useMemo(() => new THREE.PlaneGeometry(7, 4.2, 80, 48), []);
  const base = useMemo(() => Float32Array.from(geom.attributes.position.array), [geom]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      // Layered sine waves -> soft, organic fabric motion.
      const z =
        Math.sin(x * 0.9 + t * 0.8) * 0.32 +
        Math.cos(y * 1.3 + t * 0.6) * 0.22 +
        Math.sin((x + y) * 0.6 + t * 0.4) * 0.18;
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    mesh.current.rotation.z = Math.sin(t * 0.1) * 0.04;
    wire.current.rotation.z = mesh.current.rotation.z;
  });

  return (
    <group rotation={[-0.55, -0.25, 0.15]}>
      <mesh ref={mesh} geometry={geom}>
        {/* No env map on purpose — fully self-contained, no external HDR fetch.
            Lighting alone carries the brass sheen so the page never depends on
            a CDN asset to render. */}
        <meshStandardMaterial
          color="#b08d57"
          roughness={0.3}
          metalness={0.45}
          emissive="#3a2c16"
          emissiveIntensity={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Woven wireframe overlay just above the surface for a textile grid. */}
      <mesh ref={wire} geometry={geom} position={[0, 0, 0.012]}>
        <meshBasicMaterial color="#f3e4c8" wireframe transparent opacity={0.14} />
      </mesh>
    </group>
  );
}

export default function TextileScene() {
  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [0, 0, 7], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={2.1} color="#fff1d6" />
        <directionalLight position={[-5, -2, 2]} intensity={0.7} color="#8a9a82" />
        <pointLight position={[0, 0, 4]} intensity={0.8} color="#f3e4c8" />
        <Float speed={1.1} rotationIntensity={0.18} floatIntensity={0.4}>
          <Cloth />
        </Float>
      </Suspense>
    </Canvas>
  );
}
