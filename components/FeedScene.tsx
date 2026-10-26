import type { FeedType } from '@/lib/types/base';

// ホーム人事のフィードのイラスト（要員の動きを1枚の絵にする）。丸と四角だけの簡単な人形。絵文字・写真は使わない。
//   色は役割の色（var(--tone-*) / var(--color-*) / 分類の色）だけ＝着せ替えで一緒に変わる。服の色は名前から決める（誰の投稿かが絵でも分かる）
//   動きは globals.css の .hj-sc-*（「動きを減らす」では止まる）。CSS の transform は transform 属性を上書きするので、位置決めの <g> と動かす <g> を分ける
const INK = 'var(--color-ink)';
const SKIN = 'var(--color-surface)';
const CLOTH = ['var(--tone-info-fg)', 'var(--tone-ok-fg)', 'var(--tone-purple-fg)', 'var(--tone-warn-fg)', 'var(--tone-bad-fg)', 'var(--ad)'];
export const clothOf = (name: string) => { let h = 0; for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0; return CLOTH[h % CLOTH.length]; };
const BG: Record<FeedType, string> = {
  shoudaku: 'var(--tone-info-bg)', sankaku: 'var(--tone-caution-bg)', debut: 'var(--tone-ok-bg)', mendan: 'var(--tone-purple-bg)', teiki: 'var(--tone-info-bg)',
  jitai: 'var(--tone-mute-bg)', taisha: 'var(--tone-mute-bg)', reassign: 'var(--tone-warn-bg)', line: 'var(--tone-ok-bg)', memo: 'var(--tone-caution-bg)',
};
const CONFETTI = ['var(--tone-warn-fg)', 'var(--tone-bad-fg)', 'var(--tone-purple-fg)', 'var(--tone-info-fg)', 'var(--tone-ok-fg)', 'var(--a)'];

