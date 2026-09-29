// System notifications via tauri-plugin-notification (desktop has no scheduling, so the app checks the time itself).
import { isTauri } from "./db";

/** True if notifications may be shown; asks the OS once. Always false in the browser preview. */
export async function notifyAllowed() {
  if (!isTauri) return false;
  const n = await import("@tauri-apps/plugin-notification");
  return (await n.isPermissionGranted()) || (await n.requestPermission()) === "granted";
}

export async function notify(title: string, body: string) {
  if (await notifyAllowed()) (await import("@tauri-apps/plugin-notification")).sendNotification({ title, body });
}

/** Reminder on → app stays alive when the window closes and starts hidden at login (src-tauri/src/lib.rs). */
export async function keepInBackground(on: boolean) {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_background", { on }).catch((e) => console.error("set_background", e));
}
