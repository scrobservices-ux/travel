"use client";

import dynamic from "next/dynamic";
import { ThreeErrorBoundary } from "./ThreeErrorBoundary";

// Three.js must run on the client only. While it loads (or if WebGL is
// unavailable), we show a warm brass gradient so the hero never looks empty.
const TextileScene = dynamic(() => import("./TextileScene"), {
  ssr: false,
  loading: () => <Fallback />,
});

function Fallback() {
  return <div className="h-full w-full bg-gradient-to-br from-brass-light/40 via-ivory to-sage-light/30" />;
}

export default function HeroVisual() {
  return (
    <div className="absolute inset-0 -z-10">
      <ThreeErrorBoundary fallback={<Fallback />}>
        <TextileScene />
      </ThreeErrorBoundary>
      {/* Vignette to keep text legible over the 3D. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ivory/40 via-transparent to-ivory" />
    </div>
  );
}
