"use client";

import { Component, type ReactNode } from "react";

/**
 * Guards the WebGL hero. If Three.js / the GPU context fails for any reason
 * (no WebGL, a driver issue, a failed asset), we render the fallback instead of
 * letting the error blank the whole landing page.
 */
export class ThreeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Swallow — the fallback is a graceful, on-brand gradient.
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
