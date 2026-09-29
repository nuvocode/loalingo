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
