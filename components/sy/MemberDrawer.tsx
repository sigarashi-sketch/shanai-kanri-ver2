'use client';
import { useEffect, useState } from 'react';
import type { Member } from '@/components/sy/compat';
import { Clock, MessageCircle, NotebookPen, X } from 'lucide-react';
import MemberChat from '@/components/sy/MemberChat';
import MemberInfo from '@/components/sy/MemberInfo';
import MemberKintai from '@/components/sy/MemberKintai';
import type { Club } from '@/components/sy/useRoster';
import { Avatar, StageBadge } from '@/components/sy/ui';

// leader＝この人がコミュニティのリーダーか（定期面談ページが渡す。渡されない画面では コミュニティ名＝氏名 で見分ける）
// top＝「情報」タブのいちばん上に 開いた画面が差し込むもの（月次アンケートの「文章を送る」。ほかの画面は渡さない）
export default function MemberDrawer({ m, clubs, onClose, onPatch, leader, top }: {
  m: Member; clubs: Club[]; onClose: () => void; onPatch: (p: Partial<Member>) => void; leader?: boolean; top?: React.ReactNode;
}) {
  // 「チャット」＝この人の公式LINEとのトーク（MemberChat）／「勤怠」＝freee の月ごとの勤怠実績（MemberKintai・従業員だけ）
  const [tabRaw, setTab] = useState<'info' | 'chat' | 'kintai'>('info');
  const isCand = m.kind === 'candidate';
  const tab = isCand && tabRaw === 'kintai' ? 'info' : tabRaw;
  const tabs = [['info', '情報', NotebookPen], ['chat', 'チャット', MessageCircle], ...(isCand ? [] : [['kintai', '勤怠', Clock] as const])] as const;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="ig-scrim absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="ig-drawer relative flex h-full w-full max-w-xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ig-divider px-4 h-12">
          <span className="text-xs text-ig-muted">{isCand ? '候補者（それゆけ未経験だけに登録）' : 'いけいけどんどんの従業員名簿（見るだけ）'}</span>
          <button onClick={onClose} className="rounded px-2 py-1 text-ig-muted hover:bg-ig-hover" aria-label="閉じる"><X size={20} strokeWidth={1.75} /></button>
        </div>
        <div className="flex shrink-0 border-b border-ig-divider text-sm">
          {tabs.map(([k, label, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 font-semibold ${tab === k ? 'border-ig-text text-ig-text' : 'border-transparent text-ig-muted hover:text-ig-text'}`}><I size={15} strokeWidth={2} />{label}</button>
          ))}
        </div>
        {tab === 'chat' && (
          <>
            <div className="flex shrink-0 items-center gap-3 border-b border-ig-divider px-4 py-2">
              <Avatar name={m.name} src={m.photo} size="sm" />
              <span className="min-w-0 truncate font-semibold">{m.name}</span><StageBadge stage={m.status} />
            </div>
            <MemberChat key={m.key} m={m} />
          </>
        )}
        {tab === 'kintai' && <div className="flex-1 overflow-y-auto"><MemberKintai key={m.key} m={m} /></div>}
        <div className={tab === 'info' ? 'flex-1 overflow-y-auto' : 'hidden'}>
          {top}
          <MemberInfo key={m.key} m={m} clubs={clubs} onPatch={onPatch} leader={leader} />
        </div>
      </div>
    </div>
  );
}
