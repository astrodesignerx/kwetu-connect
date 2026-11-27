"use client";
import * as React from "react";
import { startTransition, type ReactNode } from "react";

/**
 * Mail motion. Next bundles a React with <ViewTransition> and addTransitionType, but the React the
 * tests run on does not have them yet. Both fall back to no animation, so behaviour never depends on motion.
 */
type Classes = string | Record<string, string>;
type MotionProps = { children: ReactNode; name?: string; enter?: Classes; exit?: Classes; update?: Classes; share?: Classes; default?: Classes };
const runtime = React as unknown as {
  ViewTransition?: React.ComponentType<MotionProps>;
  addTransitionType?: (type: string) => void;
};

/** mail-view: changing view. mail-open: opening a conversation. mail-step: J and K. mail-loaded: a thread arriving. */
export type MotionType = "mail-view" | "mail-open" | "mail-step" | "mail-loaded";

export function Motion(props: MotionProps) {
  const Native = runtime.ViewTransition;
  return Native ? <Native {...props} /> : <>{props.children}</>;
}

/** Runs a state change as a transition tagged with a motion type, so only the matching animation plays. */
export function withMotion(type: MotionType, update: () => void) {
  startTransition(() => {
    runtime.addTransitionType?.(type);
    update();
  });
}

/** True when the browser can animate between views and the person has not asked for less motion. */
export function canAnimate() {
  return typeof document !== "undefined" && "startViewTransition" in document && !matchMedia("(prefers-reduced-motion: reduce)").matches;
}
