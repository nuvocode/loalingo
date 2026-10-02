// A character's animated bust: blinks while idle, glances up while thinking, shapes its mouth to the voice.
// Animation writes CSS variables on the root element and the mouth paths directly, so React never re-renders per frame.
import { useEffect, useRef } from "react";
import type { CharacterId, FaceSpec } from "../characters";
import { onMouth } from "../tts";
import { FaceArt, mouthPaths } from "./parts";
import { Scene } from "./scenes";

export type FaceState = "idle" | "thinking" | "talking";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Face({ spec, color, size, label, state = "idle", scene }: { spec: FaceSpec; color: string; size?: number; label: string; state?: FaceState; scene?: CharacterId }) {
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

  useEffect(() => { // brows lift for emphasis: often while talking, now and then while idle
    if (reduced() || state === "thinking") return;
    let t = 0;
    const next = () => {
      t = window.setTimeout(() => {
        set("--raise", `-${3 + Math.random() * 2}px`);
        t = window.setTimeout(() => { set("--raise", "0px"); next(); }, 300 + Math.random() * 300);
      }, state === "talking" ? 900 + Math.random() * 2200 : 5000 + Math.random() * 7000);
    };
    next();
    return () => { clearTimeout(t); set("--raise", "0px"); };
  }, [state]);

  useEffect(() => {
    if (state !== "talking") return;
    const r = reduced();
    const g = ref.current!, q = (c: string) => g.querySelector(`.m-${c}`)!;
    const draw = (open: number, bright: number) => {
      const p = mouthPaths(spec.mouth, open, bright);
      q("lip").setAttribute("d", p.lip); q("cavity").setAttribute("d", p.cavity); q("teeth").setAttribute("d", p.teeth);
      const tg = q("tongue");
      tg.setAttribute("cy", String(p.tongue.cy)); tg.setAttribute("rx", String(p.tongue.rx)); tg.setAttribute("ry", String(p.tongue.ry));
    };
    const off = onMouth((v, b) => r ? draw(v > 0.25 ? 0.5 : 0, 0) : draw(v < 0.05 ? 0 : v, b));
    return () => { off(); draw(0, 0); };
  }, [state, spec.mouth]);

  return (
    <span ref={ref} className={`face ${state}`} role="img" aria-label={label} style={{ width: size, height: size, "--c": color } as React.CSSProperties}>
      {scene && <Scene who={scene} />}
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><FaceArt spec={spec} /></svg>
    </span>
  );
}
