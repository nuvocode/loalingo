// ponytail: sample data from docs/design/index.html. Titles are i18n keys (mock.*) so the preview follows the UI language;
// exercise content stays as-is (TR speaker learning EN) because it is course content, not UI copy.
import type { IconName } from "./icons";

export const LEAGUE = [
  { n: "Aylin", xp: 482, c: "#e91e63" }, { n: "Mert", xp: 431, c: "#1cb0f6" }, { n: "Zeynep", xp: 395, c: "#58cc02" },
  { n: "", xp: 0, c: "#ffc800", me: true }, { n: "Kaan", xp: 297, c: "#ce82ff" }, { n: "Elif", xp: 260, c: "#ff9600" },
  { n: "Deniz", xp: 214, c: "#00b8a9" }, { n: "Baran", xp: 180, c: "#8d6e63" }, { n: "Selin", xp: 142, c: "#5c6bc0" }, { n: "Umut", xp: 98, c: "#ef5350" },
];

export const FRIENDS = [
  { n: "Zeynep", streak: 34, c: "#58cc02" }, { n: "Mert", streak: 21, c: "#1cb0f6" }, { n: "Elif", streak: 9, c: "#ff9600" },
];

export const NOTIFS: { icon: IconName; key: string }[] = [
  { icon: "flame", key: "n1" }, { icon: "trophy", key: "n2" }, { icon: "users", key: "n3" },
];
