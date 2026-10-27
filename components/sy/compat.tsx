'use client';

// 人財管理（それゆけ未経験から移した画面・10-27）が使う、それゆけの道具の ver2 版。
//   画面のコードはそれゆけの写し（components/sy/*）。データはそれゆけの API を /api/sy/ 経由で読む（app/api/sy）。
//   ・fx（動き・お知らせ）→ ver2 のお知らせ（SyFxHost が受けて useMotivation の toast・hit に渡す）
//   ・useKept → この画面のあいだだけ覚える（再読み込みでは戻さない）
//   ・MemberDrawer（それゆけの名簿の詳細）→ ver2 の「この人の情報」（PersonName と同じ）を開く
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useMotivation } from '@/components/Motivation';
import type { MendanKind } from '@/lib/sy/teiki-types';

const emit = (detail: { kind: 'toast' | 'hit'; text?: string; type?: string }) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sy:fx', { detail })); };
export const fx = {
  toast(msg: string, type: 'ok' | 'err' | 'info' = 'ok') { emit({ kind: 'toast', text: msg, type }); },
  flash(_el?: Element | null, _kind?: 'ok' | 'err') { void _el; void _kind; },
  celebrate(_el?: Element | null) { void _el; },
  shake(_el?: Element | null) { void _el; },
  reveal(_el?: Element | null, _limit?: number) { void _el; void _limit; },
  countUp(_el?: Element | null, _to?: number) { void _el; void _to; },
  fanfare(o: { title: string; name?: string; sub?: string; gold?: boolean }) { emit({ kind: 'toast', text: [o.title, o.name].filter(Boolean).join(' ') }); },
  hit(_kind: string) { void _kind; emit({ kind: 'hit' }); },
};

/** 人財管理の画面に1つ置く（app/(app)/jinzai/layout.tsx）。fx のお知らせを ver2 のお知らせに出す */
export function SyFxHost() {
  const { hit, toast } = useMotivation();
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ kind: string; text?: string; type?: string }>).detail;
      if (d.kind === 'hit') hit();
      else if (d.text) toast({ text: d.text, sub: d.type === 'err' ? 'うまくいきませんでした' : undefined });
    };
    window.addEventListener('sy:fx', on);
    return () => window.removeEventListener('sy:fx', on);
  }, [hit, toast]);
  return null;
}

export function useKept<T>(_name: string, init: T, _skip = false): [T, Dispatch<SetStateAction<T>>] {
  void _name; void _skip;
  return useState<T>(init);
}

export function MemberDrawer({ m, onClose }: { m: { name: string }; onClose: () => void; onPatch?: (p: Partial<Member>) => void; [k: string]: unknown }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('person:open', { detail: { name: m.name } }));
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.name]);
  return null;
}

// ---- それゆけのサーバの型（写し。中身はそれゆけ lib/roster.ts・lib/db.ts・lib/member-activity.ts） ----
export interface Member {
  key: string; kind: 'employee' | 'candidate';
  name: string; kana: string; status: string;
  stage?: string; properStatus?: string;
  recruitTantou: string; salesTantou: string; company: string;
  nyusha: string; siteEki: string; homeEki: string;
  community: string; clubs: string[];
  start: string; end: string; tanka: string; lineGroup: string; provisional: boolean;
  gender: string; age: string; address: string; shikaku: string; caseSummary: string;
  lineIn: string; lineLinked: boolean;
  surveyTodo?: boolean; leader?: boolean; tags: string[]; bousan?: boolean; photo?: string;
}
export interface ProperLite { key: string; name: string; kana: string; status: string; from: 'proper' | 'ledger' }
export interface Memo {
  id: string; subject_key: string; name: string; kind: string; label: string; body: string; fields: Record<string, string>;
  actor_email: string; actor_name: string; created_at: string;
}
export interface SurveyAns { month: string; at: string }
export interface MemberBase {
  survey: SurveyAns[] | null; surveyLatest: string;
  mendan: Record<MendanKind, string[]> | null;
  surveyMonths: string[]; mendanFrom: string;
  mendanLog: { id: string; memoId: string; at: string; kind: MendanKind; label: string; by: string; body: string; details: { k: string; v: string }[] }[];
  warnings: string[];
}
