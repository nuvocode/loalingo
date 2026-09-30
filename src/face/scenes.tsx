// Flat backdrops behind a character's bust, on a 400×300 canvas (bottom-aligned, sliced to fill).
// The bust covers roughly x 95–305 from y 60 down, so props sit at the sides and along the top.
import type { CharacterId } from "../characters";

const WOOD = "#b98a5e", WOOD_D = "#8f6440", PLANT = "#5aa36b", PLANT_D = "#3f8052", POT = "#d07a4f";
const WHITE = "#fbfaf7", STEEL = "#aab3bd", STEEL_D = "#7d8792", GLASS = "#cfe6f5", INK = "#4a4f57";
const FLOOR = "rgba(0,0,0,.08)";

const Plant = ({ x, y }: { x: number; y: number }) => (
  <g>
    <ellipse cx={x - 12} cy={y - 34} rx={10} ry={20} fill={PLANT_D} transform={`rotate(-25 ${x - 12} ${y - 34})`} />
    <ellipse cx={x + 12} cy={y - 34} rx={10} ry={20} fill={PLANT_D} transform={`rotate(25 ${x + 12} ${y - 34})`} />
    <ellipse cx={x} cy={y - 42} rx={10} ry={24} fill={PLANT} />
    <path d={`M${x - 16} ${y - 20} h32 l-5 20 h-22 z`} fill={POT} />
  </g>
);

const Window = ({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: React.ReactNode }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={4} fill={GLASS} />
    {children}
    <rect x={x} y={y} width={w} height={h} rx={4} fill="none" stroke={WHITE} strokeWidth={6} />
    <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={WHITE} strokeWidth={4} />
  </g>
);

// Hotel reception: key rack, world clocks, a counter with a bell.
const hotel = (
  <>
    {[140, 260].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy={30} r={15} fill={WHITE} stroke={WOOD_D} strokeWidth={3} />
        <path d={`M${cx} 30 V21 M${cx} 30 h7`} stroke={INK} strokeWidth={2} strokeLinecap="round" />
      </g>
    ))}
    <rect x={18} y={60} width={78} height={92} rx={6} fill={WOOD} />
    {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => (
      <g key={`${r}${c}`}>
        <rect x={26 + c * 24} y={68 + r * 28} width={18} height={22} rx={3} fill={WOOD_D} />
        <circle cx={35 + c * 24} cy={76 + r * 28} r={3} fill="#e8c35a" />
      </g>
    )))}
    <Plant x={352} y={212} />
    <rect x={0} y={212} width={400} height={88} fill={WOOD_D} />
    <rect x={0} y={212} width={400} height={10} fill={WOOD} />
    <path d="M44 212 a12 12 0 0 1 24 0 z" fill="#e8c35a" />
    <rect x={54} y={196} width={4} height={4} fill="#e8c35a" />
  </>
);

// Kitchen: tiled backsplash, hanging pans and utensils, a shelf of jars.
const kitchen = (
  <>
    <g stroke={WHITE} strokeWidth={2} opacity={0.55}>
      {[40, 80, 120, 160, 200].map((y) => <line key={y} x1={0} y1={y} x2={400} y2={y} />)}
      {[40, 80, 120, 160, 200, 240, 280, 320, 360].map((x) => <line key={x} x1={x} y1={0} x2={x} y2={230} />)}
    </g>
    <rect x={10} y={20} width={100} height={4} rx={2} fill={STEEL_D} />
    <g fill={STEEL_D}>
      <line x1={30} y1={24} x2={30} y2={40} stroke={STEEL_D} strokeWidth={2} />
      <circle cx={30} cy={62} r={22} fill={INK} />
      <rect x={28} y={36} width={4} height={10} />
      <line x1={80} y1={24} x2={80} y2={36} stroke={STEEL_D} strokeWidth={2} />
      <rect x={77} y={36} width={6} height={36} rx={3} fill={STEEL} />
      <ellipse cx={80} cy={80} rx={10} ry={13} fill={STEEL} />
      <line x1={100} y1={24} x2={100} y2={36} stroke={STEEL_D} strokeWidth={2} />
      <rect x={97} y={36} width={6} height={46} rx={3} fill={WOOD} />
    </g>
    <rect x={290} y={96} width={104} height={8} rx={2} fill={WOOD_D} />
    {[[300, "#e46a5a"], [330, "#e8c35a"], [360, "#8cc084"]].map(([x, c]) => (
      <g key={x}>
        <rect x={+x} y={66} width={22} height={30} rx={4} fill={c as string} />
        <rect x={+x - 1} y={62} width={24} height={7} rx={2} fill={WOOD} />
      </g>
    ))}
    <rect x={0} y={230} width={400} height={70} fill={STEEL} />
    <rect x={0} y={230} width={400} height={8} fill={STEEL_D} />
    <path d="M312 230 q0 -30 30 -30 h8 q30 0 30 30 z" fill={INK} />
    <rect x={306} y={198} width={80} height={6} rx={3} fill={INK} />
  </>
);

