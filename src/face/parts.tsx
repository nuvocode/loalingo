// Cartoon bust parts (spec K) on a 200×200 canvas, stacked back to front by FaceArt.
// Animated layers read CSS variables set by Face.tsx: .lid (--blink), .pupil (--look-x/y), .brows (--brow), .mouth-open (--mouth).
import type { FaceSpec } from "../characters";

export const SKIN = ["#f8d5c2", "#eab896", "#c98e68", "#9a6443", "#6b4230"];
export const HAIR = ["#1f1a17", "#4a2e1f", "#7a4a2a", "#e3b75a", "#b5452a", "#b8b8b8"];
const LINE = "#2b2320", MOUTH = "#6b2430", WHITE = "#f7f4ef", SHADE = "rgba(0,0,0,.14)";
const C = { fill: "var(--c)" }; // the character's color (clothes)
const EYE_Y = 88, EYES_X = [84, 116];

/** `w` = half the head width at the ears. */
const HEADS: Record<FaceSpec["head"], { w: number; el: React.ReactNode }> = {
  round: { w: 40, el: <ellipse cx={100} cy={88} rx={40} ry={42} /> },
  oval: { w: 36, el: <ellipse cx={100} cy={88} rx={36} ry={46} /> },
  square: { w: 38, el: <rect x={62} y={44} width={76} height={88} rx={24} /> },
};

const EARS: Record<FaceSpec["ears"], (w: number) => React.ReactNode> = {
  small: (w) => <><ellipse cx={100 - w + 1} cy={92} rx={6} ry={9} /><ellipse cx={100 + w - 1} cy={92} rx={6} ry={9} /></>,
  big: (w) => <><ellipse cx={100 - w} cy={92} rx={9} ry={12} /><ellipse cx={100 + w} cy={92} rx={9} ry={12} /></>,
};

function Eye({ cx, kind, skin }: { cx: number; kind: FaceSpec["eyes"]; skin: string }) {
  return (
    <g className={`eye ${kind}`}>
      {kind === "almond"
        ? <ellipse cx={cx} cy={EYE_Y} rx={8} ry={5} fill={WHITE} stroke={LINE} strokeWidth={1.5} />
        : <circle cx={cx} cy={EYE_Y} r={kind === "round" ? 7 : 6.5} fill={WHITE} stroke={LINE} strokeWidth={1.5} />}
      <circle className="pupil" cx={cx} cy={EYE_Y} r={kind === "round" ? 3.5 : 3} fill={LINE} />
      {/* The lid scales down from its top; its line sits mid-eye when closed and is flat (invisible) when open. */}
      <g className="lid">
        <rect x={cx - 10} y={EYE_Y - 9} width={20} height={18} fill={skin} />
        <line x1={cx - 8} y1={EYE_Y} x2={cx + 8} y2={EYE_Y} stroke={LINE} strokeWidth={2} strokeLinecap="round" />
      </g>
    </g>
  );
}

const BROWS: Record<FaceSpec["brows"], (cx: number, hair: string) => React.ReactNode> = {
  flat: (cx, hair) => <rect x={cx - 9} y={72} width={18} height={3.5} rx={1.75} fill={hair} />,
  arched: (cx, hair) => <path d={`M${cx - 9} 76 Q${cx} 68 ${cx + 9} 76`} fill="none" stroke={hair} strokeWidth={3.5} strokeLinecap="round" />,
  thick: (cx, hair) => <rect x={cx - 10} y={70} width={20} height={6} rx={3} fill={hair} />,
};

const NOSES: Record<FaceSpec["nose"], React.ReactNode> = {
  button: <ellipse cx={100} cy={102} rx={5} ry={4} fill={SHADE} />,
  long: <path d="M100 90 L96 104 Q100 107 104 104" fill="none" stroke={SHADE} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />,
  wide: <ellipse cx={100} cy={103} rx={8} ry={5} fill={SHADE} />,
};

/** Closed line + an open shape that grows down from its top with --mouth (0 = shut). */
const MOUTHS: Record<FaceSpec["mouth"], { closed: string; open: React.ReactNode }> = {
  small: { closed: "M93 118 Q100 121 107 118", open: <ellipse cx={100} cy={124} rx={6} ry={7} /> },
  wide: { closed: "M88 118 Q100 122 112 118", open: <ellipse cx={100} cy={125} rx={10} ry={8} /> },
  smile: { closed: "M88 116 Q100 128 112 116", open: <path d="M88 116 Q100 134 112 116 Z" /> },
};

