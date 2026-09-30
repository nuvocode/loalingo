// A character's animated bust (spec K): blinks while idle, glances up while thinking, moves its mouth with the voice.
// Animation writes CSS variables on the root element, so React never re-renders per frame.
import { useEffect, useRef } from "react";
import type { FaceSpec } from "../characters";
import { onMouth } from "../tts";
import { FaceArt } from "./parts";

export type FaceState = "idle" | "thinking" | "talking";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Face({ spec, color, size, label, state = "idle" }: { spec: FaceSpec; color: string; size?: number; label: string; state?: FaceState }) {
  const ref = useRef<HTMLSpanElement>(null);
  const set = (k: string, v: string) => ref.current?.style.setProperty(k, v);

  useEffect(() => { // own random timer, so faces in a list don't blink together
    if (reduced()) return;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        set("--blink", "1");
        t = window.setTimeout(() => { set("--blink", "0"); next(); }, 120);
      }, 2000 + Math.random() * 4000);
    };
    next();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "talking") return;
    const r = reduced();
    const off = onMouth((v) => set("--mouth", String(r ? (v > 0.25 ? 0.5 : 0) : v < 0.05 ? 0 : v)));
    return () => { off(); set("--mouth", "0"); };
  }, [state]);

  return (
    <span ref={ref} className={`face ${state}`} role="img" aria-label={label} style={{ width: size, height: size, "--c": color } as React.CSSProperties}>
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><FaceArt spec={spec} /></svg>
    </span>
  );
}
