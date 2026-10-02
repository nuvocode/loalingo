// Cartoon bust parts on a 200×200 canvas, stacked back to front by FaceArt.
// Animated layers read CSS variables set by Face.tsx: .lid (--blink), .pupil (--look-x/y), .brow (--brow, --raise); Face.tsx redraws .mouth from mouthPaths() every frame.
import type { FaceSpec } from "../characters";

export const SKIN = ["#f8d5c2", "#eab896", "#c98e68", "#9a6443", "#6b4230"];
export const HAIR = ["#1f1a17", "#4a2e1f", "#7a4a2a", "#e3b75a", "#b5452a", "#b8b8b8"];
const LINE = "#2b2320", IRIS = "#5b3b27", WHITE = "#f7f4ef", SHADE = "rgba(0,0,0,.14)", DEEP = "rgba(0,0,0,.2)", SHINE = "rgba(255,255,255,.28)";
const CAVITY = "#5a1d29", TONGUE = "#e0707c", BLUSH = "#ff6f6f", GOLD = "#f2c14e", STEEL = "#aab3bd";
const C = { fill: "var(--c)" }; // the character's color (clothes)
const EYE_Y = 88, EYES_X = [84, 116];

/** `w` = half the head width at the ears. Heads narrow toward the chin instead of being plain ellipses. */
const HEADS: Record<FaceSpec["head"], { w: number; d: string }> = {
  round: { w: 40, d: "M60 88 C60 62 78 46 100 46 C122 46 140 62 140 88 C140 114 122 132 100 132 C78 132 60 114 60 88 Z" },
  oval: { w: 36, d: "M64 86 C64 58 80 42 100 42 C120 42 136 58 136 86 C136 114 122 134 100 134 C78 134 64 114 64 86 Z" },
  square: { w: 38, d: "M62 76 C62 54 78 44 100 44 C122 44 138 54 138 76 L138 104 C138 124 122 134 100 134 C78 134 62 124 62 104 Z" },
};

const EARS: Record<FaceSpec["ears"], { rx: number; ry: number; out: number }> = { small: { rx: 6, ry: 9, out: -1 }, big: { rx: 9, ry: 12, out: 0 } };
function Ears({ kind, w, skin }: { kind: FaceSpec["ears"]; w: number; skin: string }) {
  const { rx, ry, out } = EARS[kind];
  return <>{[-1, 1].map((s) => {
    const x = 100 + s * (w + out);
    return <g key={s}>
      <ellipse cx={x} cy={92} rx={rx} ry={ry} fill={skin} />
      <path d={`M${x + s * rx * 0.1} ${92 - ry * 0.55} q${s * rx * 0.55} ${ry * 0.55} 0 ${ry * 1.1}`} fill="none" stroke={SHADE} strokeWidth={2} strokeLinecap="round" />
    </g>;
  })}</>;
}

function Eye({ cx, kind, skin }: { cx: number; kind: FaceSpec["eyes"]; skin: string }) {
  const outer = cx < 100 ? -1 : 1, iris = kind === "round" ? 4.5 : 3.8;
  return (
    <g className={`eye ${kind}`}>
      {kind === "almond"
        ? <path d={`M${cx - 8} ${EYE_Y} Q${cx} ${EYE_Y - 11} ${cx + 8} ${EYE_Y} Q${cx} ${EYE_Y + 8} ${cx - 8} ${EYE_Y} Z`} fill={WHITE} />
        : <circle cx={cx} cy={EYE_Y} r={kind === "round" ? 7 : 6.5} fill={WHITE} />}
      <g className="pupil">
        <circle cx={cx} cy={EYE_Y} r={iris} fill={IRIS} />
        <circle cx={cx} cy={EYE_Y} r={iris * 0.5} fill={LINE} />
        <circle cx={cx + 1.4} cy={EYE_Y - 1.6} r={1.3} fill="#fff" />
      </g>
      {kind === "almond"
        ? <path d={`M${cx - 8} ${EYE_Y} Q${cx} ${EYE_Y - 11} ${cx + 8} ${EYE_Y} l${outer * 1.5} -2.5`} fill="none" stroke={LINE} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        : <circle cx={cx} cy={EYE_Y} r={kind === "round" ? 7 : 6.5} fill="none" stroke={LINE} strokeWidth={1.6} />}
      {/* The lid scales down from its top; its line sits mid-eye when closed and is flat (invisible) when open. */}
      <g className="lid">
        <rect x={cx - 10} y={EYE_Y - 9} width={20} height={18} fill={skin} />
        <path d={`M${cx - 8} ${EYE_Y} Q${cx} ${EYE_Y + 3} ${cx + 8} ${EYE_Y}`} fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  );
}

