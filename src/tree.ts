// The streak tree (SPR-9): progress grows it, the streak colours it, checkpoints hang fruit on it.
// Drawn as an SVG string like src/icons.tsx and src/biomes.ts; shapes come from docs/design/nature.html.

export type TreeState = { stage: 0 | 1 | 2 | 3 | 4; dry: boolean; fruit: number };

/** Finished lessons needed for each stage: seed, sprout, sapling, young tree, mature tree (~5 lessons a unit). */
export const STAGE_LESSONS = [0, 1, 10, 40, 100] as const;

/** Growth never goes back; a broken streak only turns the leaves yellow until the next lesson. */
export function treeState(done: Iterable<string>, streak: number, lastActive: string | null): TreeState {
  let lessons = 0, fruit = 0;
  for (const id of done) {
    if (id.endsWith(":checkpoint")) fruit++;
    else if (!id.endsWith(":chest") && !id.startsWith("story:")) lessons++; // chests are optional, stories are extras
  }
  const stage = (STAGE_LESSONS.filter((n) => lessons >= n).length - 1) as TreeState["stage"];
  return { stage, dry: streak === 0 && lastActive !== null, fruit };
}

/** Per-stage crop so a small plant still fills a small icon; the full 200×220 canvas shows growth at large sizes. */
const FIT = ["64 166 72 50", "52 140 96 76", "36 96 128 120", "20 40 160 176", "0 18 200 198"];

export function treeSvg({ stage, dry, fruit }: TreeState, fit = false): string {
  const L = dry ? "var(--leaf-dry)" : "var(--leaf)", LD = dry ? "var(--leaf-dry-dark)" : "var(--leaf-dark)";
  const leaf = (x: number, y: number, rx: number, ry: number, a: number) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${L}" transform="rotate(${a} ${x} ${y})"/>`;
  const blob = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y + 6}" r="${r}" fill="${LD}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${L}"/>`;
  let s = `<ellipse cx="100" cy="204" rx="${40 + stage * 12}" ry="9" fill="var(--soil)"/>`, spots: number[][] = [];
  if (stage === 0) s += `<path d="M100 200V186" stroke="${LD}" stroke-width="3" stroke-linecap="round"/>` + leaf(94, 184, 6, 3, -30) + leaf(106, 182, 6, 3, 30);
  if (stage === 1) { s += `<path d="M100 200V160" stroke="${LD}" stroke-width="4" stroke-linecap="round"/>` + leaf(88, 172, 12, 5, -30) + leaf(112, 166, 12, 5, 30) + leaf(100, 154, 6, 12, 0); spots = [[112, 170]]; }
  if (stage === 2) {
    s += `<path d="M100 200V118" stroke="var(--bark)" stroke-width="6" stroke-linecap="round"/>` +
      leaf(84, 160, 14, 6, -30) + leaf(116, 150, 14, 6, 30) + leaf(86, 134, 13, 6, -35) + leaf(114, 126, 13, 6, 35) + leaf(100, 110, 8, 15, 0);
    spots = [[118, 154], [84, 138]];
  }
  if (stage === 3) { s += `<path d="M94 200 L97 110 H103 L106 200Z" fill="var(--bark)"/>` + blob(72, 112, 28) + blob(128, 112, 28) + blob(100, 88, 38); spots = [[80, 118], [122, 104], [100, 76], [132, 124]]; }
  if (stage === 4) {
    s += `<path d="M88 202 Q96 150 94 96 H106 Q104 150 112 202Z" fill="var(--bark)"/><path d="M100 150 L74 118 M100 140 L128 112" stroke="var(--bark)" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M88 202 q-14 2 -22 8 M112 202 q14 2 22 8" stroke="var(--bark-dark)" stroke-width="4" stroke-linecap="round" fill="none"/>` +
      blob(58, 104, 34) + blob(142, 104, 34) + blob(78, 66, 32) + blob(122, 66, 32) + blob(100, 82, 40);
    spots = [[60, 110], [140, 96], [86, 58], [118, 74], [100, 100], [150, 120]];
  }
  // ponytail: fruit is capped by the stage's branch spots (6 at most = one per CEFR checkpoint)
  s += spots.slice(0, fruit).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="var(--fruit)"/><path d="M${x} ${y - 6} v-4" stroke="var(--bark-dark)" stroke-width="2" stroke-linecap="round"/>`).join("");
  return `<svg class="tree" viewBox="${fit ? FIT[stage] : "0 0 200 220"}" aria-hidden="true">${s}</svg>`;
}
