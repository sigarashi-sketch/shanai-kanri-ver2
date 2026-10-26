'use client';

import { useCallback, useState } from 'react';
import { ConfirmWrite, type ConfirmSpec } from '@/components/ConfirmWrite';
import { useMotivation } from '@/components/Motivation';
import { postLive } from '@/lib/live/post';

// 案件を要員の LINE グループに送る（本物・10-26）。案件・案件マップ（要員マップ）・要員ページの「案件を送る」で同じものを使う。
//   ・まず /api/live/eigyo casePlan（送らない）：本文（案件そのまま＝今の配信画面と同じ）・送り先のグループ・見つからない人・
//     今のシステムの dry（営業リストの健全性・アダルト/店舗運営・NGワード・もう送った相手）を確かめる
//   ・確認の窓で「だれに・どのグループに・どの本文が届くか」を見せてから caseSend（今の /api/proxy?action=send）
//   ・アダルト・店舗運営系は plan の時点で止まる（ver2 と今の送信関数の両方）。送ったら案件進捗の「送った案件」に載る
type Plan = { title: string; msg: string; targets: { name: string; groupId: string; groupName: string }[]; missing: string[]; recipients: number; willSkip: number };

export function useCaseSend() {
  const { hit, toast } = useMotivation();
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useCallback(async (kNo: string, names: string[], onDone?: (sent: number) => void) => {
    if (busy) return;
    setBusy(true);
    try {
      const p = await postLive<Plan>('/api/live/eigyo', { action: 'casePlan', kNo, names });
      setSpec({
        title: `「${p.title}」を送ります`,
        okLabel: `${p.recipients}グループに送る`,
        lines: [
          ...p.targets.map((t) => `${t.name} → ${t.groupName}`),
          ...(p.missing.length ? [`グループが見つからない人（送りません）：${p.missing.join('、')}`] : []),
          ...(p.willSkip ? [`もう送ったグループ ${p.willSkip}件は飛ばします`] : []),
        ],
        sends: 'LINE グループに届きます（今の配信画面の「送信」と同じ）。送ったら取り消せません',
        blocked: p.recipients ? undefined : '送り先がありません（全部もう送ってあります）',
        extra: <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-soft px-3 py-2 font-sans text-sm">{p.msg}</pre>,
        run: async () => {
          const r = await postLive<{ sent: number; skipped: number; failed: number }>('/api/live/eigyo', { action: 'caseSend', kNo, names });
          hit(Math.max(1, r.sent));
          toast({ text: `${p.title} を ${r.sent}グループに送りました`, sub: `→ 案件進捗の「送った案件」に載りました（返信待ち）${r.failed ? `・送れなかった ${r.failed}件` : ''}${r.skipped ? `・もう送ってあった ${r.skipped}件` : ''}` });
          onDone?.(r.sent);
        },
      });
    } catch (e) {
      toast({ text: '送れません', sub: (e as Error).message });
    } finally { setBusy(false); }
  }, [busy, hit, toast]);
  const node = spec ? <ConfirmWrite spec={spec} onClose={() => setSpec(null)} /> : null;
  return { open, node, busy };
}