/** Brows taper from the inner end (`i`, toward the nose) to the outer end (`o`). */
const BROWS: Record<FaceSpec["brows"], (cx: number, s: number) => React.ReactNode> = {
  flat: (cx, s) => <path d={`M${cx - s * 9} 73 Q${cx} 71 ${cx + s * 9} 74`} fill="none" strokeWidth={3.5} strokeLinecap="round" />,
  arched: (cx, s) => <path d={`M${cx - s * 9} 75 Q${cx - s * 2} 66 ${cx + s * 10} 73 Q${cx - s * 2} 70 ${cx - s * 9} 77.5 Z`} strokeWidth={1.5} strokeLinejoin="round" />,
  thick: (cx, s) => <path d={`M${cx - s * 10} 76 Q${cx - s * 8} 69 ${cx} 69 Q${cx + s * 8} 69 ${cx + s * 11} 73 Q${cx + s * 4} 73 ${cx - s * 10} 77 Z`} strokeWidth={1.5} strokeLinejoin="round" />,
};

const NOSES: Record<FaceSpec["nose"], React.ReactNode> = {
  button: <><ellipse cx={100} cy={101} rx={4.5} ry={3.5} fill={SHADE} /><path d="M95 104 Q100 108 105 104" fill="none" stroke={SHADE} strokeWidth={2.2} strokeLinecap="round" /></>,
  long: <path d="M101 86 Q98 97 95 103 Q97 107 100 106 Q103 107 105 104" fill="none" stroke={SHADE} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />,
  wide: <><path d="M91 103 Q93 109 100 108 Q107 109 109 103" fill="none" stroke={SHADE} strokeWidth={2.4} strokeLinecap="round" /><ellipse cx={95} cy={104} rx={2} ry={1.3} fill={DEEP} /><ellipse cx={105} cy={104} rx={2} ry={1.3} fill={DEEP} /></>,
};

/** Upper lip: corners (x0, y) and the curve's control point y (`cy`); `depth` = how far the lower lip drops when fully open. */
const MOUTHS: Record<FaceSpec["mouth"], { x0: number; y: number; cy: number; depth: number }> = {
  small: { x0: 93, y: 118, cy: 121, depth: 10 },
  wide: { x0: 88, y: 118, cy: 122, depth: 13 },
  smile: { x0: 88, y: 116, cy: 128, depth: 12 },
};

/** The mouth at openness `open` (0..1) and shape `bright` (0 round "o" .. 1 wide "ee"). The upper lip and the cavity's top
 *  edge are the same curve, so the open mouth never separates from the lip line; closed, the cavity collapses onto it. */
export function mouthPaths(kind: FaceSpec["mouth"], open: number, bright: number) {
  const m = MOUTHS[kind], round = open * (1 - bright);
  const half = (100 - m.x0) * (1 - 0.2 * round + 0.08 * open * bright), x0 = 100 - half, x1 = 100 + half;
  const cy = m.cy - 2.5 * round, mid = (m.y + cy) / 2; // the upper lip lifts a little on round vowels
  const d = m.depth * open * (1 - 0.5 * bright), yc = (mid + d - 0.25 * m.y) / 0.75; // cubic whose middle sits `d` below the lip's
  const lip = `M${x0} ${m.y} Q100 ${cy} ${x1} ${m.y}`;
  const t = Math.min(3, d * 0.5), inset = half * 0.2;
  return {
    lip,
    cavity: `${lip} C${x1 - half * 0.15} ${yc} ${x0 + half * 0.15} ${yc} ${x0} ${m.y} Z`,
    teeth: `M${x0 + inset} ${m.y + 0.8} Q100 ${cy + 0.8} ${x1 - inset} ${m.y + 0.8} L${x1 - inset} ${m.y + 0.8 + t} Q100 ${cy + t} ${x0 + inset} ${m.y + 0.8 + t} Z`,
    tongue: { cx: 100, cy: mid + d * 0.72, rx: half * 0.5, ry: d * 0.22 },
  };
}

