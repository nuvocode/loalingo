// Phone companion (docs/MOBILE.md). Desktop: the server in src-tauri/src/companion.rs hands SQL to this webview,
// which runs it on its own connection. Phone: the same SqlDb shape over HTTP.
import type { SqlDb } from "./migrate";

// One device at a time (MOBILE.md, "tek cihaz kuralı"): opening the phone takes the data over, and the desktop
// waits behind a screen until "Continue here" reloads it, which in turn turns the phone away. No merging.
const TAKEN = "Sprigo is open on the other device";
let handoff: ((to: "phone" | "desktop") => void) | null = null, missed: "phone" | "desktop" | null = null;
/** The store shows the "continued on the other device" screen through this. */
export function onHandoff(f: (to: "phone" | "desktop") => void) { handoff = f; if (missed) f(missed); }
const handOff = (to: "phone" | "desktop") => (handoff ? handoff(to) : (missed = to));

/** Desktop: answers the server's SQL requests and starts the server if the setting is on. */
export async function serveCompanion(d: SqlDb) {
  const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
  type Q = { id: number; kind: "select" | "execute"; sql: string; args?: unknown[]; take?: boolean };
  let phone = false; // the phone holds the data; a reload ("Continue here") gives it back to this window
  await listen<Q>("companion-sql", async ({ payload: q }) => {
    if (q.take && !phone) { phone = true; handOff("phone"); }
    if (!phone) return invoke("companion_reply", { id: q.id, ok: false, value: TAKEN });
    try {
      const value = q.kind === "select" ? await d.select(q.sql, q.args ?? []) : await d.execute(q.sql, q.args ?? []);
      await invoke("companion_reply", { id: q.id, ok: true, value });
    } catch (e) {
      await invoke("companion_reply", { id: q.id, ok: false, value: String((e as Error)?.message ?? e) });
    }
  });
  const [on] = await d.select<{ value: string }>("SELECT value FROM device_settings WHERE key = 'companion'");
  if (on?.value === "on") await setCompanion(true).catch((e) => console.error("companion", e));
}

/** Settings → "Use on phone". Returns the local address `tailscale serve` should point at. */
export async function setCompanion(on: boolean) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("companion_set", { on });
}

/** Phone: the desktop's database through /sql. Opening it takes the data over from the desktop. */
export function remoteDb(): SqlDb {
  const post = async (kind: "select" | "execute", sql: string, args: unknown[] = [], take = false) => {
    const r = await fetch("/sql", { method: "POST", headers: { "Content-Type": "application/json", "X-Sprigo": "1" }, body: JSON.stringify({ kind, sql, args, take }) });
    if (r.ok) return r.json();
    const msg = await r.text();
    if (msg === TAKEN) handOff("desktop");
    throw new Error(msg);
  };
  // The takeover goes first and alone, so no other request can reach the desktop before it.
  const taken = post("select", "SELECT 1", [], true);
  const call = async (kind: "select" | "execute", sql: string, args?: unknown[]) => { await taken; return post(kind, sql, args); };
  return { select: (sql, args) => call("select", sql, args), execute: (sql, args) => call("execute", sql, args) };
}
