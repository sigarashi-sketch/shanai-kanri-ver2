'use client';

import { Bell, Check } from 'lucide-react';
import { needText } from '@/components/Perms';
import { KYOTEI } from '@/lib/roumu-sample';

// 残業・36協定・有給の画面の部品（page.tsx と live.tsx の両方で使う）
export type Notify = { canEdit: boolean; sent: Record<string, string>; flash: string | null; send: (key: string, who: string, to: string[], what: string) => void; err: string; live: boolean };

export function Spark({ xs }: { xs: number[] }) {
  const w = 64, h = 22, max = Math.max(KYOTEI.monthly + 5, ...xs);
  const pts = xs.map((v, i) => `${(i / (xs.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  const y45 = h - (KYOTEI.monthly / max) * h;
  return (
    <svg width={w} height={h} aria-label={`直近6か月 ${xs.join('・')}時間`} role="img">
      <line x1="0" x2={w} y1={y45} y2={y45} stroke="var(--color-field)" strokeDasharray="2 2" />
      <polyline points={pts} fill="none" stroke="var(--a)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}


/** 知らせるボタン。宛先が無い（知らせを止めている）ときは押せない。本物は「知らせた」の印を残すだけ（送らない） */
export function NotifyButton({ n, k, who, to, what, label }: { n: Notify; k: string; who: string; to: string[]; what: string; label: string }) {
  if (n.sent[k]) return <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-ok"><Check size={14} />{n.sent[k]}</span>;
  const none = to.length === 0;
  return (
    <>
      <button onClick={() => n.send(k, who, to, what)} disabled={!n.canEdit || none} title={!n.canEdit ? needText('edit') : none ? 'アラート設定で知らせを止めています' : `${to.join('・')}に知らせる`} className="inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: 'var(--al)', color: 'var(--ad)' }}><Bell size={14} />{label}</button>
      <div className="mt-1 text-xs text-faint">{none ? '知らせを止めています' : to.join('・')}</div>
    </>
  );
}