/** Hair cap sized to the head (`w` as in HEADS), so its lower ends stay inside the head's outline. `line` = where the fringe meets the middle. */
const cap = (w: number, line = 58) =>
  `M${100 - w + 1} 84 Q${100 - w - 3} 40 100 37 Q${100 + w + 3} 40 ${100 + w - 1} 84 Q${100 + w - 8} 60 100 ${line} Q${100 - w + 8} 60 ${100 - w + 1} 84 Z`;
/** A cap whose fringe sweeps to one side instead of meeting in the middle. */
const swept = (w: number) => {
  const L = 100 - w + 1, R = 100 + w - 1;
  return `M${L} 84 Q${L - 4} 40 100 37 Q${R + 4} 40 ${R} 84 Q${R - 3} 66 ${R - 10} 60 Q112 64 94 56 Q84 62 ${L + 7} 68 Q${L + 2} 74 ${L} 84 Z`;
};
const shine = (w: number, y = 46) => <path d={`M${100 - w * 0.5} ${y + 4} Q${100 - w * 0.2} ${y - 2} ${100 + w * 0.15} ${y - 1}`} fill="none" stroke={SHINE} strokeWidth={3.5} strokeLinecap="round" />;

/** Hair behind the head (long hair, ponytail, curls) and in front of it (fringe, locks). */
const HAIRS: Record<FaceSpec["hair"], (w: number) => { back?: React.ReactNode; front?: React.ReactNode }> = {
  short: (w) => ({ front: <><path d={swept(w)} />{shine(w)}</> }),
  bun: (w) => ({
    back: <><circle cx={100} cy={30} r={15} /><path d="M92 20 Q100 16 108 21" fill="none" stroke={SHINE} strokeWidth={3} strokeLinecap="round" /></>,
    front: <><path d={cap(w, 54)} /><rect x={90} y={40} width={20} height={4} rx={2} fill={DEEP} /><path d="M100 44 V53" stroke={DEEP} strokeWidth={1.5} />{shine(w, 48)}</>,
  }),
  long: (w) => ({
    back: <path d="M56 80 Q54 32 100 32 Q146 32 144 80 L150 158 Q100 170 50 158 Z" />,
    front: <>
      <path d={cap(w, 54)} />
      <path d={`M${100 - w + 1} 66 Q${100 - w - 7} 108 ${100 - w - 3} 142 Q${100 - w + 6} 120 ${100 - w + 5} 84 Z`} />
      <path d={`M${100 + w - 1} 66 Q${100 + w + 7} 108 ${100 + w + 3} 142 Q${100 + w - 6} 120 ${100 + w - 5} 84 Z`} />
      <path d="M100 40 V54" stroke={DEEP} strokeWidth={1.5} />{shine(w, 44)}
    </>,
  }),
  curly: () => ({
    back: <>{[[58, 82, 12], [142, 82, 12], [58, 100, 10], [142, 100, 10]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}</>,
    front: <>
      {[[64, 68, 11], [68, 54, 13], [80, 44, 14], [96, 38, 15], [112, 39, 14], [126, 46, 14], [134, 58, 12], [136, 70, 10], [88, 54, 9], [108, 52, 9]].map(([x, y, r]) => <circle key={`${x}${y}`} cx={x} cy={y} r={r} />)}
      {[[76, 40], [96, 32], [118, 36]].map(([x, y]) => <path key={x} d={`M${x - 4} ${y + 2} q4 -5 8 0`} fill="none" stroke={SHINE} strokeWidth={2.5} strokeLinecap="round" />)}
    </>,
  }),
  ponytail: (w) => ({
    back: <path d="M122 50 Q170 54 160 120 Q156 104 146 96 Q150 70 120 64 Z" />,
    front: <><path d={swept(w)} /><circle cx={127} cy={52} r={5} style={C} />{shine(w)}</>,
  }),
  bald: (w) => ({
    front: <>
      <path d={`M${100 - w + 1} 96 Q${100 - w - 1} 74 ${100 - w + 7} 66 Q${100 - w + 5} 80 ${100 - w + 6} 96 Z`} />
      <path d={`M${100 + w - 1} 96 Q${100 + w + 1} 74 ${100 + w - 7} 66 Q${100 + w - 5} 80 ${100 + w - 6} 96 Z`} />
      <ellipse cx={86} cy={56} rx={11} ry={5} fill={SHINE} transform="rotate(-20 86 56)" />
    </>,
  }),
};

/** The beard's inner edge runs inside the jaw and dips below the open mouth, so both stay visible. */
const MUSTACHE = "M85 114 Q89 108 100 111 Q111 108 115 114 Q117 118 113 117 Q107 114 100 115 Q93 114 87 117 Q83 118 85 114 Z";
const FACIAL: Record<FaceSpec["facialHair"], (w: number) => React.ReactNode> = {
  none: () => null,
  beard: (w) => <>
    <path d={`M${100 - w} 90 Q${100 - w - 1} 144 100 152 Q${100 + w + 1} 144 ${100 + w} 90 L${100 + w - 4} 90 Q${100 + w - 4} 120 112 124 Q110 134 100 135 Q90 134 88 124 Q${100 - w + 4} 120 ${100 - w + 4} 90 Z`} />
    <path d={MUSTACHE} />
    <path d="M100 140 v6 M92 138 v5 M108 138 v5" stroke={SHINE} strokeWidth={1.5} strokeLinecap="round" />
  </>,
  mustache: () => <path d={MUSTACHE} />,
};

const SHOULDERS = "M30 200 Q32 160 70 152 L130 152 Q168 160 170 200 Z";
const BODY_SHADE = <path d="M132 153 Q166 160 170 200 L146 200 Q148 172 132 153 Z" fill="rgba(0,0,0,.08)" />;
const OUTFITS: Record<FaceSpec["outfit"], React.ReactNode> = {
  shirt: <>
    <path d={SHOULDERS} style={C} />
    <path d="M88 151 L100 170 L112 151 Z" fill={DEEP} />
    <path d="M87 150 L100 166 L83 164 Z M113 150 L100 166 L117 164 Z" fill={WHITE} />
    <rect x={122} y={172} width={18} height={7} rx={2} fill={GOLD} />
  </>,
  chef: <>
    <path d={SHOULDERS} fill={WHITE} />
    <path d="M100 156 Q112 172 116 200" fill="none" stroke={SHADE} strokeWidth={2} />
    {[170, 182, 194].map((y) => <g key={y} style={C}><circle cx={96} cy={y} r={2.8} /><circle cx={124} cy={y} r={2.8} /></g>)}
    <path d="M86 151 Q100 163 114 151 L113 158 Q100 170 87 158 Z" style={C} />
  </>,
  coat: <>
    <path d={SHOULDERS} fill={WHITE} />
    <path d="M88 152 L100 182 L112 152 Z" style={C} />
    <path d="M88 152 L80 166 L97 190 M112 152 L120 166 L103 190" fill="none" stroke={SHADE} strokeWidth={2} strokeLinejoin="round" />
    <path d="M85 153 Q76 180 96 190 M115 153 Q124 180 104 190" fill="none" stroke="#3d4450" strokeWidth={2.5} strokeLinecap="round" />
    <circle cx={100} cy={191} r={5} fill={STEEL} stroke="#3d4450" strokeWidth={2} />
    <rect x={126} y={176} width={14} height={16} rx={2} fill="none" stroke={SHADE} strokeWidth={2} />
  </>,
  blazer: <>
    <path d={SHOULDERS} style={C} />
    <path d="M90 152 L100 178 L110 152 Z" fill={WHITE} />
    <path d="M89 152 L78 164 L99 192 Z M111 152 L122 164 L101 192 Z" fill={DEEP} />
    <circle cx={100} cy={196} r={2.5} fill={DEEP} />
  </>,
  tshirt: <>
    <path d={SHOULDERS} style={C} />
    <path d="M86 152 Q100 166 114 152" fill="none" stroke={DEEP} strokeWidth={4} strokeLinecap="round" />
    <path d="M54 170 Q56 186 52 200 M146 170 Q144 186 148 200" fill="none" stroke="rgba(0,0,0,.1)" strokeWidth={2} />
  </>,
};

const ACCESSORIES: Record<FaceSpec["accessory"], (w: number) => React.ReactNode> = {
  none: () => null,
  glasses: (w) => (
    <g stroke={LINE} strokeWidth={2.5} strokeLinejoin="round">
      {EYES_X.map((x) => <rect key={x} x={x - 12} y={EYE_Y - 9} width={24} height={18} rx={7} fill="rgba(255,255,255,.16)" />)}
      <path d="M96 87 Q100 84 104 87" fill="none" />
      <path d={`M72 86 L${100 - w + 1} 84 M128 86 L${100 + w - 1} 84`} fill="none" />
    </g>
  ),
  chefHat: () => (
    <g fill={WHITE}>
      <circle cx={78} cy={34} r={14} /><circle cx={122} cy={34} r={14} /><circle cx={100} cy={24} r={17} />
      <path d="M72 36 h56 v16 h-56 z" />
      <path d="M86 38 v12 M100 38 v12 M114 38 v12" stroke="rgba(0,0,0,.1)" strokeWidth={1.5} />
      <path d="M72 50 h56 v2 h-56 z" fill="rgba(0,0,0,.1)" />
    </g>
  ),
  cap: () => <g>
    <path d="M62 60 Q60 26 100 26 Q140 26 138 60 Z" style={C} />
    <path d="M100 27 V58 M80 32 Q76 44 76 60 M120 32 Q124 44 124 60" fill="none" stroke={SHADE} strokeWidth={1.5} />
    <circle cx={100} cy={27} r={3} style={C} />
    <path d="M58 58 Q100 48 142 58 Q142 66 100 64 Q58 66 58 58 Z" style={C} />
    <path d="M58 58 Q100 48 142 58 Q142 66 100 64 Q58 66 58 58 Z" fill={DEEP} />
  </g>,
  earrings: (w) => <g fill="none" stroke={GOLD} strokeWidth={2}>{[100 - w, 100 + w].map((x) => <circle key={x} cx={x} cy={107} r={4} />)}</g>,
};

/** The whole bust, back to front. */
export function FaceArt({ spec }: { spec: FaceSpec }) {
  const skin = SKIN[spec.skin], hair = HAIR[spec.hairColor], head = HEADS[spec.head], hairdo = HAIRS[spec.hair](head.w), mouth = mouthPaths(spec.mouth, 0, 0);
  return (
    <>
      <g fill={hair}>{hairdo.back}</g>
      <path d="M89 112 L89 154 Q100 160 111 154 L111 112 Z" fill={skin} />
      <ellipse cx={100} cy={130} rx={13} ry={7} fill={SHADE} />
      {OUTFITS[spec.outfit]}
      {BODY_SHADE}
      <Ears kind={spec.ears} w={head.w} skin={skin} />
      <path d={head.d} fill={skin} />
      {[78, 122].map((x) => <ellipse key={x} cx={x} cy={106} rx={7} ry={4} fill={BLUSH} opacity={0.2} />)}
      {EYES_X.map((x) => <Eye key={x} cx={x} kind={spec.eyes} skin={skin} />)}
      <g fill={hair} stroke={hair}>{EYES_X.map((x, i) => <g key={x} className={`brow ${i ? "brow-r" : "brow-l"}`}>{BROWS[spec.brows](x, i ? 1 : -1)}</g>)}</g>
      {NOSES[spec.nose]}
      <g className="mouth">
        <path className="m-cavity" d={mouth.cavity} fill={CAVITY} stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
        <path className="m-teeth" d={mouth.teeth} fill={WHITE} />
        <ellipse className="m-tongue" cx={mouth.tongue.cx} cy={mouth.tongue.cy} rx={mouth.tongue.rx} ry={mouth.tongue.ry} fill={TONGUE} />
        <path className="m-lip" d={mouth.lip} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinecap="round" />
      </g>
      <g fill={hair}>{FACIAL[spec.facialHair](head.w)}</g>
      <g fill={hair}>{hairdo.front}</g>
      {ACCESSORIES[spec.accessory](head.w)}
    </>
  );
}
