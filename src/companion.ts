// Phone companion (docs/MOBILE.md). Desktop: the server in src-tauri/src/companion.rs hands SQL to this webview,
// which runs it on its own connection. Phone: the same SqlDb shape over HTTP.
import type { SqlDb } from "./migrate";

/** Desktop: answers the server's SQL requests and starts the server if the setting is on. */
export async function serveCompanion(d: SqlDb) {
  const [{ invoke }, { listen }] = await Promise.all([import("@tauri-apps/api/core"), import("@tauri-apps/api/event")]);
  type Q = { id: number; kind: "select" | "execute"; sql: string; args?: unknown[] };
  await listen<Q>("companion-sql", async ({ payload: q }) => {
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

/** Phone: the desktop's database through /sql. */
export function remoteDb(): SqlDb {
  const call = async (kind: "select" | "execute", sql: string, args: unknown[] = []) => {
    const r = await fetch("/sql", { method: "POST", headers: { "Content-Type": "application/json", "X-Sprigo": "1" }, body: JSON.stringify({ kind, sql, args }) });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };
  return { select: (sql, args) => call("select", sql, args), execute: (sql, args) => call("execute", sql, args) };
}
