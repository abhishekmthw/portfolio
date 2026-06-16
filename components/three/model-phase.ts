import * as React from "react";

/**
 * Tiny external store bridging the WebGL backdrop (which knows the morph state)
 * and the page content (which gates its reveal on it). The particle field flips
 * `transitioning` true while the 3D model is mid-transition — scattering/morphing/
 * spinning between sections, or still running its entry assembly — and false once
 * it has settled (docked) on a section. Content sections wait for it to settle.
 *
 * It defaults to settled (transitioning = false): if the field never mounts (e.g.
 * reduced motion, or a WebGL failure), content still reveals normally.
 */
let transitioning = false;
const listeners = new Set<() => void>();

export function setModelTransitioning(v: boolean) {
  if (v === transitioning) return;
  transitioning = v;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** True when the 3D model is docked/settled — i.e. safe to reveal content. */
export function useModelSettled(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => !transitioning,
    () => true // server snapshot: assume settled so SSR/no-JS never hides content
  );
}
