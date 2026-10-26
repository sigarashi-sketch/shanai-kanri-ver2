'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, HoryuFrame, Msg, horyuPost, inputCls, tdCls, thCls, useHoryu, fmtAt } from '@/components/horyu/kit';

// アクセス元IP（保留・10-25）。今の /access-log.html と同じ：人 × IP × 端末、組織名・場所の目安・気づき。
//   全体管理者だけ（今のシステムが 403 を返せば何も出さない）。IP に場所の名前を付けるのだけここから書ける（今の ip_place_label）
//   ※開くと、今のシステムが組織名を調べて控える（今の画面を開いたときと同じ）。まだの IP が残っていれば少しずつ読み直す
type Row = { email: string; name: string; ip: string; ua: string; first_at: string; last_at: string; hits: number; days: number; org: string; kind: string; place?: string; label?: string; flags?: string[]; night_days?: number; weekend_days?: number };
const DAYS = [7, 30, 90, 180];

export default function AccessLogPage() {
  const [days, setDays] = useState(30);
  const r = useHoryu<{ rows: Row[]; pending: number; needsMigration?: boolean; canLabel?: boolean }>('access-log', { days });
  const [q, setQ] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({ text: '' });
  // 組織名の調べ残しがあれば、少しあけて読み直す（今の画面と同じ）
  const pending = r.data?.pending ?? 0;
  const reload = r.reload;
  useEffect(() => { if (!pending) return; const t = setTimeout(() => void reload(), 4000); return () => clearTimeout(t); }, [pending, reload]);
  const rows = useMemo(() => (r.data?.rows ?? []).filter((x) => !q || `${x.name}${x.email}${x.ip}${x.org}${x.label ?? ''}`.includes(q)), [r.data, q]);

  const saveLabel = async (ip: string) => {
    const label = (labels[ip] ?? '').trim();
    const res = await horyuPost('access-log-label', { ip, label });
    setMsg(res.ok ? { text: label ? `${ip} を「${label}」にしました` : `${ip} の名前を外しました` } : { text: res.error, bad: true });
    if (res.ok) void r.reload();
  };

  return (
    <HoryuFrame title="アクセス元IP" sub="だれが、どこ（IP・端末）から使っているか（全体管理者だけ）" state={r.state} error={r.error} onReload={r.reload}>
      <div className="mo-fade-up flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-1.5 text-sm text-muted">期間<select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputCls}>{DAYS.map((d) => <option key={d} value={d}>{d}日</option>)}</select></label>
        <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-field bg-surface px-2 py-1.5 text-body sm:max-w-[260px]"><Search size={14} className="shrink-0 text-faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="人・IP・組織で探す" aria-label="探す" className="min-w-0 flex-1 bg-transparent outline-none" /></label>
        <span className="ml-auto text-sm text-faint">{rows.length}件{pending ? `・組織名を調べています（残り ${pending}）` : ''}</span>
      </div>
      <Msg text={msg.text} bad={msg.bad} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-body">
            <thead><tr className="th-row"><th className={thCls}>だれ</th><th className={thCls}>IP・端末</th><th className={thCls}>組織・場所</th><th className={`${thCls} text-right`}>日数</th><th className={thCls}>最後</th><th className={thCls}>気づき</th><th className={thCls}>場所の名前</th></tr></thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={`${x.email}-${x.ip}-${x.ua}-${i}`} className="border-t border-line-soft align-top">
                  <td className={tdCls}><b>{x.name || x.email.split('@')[0]}</b></td>
                  <td className={tdCls}><code className="text-sm">{x.ip}</code><div className="text-xs text-faint">{x.ua}</div></td>
                  <td className={tdCls}>{x.org || <span className="text-faint">調べ中</span>}<div className="text-xs text-faint">{x.place || ''}</div></td>
                  <td className={`${tdCls} num text-right`}>{x.days}</td>
                  <td className={`${tdCls} num whitespace-nowrap`}>{fmtAt(x.last_at)}</td>
                  <td className={tdCls}>{[...(x.flags ?? []), x.night_days ? `夜 ${x.night_days}日` : '', x.weekend_days ? `週末 ${x.weekend_days}日` : ''].filter(Boolean).map((f) => <span key={f} className="chip mr-1" style={{ background: 'var(--tone-warn-bg)', color: 'var(--tone-warn-fg)' }}>{f}</span>)}</td>
                  <td className={tdCls}>
                    <div className="flex gap-1">
                      <input value={labels[x.ip] ?? x.label ?? ''} onChange={(e) => setLabels({ ...labels, [x.ip]: e.target.value })} aria-label={`${x.ip} の場所の名前`} placeholder="本社・自宅 など" className={`${inputCls} w-[110px]`} disabled={r.data?.canLabel === false} />
                      {labels[x.ip] !== undefined && labels[x.ip] !== (x.label ?? '') && <button className="btn-secondary btn-sm" onClick={() => saveLabel(x.ip)}>保存</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {r.state !== 'loading' && !rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">{r.data?.needsMigration ? '今のシステムに記録の表がまだありません' : 'ありません'}</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </HoryuFrame>
  );
}