/** Hair behind the head (long hair, ponytail) and in front of it (fringe, curls). */
const HAIRS: Record<FaceSpec["hair"], { back?: React.ReactNode; front?: React.ReactNode }> = {
  short: { front: <path d="M60 84 Q58 40 100 38 Q142 40 140 84 Q134 60 100 58 Q66 60 60 84 Z" /> },
  bun: { front: <><circle cx={100} cy={34} r={14} /><path d="M62 80 Q60 42 100 40 Q140 42 138 80 Q130 60 100 58 Q70 60 62 80 Z" /></> },
  long: {
    back: <path d="M56 80 Q56 36 100 36 Q144 36 144 80 L148 150 Q100 160 52 150 Z" />,
    front: <path d="M60 80 Q60 42 100 40 Q140 42 140 80 Q128 56 100 56 Q72 56 60 80 Z" />,
  },
  curly: { front: <>{[[66, 62, 12], [74, 48, 14], [90, 40, 14], [110, 40, 14], [126, 48, 14], [134, 62, 12]].map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}</> },
  ponytail: {
    back: <path d="M128 50 Q162 58 152 112 Q142 92 124 70 Z" />,
    front: <path d="M62 80 Q60 42 100 40 Q140 42 138 80 Q130 60 100 58 Q70 60 62 80 Z" />,
  },
  bald: {},
};

const FACIAL: Record<FaceSpec["facialHair"], React.ReactNode> = {
  none: null,
  beard: <path d="M62 92 Q62 142 100 148 Q138 142 138 92 Q136 130 114 134 Q100 132 86 134 Q64 130 62 92 Z" />,
  mustache: <path d="M86 113 Q93 108 100 112 Q107 108 114 113 Q107 116 100 114 Q93 116 86 113 Z" />,
};

const SHOULDERS = "M30 200 Q32 160 70 152 L130 152 Q168 160 170 200 Z";
const OUTFITS: Record<FaceSpec["outfit"], React.ReactNode> = {
  shirt: <><path d={SHOULDERS} style={C} /><path d="M86 150 L100 166 L92 150 Z M114 150 L100 166 L108 150 Z" fill={WHITE} /></>,
  chef: <><path d={SHOULDERS} fill={WHITE} />{[170, 184].map((y) => <g key={y} style={C}><circle cx={92} cy={y} r={3} /><circle cx={108} cy={y} r={3} /></g>)}</>,
  coat: <><path d={SHOULDERS} fill={WHITE} /><path d="M88 152 L100 180 L112 152 Z" style={C} /><path d="M88 152 L96 200 M112 152 L104 200" stroke={SHADE} strokeWidth={2} /></>,
  blazer: <><path d={SHOULDERS} style={C} /><path d="M90 152 L100 176 L110 152 Z" fill={WHITE} /><path d="M86 152 L100 190 M114 152 L100 190" stroke={SHADE} strokeWidth={3} /></>,
  tshirt: <><path d={SHOULDERS} style={C} /><path d="M86 152 Q100 164 114 152" fill="none" stroke={SHADE} strokeWidth={3} /></>,
};

const ACCESSORIES: Record<FaceSpec["accessory"], (w: number) => React.ReactNode> = {
  none: () => null,
  glasses: () => (
    <g fill="none" stroke={LINE} strokeWidth={2.5}>
      {EYES_X.map((x) => <circle key={x} cx={x} cy={EYE_Y} r={11} />)}
      <path d="M95 88 Q100 85 105 88" />
    </g>
  ),
  chefHat: () => (
    <g fill={WHITE} stroke="rgba(0,0,0,.1)" strokeWidth={1}>
      <circle cx={80} cy={34} r={14} /><circle cx={120} cy={34} r={14} /><circle cx={100} cy={26} r={16} />
      <rect x={72} y={36} width={56} height={16} rx={3} />
    </g>
  ),
  cap: () => <g style={C}><path d="M60 62 Q60 28 100 28 Q140 28 140 62 Z" /><ellipse cx={116} cy={62} rx={34} ry={6} /></g>,
  earrings: (w) => <g fill="#f5c542">{[100 - w, 100 + w].map((x) => <circle key={x} cx={x} cy={104} r={3} />)}</g>,
};

/** The whole bust, back to front. */
export function FaceArt({ spec }: { spec: FaceSpec }) {
  const skin = SKIN[spec.skin], hair = HAIR[spec.hairColor], head = HEADS[spec.head], hairdo = HAIRS[spec.hair], mouth = MOUTHS[spec.mouth];
  return (
    <>
      <g fill={hair}>{hairdo.back}</g>
      <rect x={88} y={116} width={24} height={44} fill={skin} />
      {OUTFITS[spec.outfit]}
      <g fill={skin}>{EARS[spec.ears](head.w)}{head.el}</g>
      {EYES_X.map((x) => <Eye key={x} cx={x} kind={spec.eyes} skin={skin} />)}
      <g className="brows">{EYES_X.map((x) => <g key={x}>{BROWS[spec.brows](x, hair)}</g>)}</g>
      {NOSES[spec.nose]}
      <path d={mouth.closed} fill="none" stroke={LINE} strokeWidth={2.5} strokeLinecap="round" />
      <g className="mouth-open" fill={MOUTH}>{mouth.open}</g>
      <g fill={hair}>{FACIAL[spec.facialHair]}</g>
      <g fill={hair}>{hairdo.front}</g>
      {ACCESSORIES[spec.accessory](head.w)}
    </>
  );
}