// Doctor's office: window with blinds, eye chart, a first-aid cabinet.
const clinic = (
  <>
    <Window x={290} y={30} w={90} h={110}>
      <g stroke={WHITE} strokeWidth={3} opacity={0.8}>
        {[45, 60, 75, 90].map((y) => <line key={y} x1={290} y1={y} x2={380} y2={y} />)}
      </g>
    </Window>
    <Plant x={335} y={252} />
    <rect x={20} y={30} width={62} height={86} rx={4} fill={WHITE} />
    {[[36, 16], [52, 12], [66, 9], [78, 7], [89, 5]].map(([y, s], i) => (
      <g key={y} fill={INK}>
        {Array.from({ length: i + 1 }, (_, j) => <rect key={j} x={51 - (i + 1) * (s + 3) / 2 + j * (s + 3)} y={y} width={s} height={s} rx={1} />)}
      </g>
    ))}
    <rect x={24} y={136} width={60} height={70} rx={6} fill={WHITE} />
    <path d="M48 156 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 v-12 h12 z" fill="#e46a5a" />
    <rect x={0} y={252} width={400} height={48} fill={FLOOR} />
  </>
);

// Rented flat: curtained window, a framed picture, a floor lamp and a sofa arm.
const flat = (
  <>
    <rect x={0} y={0} width={400} height={150} fill={FLOOR} opacity={0.5} />
    <Window x={290} y={40} w={80} h={96} />
    <path d="M280 32 h26 q-6 60 4 116 h-30 z M384 32 h-26 q6 60 -4 116 h30 z" fill="#e8a87c" />
    <rect x={276} y={28} width={112} height={6} rx={3} fill={WOOD_D} />
    <rect x={24} y={40} width={64} height={50} rx={3} fill={WOOD} />
    <rect x={30} y={46} width={52} height={38} fill={GLASS} />
    <path d="M30 84 l16 -18 l12 12 l8 -8 l16 14 z" fill={PLANT} />
    <circle cx={70} cy={56} r={5} fill="#f2d16b" />
    <line x1={50} y1={150} x2={50} y2={250} stroke={INK} strokeWidth={4} />
    <path d="M32 150 h36 l-8 -28 h-20 z" fill="#f2d16b" />
    <ellipse cx={50} cy={252} rx={16} ry={4} fill={INK} />
    <rect x={0} y={252} width={400} height={48} fill={WOOD} opacity={0.7} />
    <rect x={318} y={196} width={82} height={70} rx={14} fill="#7a8fb8" />
    <rect x={304} y={184} width={34} height={82} rx={14} fill="#6a7fa8" />
  </>
);

// Office: window onto a skyline, a bookshelf, a wall clock.
const office = (
  <>
    <Window x={270} y={24} w={116} h={130}>
      <path d="M270 154 V104 h16 V84 h18 v70 M310 154 V94 h22 v60 M338 154 V112 h16 V74 h20 v80 h12 v0 z" fill="#9fb6cc" />
    </Window>
    <circle cx={124} cy={40} r={14} fill={WHITE} stroke={INK} strokeWidth={3} />
    <path d="M124 40 V31 M124 40 l6 4" stroke={INK} strokeWidth={2} strokeLinecap="round" />
    <rect x={14} y={40} width={86} height={180} rx={4} fill={WOOD_D} />
    {[48, 104, 160].map((y, r) => (
      <g key={y}>
        <rect x={20} y={y + 48} width={74} height={4} fill={WOOD} />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={24 + i * 13 + (r === 1 && i > 2 ? 6 : 0)} y={y + 10 + ((i + r) % 3) * 4} width={10} height={38 - ((i + r) % 3) * 4} rx={1}
            fill={["#e46a5a", "#7a8fb8", "#e8c35a", "#8cc084", WHITE][(i + r) % 5]} />
        ))}
      </g>
    ))}
    <rect x={0} y={236} width={400} height={64} fill={FLOOR} />
  </>
);

// City tour: sky, sun, clouds, rooftops and a clock tower.
const city = (
  <>
    <rect x={0} y={0} width={400} height={300} fill="#bfe0f4" opacity={0.75} />
    <circle cx={342} cy={46} r={22} fill="#f7d774" />
    <g fill={WHITE}>
      <path d="M40 50 a14 14 0 0 1 26 -6 a12 12 0 0 1 20 10 h-50 a8 8 0 0 1 4 -4 z" />
      <path d="M220 34 a12 12 0 0 1 22 -4 a10 10 0 0 1 16 8 h-42 z" />
    </g>
    <rect x={40} y={80} width={34} height={180} fill="#d9a07a" />
    <path d="M34 80 L57 48 L80 80 z" fill="#b5452a" />
    <circle cx={57} cy={104} r={11} fill={WHITE} stroke={INK} strokeWidth={2} />
    <path d="M57 104 V97 M57 104 h5" stroke={INK} strokeWidth={1.5} />
    <path d="M0 260 V150 h36 V260 z M80 260 V170 h30 v90 z" fill="#e8c9a4" />
    <path d="M290 260 V140 h40 v120 z M330 260 V168 h34 v92 z M364 260 V130 h36 v130 z" fill="#e8c9a4" />
    <path d="M286 140 h48 l-24 -18 z M360 130 h44 l-22 -20 z" fill="#b5452a" />
    <g fill={GLASS}>
      {[160, 190, 220].map((y) => <g key={y}><rect x={298} y={y} width={8} height={12} /><rect x={314} y={y} width={8} height={12} /><rect x={372} y={y - 10} width={8} height={12} /><rect x={386} y={y - 10} width={8} height={12} /></g>)}
    </g>
    <circle cx={120} cy={236} r={20} fill={PLANT} /><rect x={117} y={250} width={6} height={14} fill={WOOD_D} />
    <rect x={0} y={260} width={400} height={40} fill="#c8c2b8" />
  </>
);

const SCENES: Record<CharacterId, React.ReactNode> = { mia: hotel, kai: kitchen, nora: clinic, tom: flat, emma: office, leo: city };

export const Scene = ({ who }: { who: CharacterId }) => (
  <svg className="scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">{SCENES[who]}</svg>
);