type Arm = 'down' | 'up' | 'wave' | 'hold';
function Person({ x, y = 240, c, arm = 'down', s = 1, face = 'smile', flip, cls }: { x: number; y?: number; c: string; arm?: Arm; s?: number; face?: 'smile' | 'flat'; flip?: boolean; cls?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g transform={`scale(${flip ? -s : s} ${s})`}>
        <g className={cls}>
          <rect x={-12} y={-14} width={9} height={15} rx={4.5} fill={INK} />
          <rect x={3} y={-14} width={9} height={15} rx={4.5} fill={INK} />
          <path d="M-17 -44 L-23 -22" stroke={c} strokeWidth={9} strokeLinecap="round" />
          <rect x={-19} y={-58} width={38} height={48} rx={17} fill={c} />
          {arm === 'down' && <path d="M17 -44 L23 -22" stroke={c} strokeWidth={9} strokeLinecap="round" />}
          {arm === 'up' && <path d="M15 -46 L30 -76" stroke={c} strokeWidth={9} strokeLinecap="round" />}
          {arm === 'hold' && <path d="M15 -42 L34 -46" stroke={c} strokeWidth={9} strokeLinecap="round" />}
          {arm === 'wave' && <path className="hj-sc-wave" d="M15 -46 L34 -68" stroke={c} strokeWidth={9} strokeLinecap="round" />}
          <circle cx={0} cy={-74} r={16} fill={SKIN} stroke={INK} strokeWidth={2} />
          <path d="M-16.5 -75 a16.5 16.5 0 0 1 33 0 q-9 -7 -16.5 -6 q-7.5 -1 -16.5 6z" fill={INK} />
          <circle cx={-5.5} cy={-70} r={1.8} fill={INK} /><circle cx={5.5} cy={-70} r={1.8} fill={INK} />
          {face === 'smile' ? <path d="M-5 -64 Q0 -59 5 -64" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" /> : <path d="M-4 -63 L4 -63" stroke={INK} strokeWidth={1.8} strokeLinecap="round" />}
        </g>
      </g>
    </g>
  );
}
function Sparkle({ x, y, r = 9, fill = 'var(--tone-caution-fg)', delay = 0 }: { x: number; y: number; r?: number; fill?: string; delay?: number }) {
  const k = r * 0.28;
  return <path className="hj-sc-twinkle" style={{ animationDelay: `${delay}s` }} fill={fill} d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k}Z`} />;
}
function More({ x, n }: { x: number; n: number }) {
  if (n <= 0) return null;
  return <g><circle cx={x} cy={206} r={21} fill={SKIN} stroke="var(--color-line)" strokeWidth={2} /><text x={x} y={211} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK}>+{n}</text></g>;
}
const row = (n: number, cx: number, gap: number) => Array.from({ length: n }, (_, i) => cx + (i - (n - 1) / 2) * gap);
const Building = ({ x, w, h, dim }: { x: number; w: number; h: number; dim?: boolean }) => (
  <g opacity={dim ? 0.5 : 1}>
    <rect x={x} y={240 - h} width={w} height={h} rx={6} fill={SKIN} stroke="var(--color-field)" strokeWidth={2} />
    {[0, 1, 2].flatMap((r) => [0, 1].map((c) => <rect key={`${r}-${c}`} x={x + 10 + c * (w / 2 - 4)} y={252 - h + r * 26} width={w / 2 - 18} height={14} rx={3} fill="var(--color-sunken)" />))}
  </g>
);

export default function FeedScene({ type, names, total }: { type: FeedType; names: string[]; total: number }) {
  const cs = names.slice(0, 5).map(clothOf);
  const n = Math.max(1, cs.length);
  const more = total - n;
  const s = n === 1 ? 1.08 : n <= 3 ? 0.95 : 0.85;
  let body: React.ReactNode;

  if (type === 'shoudaku') {
    const xs = row(n, more > 0 ? 180 : 196, 58); const hx = xs[n - 1] + 30 * s, hy = 240 - 76 * s;
    body = <>
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={s} arm={i === n - 1 ? 'up' : 'down'} cls="hj-sc-bob" />)}
      <rect x={hx - 6} y={hy - 50} width={40} height={50} rx={5} fill={SKIN} stroke="var(--tone-info-fg)" strokeWidth={2} />
      <path d={`M${hx + 1} ${hy - 38} h26 M${hx + 1} ${hy - 29} h26 M${hx + 1} ${hy - 20} h16`} stroke="var(--color-line)" strokeWidth={3} strokeLinecap="round" />
      <circle cx={hx + 30} cy={hy - 4} r={12} fill="var(--tone-ok-fg)" />
      <path d={`M${hx + 24} ${hy - 4} l4 4 l8 -9`} stroke={SKIN} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Sparkle x={70} y={84} /><Sparkle x={332} y={70} r={7} delay={0.5} fill="var(--tone-info-fg)" /><Sparkle x={308} y={132} r={5} delay={0.9} />
      <More x={xs[n - 1] + 78} n={more} />
    </>;
  } else if (type === 'sankaku') {
    const xs = row(n, more > 0 ? 180 : 200, 60); const mid = Math.floor((n - 1) / 2); const px = xs[mid]; const hx = px + 30 * s, hy = 218 - 76 * s;
    body = <>
      {Array.from({ length: 16 }, (_, i) => <rect key={i} className="hj-sc-fall" style={{ animationDelay: `${(i * 0.37) % 2.6}s` }} x={26 + ((i * 83) % 348)} y={14 + ((i * 47) % 90)} width={7} height={11} rx={2} fill={CONFETTI[i % CONFETTI.length]} />)}
      <rect x={px - 42} y={218} width={84} height={22} rx={5} fill={SKIN} stroke="var(--tone-warn-fg)" strokeWidth={2} />
      <text x={px} y={234} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--tone-warn-fg)">1</text>
      <path d={`M${hx} ${hy} v-64`} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path className="hj-sc-flag" d={`M${hx + 2} ${hy - 63} h46 l-11 14 l11 14 h-46z`} fill="var(--a)" />
      {xs.map((x, i) => <Person key={i} x={x} y={i === mid ? 218 : 240} c={cs[i]} s={s} arm="up" cls={i === mid ? undefined : 'hj-sc-bob'} />)}
      <More x={xs[n - 1] + 78} n={more} />
    </>;
  } else if (type === 'debut') {
    const gap = n >= 5 ? 40 : 48; const xs = Array.from({ length: n }, (_, i) => 52 + i * gap);
    body = <>
      <circle className="hj-sc-twinkle" cx={56} cy={58} r={22} fill="var(--tone-caution-fg)" opacity={0.5} />
      <Building x={268} w={104} h={148} />
      <rect x={308} y={196} width={24} height={44} rx={4} fill="var(--tone-ok-fg)" />
      <path className="hj-sc-dash" d={`M${xs[n - 1] + 34} 244 H300`} stroke="var(--tone-ok-fg)" strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" />
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={s} arm={i === n - 1 ? 'hold' : 'down'} cls="hj-sc-bob" />)}
      {more > 0 && <More x={236} n={more} />}
    </>;
  } else if (type === 'mendan' || type === 'teiki') {
    const teiki = type === 'teiki';
    const k = Math.min(n, 3); const xs = Array.from({ length: k }, (_, i) => 132 - (k - 1 - i) * 46); const bx = xs[k - 1];
    body = <>
      <rect x={168} y={204} width={76} height={8} rx={4} fill="var(--tone-purple-fg)" opacity={0.5} />
      <rect x={178} y={212} width={6} height={28} fill="var(--tone-purple-fg)" opacity={0.5} /><rect x={228} y={212} width={6} height={28} fill="var(--tone-purple-fg)" opacity={0.5} />
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={0.95} arm={i === k - 1 ? 'hold' : 'down'} />)}
      <Person x={282} c={teiki ? 'var(--a)' : 'var(--color-faint)'} s={0.95} arm="hold" flip />
      {teiki && <g><rect x={226} y={184} width={26} height={20} rx={3} fill={SKIN} stroke="var(--tone-info-fg)" strokeWidth={2} /><path d="M231 191 h16 M231 197 h10" stroke="var(--color-line)" strokeWidth={2.4} strokeLinecap="round" /></g>}
      <rect x={bx - 30} y={86} width={62} height={34} rx={17} fill={SKIN} stroke="var(--tone-purple-fg)" strokeWidth={2} />
      {[0, 1, 2].map((i) => <circle key={i} className="hj-sc-dot" style={{ animationDelay: `${i * 0.15}s` }} cx={bx - 13 + i * 14} cy={103} r={3.5} fill="var(--tone-purple-fg)" />)}
      <rect x={256} y={100} width={50} height={28} rx={14} fill={SKIN} stroke="var(--color-line)" strokeWidth={2} />
      {[0, 1, 2].map((i) => <circle key={i} className="hj-sc-dot" style={{ animationDelay: `${0.6 + i * 0.15}s` }} cx={269 + i * 12} cy={114} r={3} fill="var(--color-faint)" />)}
      {total - k > 0 && <More x={352} n={total - k} />}
    </>;
  } else if (type === 'jitai') {
    const xs = row(n, more > 0 ? 200 : 220, 52);
    body = <>
      <rect x={70} y={150} width={6} height={90} rx={3} fill="var(--color-faint)" />
      <path d="M76 156 h54 l12 12 l-12 12 h-54z" fill={SKIN} stroke="var(--color-faint)" strokeWidth={2} strokeLinejoin="round" />
      <path className="hj-sc-dash" d={`M96 246 H${xs[0] - 30}`} stroke="var(--color-field)" strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" />
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={s} face="flat" cls="hj-sc-bob" />)}
      <More x={xs[n - 1] + 72} n={more} />
    </>;
  } else if (type === 'taisha') {
    const xs = row(n, more > 0 ? 206 : 232, n >= 5 ? 46 : 54); const lx = xs[0];
    body = <>
      <rect x={58} y={110} width={74} height={130} rx={4} fill={SKIN} stroke="var(--color-field)" strokeWidth={2} />
      <path d="M58 110 l38 14 v118 l-38 -2z" fill="var(--color-sunken)" stroke="var(--color-field)" strokeWidth={2} strokeLinejoin="round" />
      <rect x={lx - 48 * s} y={240 - 30 * s} width={26 * s} height={22 * s} rx={3} fill="var(--tone-warn-bg)" stroke="var(--tone-warn-fg)" strokeWidth={2} />
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={s} arm="wave" />)}
      <More x={Math.min(xs[n - 1] + 70, 374)} n={more} />
    </>;
  } else if (type === 'reassign') {
    const k = total > 3 ? 2 : Math.min(n, 3); const xs = row(k, total > 3 ? 176 : 200, 50);
    body = <>
      <Building x={48} w={62} h={104} dim /><Building x={290} w={62} h={104} />
      <path className="hj-sc-dash" d="M92 118 Q200 28 308 118" stroke="var(--tone-warn-fg)" strokeWidth={4} fill="none" strokeDasharray="10 9" strokeLinecap="round" />
      <path d="M294 106 l16 14 l4 -21z" fill="var(--tone-warn-fg)" />
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={0.95} cls="hj-sc-bob" />)}
      {total - k > 0 && <More x={250} n={total - k} />}
    </>;
  } else if (type === 'line') {
    const k = Math.min(n, 3); const xs = Array.from({ length: k }, (_, i) => 180 - (k - 1 - i) * 50);
    body = <>
      <rect x={258} y={60} width={98} height={180} rx={16} fill={SKIN} stroke={INK} strokeWidth={3} />
      <rect x={270} y={92} width={56} height={26} rx={13} fill="var(--tone-ok-fg)" />
      <rect x={288} y={126} width={56} height={26} rx={13} fill="var(--color-sunken)" />
      <g className="hj-sc-twinkle"><circle cx={307} cy={196} r={18} fill="var(--tone-ok-fg)" /><path d="M307 187 v18 M298 196 h18" stroke={SKIN} strokeWidth={3.4} strokeLinecap="round" /></g>
      {xs.map((x, i) => <Person key={i} x={x} c={cs[i]} s={k === 1 ? 1.08 : 0.92} arm={i === k - 1 ? 'wave' : 'down'} />)}
      {total - k > 0 && <More x={30} n={total - k} />}
    </>;
  } else {
    body = <>
      <rect x={226} y={78} width={124} height={156} rx={9} fill={SKIN} stroke="var(--tone-caution-fg)" strokeWidth={2} />
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={238} cy={98 + i * 29} r={4} fill="var(--tone-caution-fg)" />)}
      <path d="M254 108 h78 M254 132 h78 M254 156 h60 M254 180 h70" stroke="var(--color-line)" strokeWidth={5} strokeLinecap="round" />
      <g className="hj-sc-bob"><path d="M300 214 l34 -34 l10 10 l-34 34 l-14 4z" fill="var(--tone-caution-bg)" stroke="var(--tone-caution-fg)" strokeWidth={2} strokeLinejoin="round" /></g>
      <Person x={130} c={cs[0]} s={1.08} arm="hold" />
    </>;
  }

  return (
    <svg viewBox="0 0 400 300" className="hj-sc block h-auto w-full" role="img" aria-hidden="true">
      <rect width={400} height={300} fill={BG[type]} />
      <ellipse cx={200} cy={247} rx={178} ry={9} fill="var(--color-track)" />
      {body}
    </svg>
  );
}
