// Each CEFR level lives in a biome (SPR-8): meadow → grove → forest → foothills → mountain → summit.
// Scenes are flat SVG in the same style as src/face/scenes.tsx, built as strings like src/icons.tsx.
import type { Cefr } from "./course.ts";

export type Biome = { id: string; head: string; headDark: string; tint: string; tintDark: string; sky: string; far: string; near: string };

export const BIOMES: Record<Cefr, Biome> = {
  A1: { id: "meadow", head: "#5b8f3a", headDark: "#44702a", tint: "#f1f6e6", tintDark: "#1d2418", sky: "#e9f3e1", far: "#bcd99a", near: "#8fc06a" },
  A2: { id: "grove", head: "#4f7f3a", headDark: "#3a632a", tint: "#ecf3e2", tintDark: "#1b2317", sky: "#e4efdc", far: "#a9cc8a", near: "#7cae5a" },
  B1: { id: "forest", head: "#2f5e35", headDark: "#214628", tint: "#e5efe0", tintDark: "#172118", sky: "#dce9d6", far: "#6f9d5a", near: "#4f7f3f" },
  B2: { id: "foothills", head: "#5f7f4f", headDark: "#48633b", tint: "#ecf0e6", tintDark: "#1c211a", sky: "#e3ebe6", far: "#b7c4c0", near: "#6f9858" },
  C1: { id: "mountain", head: "#5c6b78", headDark: "#46535e", tint: "#eceff1", tintDark: "#1b1f22", sky: "#dfe7ee", far: "#8c9aa6", near: "#a49a86" },
  C2: { id: "summit", head: "#4d6a85", headDark: "#3a5268", tint: "#eef3f7", tintDark: "#1a1f24", sky: "#e6eef5", far: "#7f8d9c", near: "#f1f4f7" },
};

/** CSS variables a biome-coloured subtree reads (unit heads, path tint, level card). */
export const biomeVars = (level: Cefr) => {
  const b = BIOMES[level];
  return { "--bh": b.head, "--bhd": b.headDark, "--bt": b.tint, "--btd": b.tintDark } as Record<string, string>;
};

const round = (x: number, y: number, r: number, c: string, d: string) =>
  `<circle cx="${x}" cy="${y + 4}" r="${r}" fill="${d}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><rect x="${x - 3}" y="${y + r - 4}" width="6" height="14" rx="2" fill="#8a6242"/>`;
const pine = (x: number, y: number, h: number, c: string) =>
  `<path d="M${x} ${y - h}L${x + h * 0.38} ${y}H${x - h * 0.38}Z" fill="${c}"/><rect x="${x - 2}" y="${y}" width="4" height="6" fill="#6b4a30"/>`;

/** 400×h landscape, ground line 40px above the bottom edge. */
export function biomeScene(level: Cefr, h = 160): string {
  const b = BIOMES[level], g = h - 40;
  let s = `<rect class="sky" width="400" height="${h}" fill="${b.sky}"/>`;
  switch (level) {
    case "A1":
      s += `<path d="M0 ${g}Q100 ${g - 40} 210 ${g - 10}T400 ${g - 20}V${h}H0Z" fill="${b.far}"/><path d="M0 ${g + 10}Q140 ${g - 14} 400 ${g + 6}V${h}H0Z" fill="${b.near}"/>`;
      for (const [x, c] of [[40, "#f2c14e"], [90, "#e98a7a"], [150, "#fff4d6"], [230, "#f2c14e"], [300, "#e98a7a"], [360, "#fff4d6"]] as const)
        s += `<circle cx="${x}" cy="${g + 20}" r="4" fill="${c}"/>`;
      break;
    case "A2":
      s += `<path d="M0 ${g}Q120 ${g - 36} 250 ${g - 6}T400 ${g - 14}V${h}H0Z" fill="${b.far}"/>` + round(70, g - 26, 22, "#5a9446", "#467a36") +
        round(300, g - 30, 26, "#5a9446", "#467a36") + `<path d="M0 ${g + 8}Q200 ${g - 10} 400 ${g + 8}V${h}H0Z" fill="${b.near}"/>` + round(190, g - 4, 16, "#6aa84f", "#4a8a3a");
      break;
    case "B1":
      s += `<path d="M0 ${g - 10}Q200 ${g - 50} 400 ${g - 10}V${h}H0Z" fill="${b.far}"/>`;
      for (let x = 10; x < 400; x += 34) s += pine(x, g - 6 + ((x * 7) % 12), 46 + ((x * 13) % 20), "#3d6b33");
      s += `<path d="M0 ${g + 8}Q200 ${g - 6} 400 ${g + 8}V${h}H0Z" fill="${b.near}"/>` + round(120, g - 2, 18, "#4f8a3c", "#3a6a2b") + pine(260, g + 6, 52, "#2f5628");
      break;
    case "B2":
      s += `<path d="M120 ${g}L230 ${g - 90}L340 ${g}Z" fill="${b.far}"/><path d="M0 ${g}Q120 ${g - 30} 260 ${g - 4}T400 ${g - 10}V${h}H0Z" fill="#93b07a"/>` +
        pine(60, g, 40, "#3d6b33") + pine(84, g + 4, 30, "#3d6b33") + pine(340, g, 44, "#3d6b33") + `<path d="M0 ${g + 12}Q200 ${g - 4} 400 ${g + 12}V${h}H0Z" fill="${b.near}"/>`;
      break;
    case "C1":
      s += `<path d="M-20 ${g}L110 ${g - 100}L210 ${g - 20}L290 ${g - 110}L420 ${g}Z" fill="${b.far}"/><path d="M110 ${g - 100}L150 ${g - 60}L120 ${g - 50}L90 ${g - 74}Z" fill="#6f7d8a"/>` +
        pine(40, g + 6, 30, "#3d6b33") + pine(360, g + 4, 34, "#3d6b33") + `<path d="M0 ${g + 10}Q200 ${g - 4} 400 ${g + 10}V${h}H0Z" fill="${b.near}"/>`;
      break;
    case "C2":
      s += `<path d="M-20 ${g}L90 ${g - 90}L180 ${g - 10}L270 ${g - 118}L420 ${g}Z" fill="${b.far}"/>` +
        `<path d="M90 ${g - 90}L120 ${g - 58}L104 ${g - 62}L92 ${g - 50}L78 ${g - 64}L66 ${g - 60}Z" fill="#fdfdfd"/><path d="M270 ${g - 118}L310 ${g - 74}L290 ${g - 80}L274 ${g - 66}L256 ${g - 82}L236 ${g - 78}Z" fill="#fdfdfd"/>` +
        `<path d="M0 ${g + 6}Q200 ${g - 14} 400 ${g + 6}V${h}H0Z" fill="${b.near}"/>` + pine(330, g + 2, 30, "#4a6f5a");
      break;
  }
  return `<svg class="biome-scene" viewBox="0 0 400 ${h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${s}</svg>`;
}
