'use client';

import { useEffect, useState } from 'react';

// 日報の締め（10-27 shoya「ver2 も18時になったら強制で日報出現させて」＝今のシステムの auth-guard.js と同じ決まり）。
//   平日18時（日本時間）を過ぎて、その日の成約日報をまだ出していない「日報を書く人」は、どの画面を開いても 成約日報（?must=1）へ寄せる。
//   日報を書く人か・出したかは 今のシステムの /api/nippo?action=due が決める（/ik/api で中継・読むだけ）
//   ★開きっぱなしの画面も 5分おき／タブに戻ったときに見直す。日報の画面（iframe）が出し終わって ike_nippo_due を書いたら すぐ外す
//   ★出した・書く人ではない、はその日のうちは端末に覚えて聞き直さない（キーと形は今の auth-guard.js・nippo.html と同じ ike_nippo_due）
//   ★分からないとき（通信不良・API の失敗）は寄せない＝画面を止めない側に倒す
//   ★iframe の中の auth-guard.js の寄せは止めてある（app/ik/embed.ts rewriteAsset・中で寄せると日報の画面が開き直しを繰り返すため）
export const NIPPO_HREF = '/eigyo/nippo';
const KEY = 'ike_nippo_due';

const jst = () => { const d = new Date(Date.now() + 9 * 3600000); return { ymd: d.toISOString().slice(0, 10), h: d.getUTCHours(), dow: d.getUTCDay() }; };

export function useNippoMust(email: string, enabled: boolean): boolean {
  const [must, setMust] = useState(false);
  useEffect(() => {
    if (!enabled) { setMust(false); return; }
    let busy = false, alive = true;
    const check = () => {
      const t = jst();
      if (t.h < 18 || t.dow < 1 || t.dow > 5) { setMust(false); return; }
      let c: { d?: string; u?: string } | null = null;
      try { c = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { c = null; }
      if (c && c.d === t.ymd && (!c.u || c.u === email)) { setMust(false); return; }
      if (busy || document.hidden) return;
      let as = '';
      try { as = localStorage.getItem('nippoAs') || ''; } catch { /* noop */ }
      busy = true;
      fetch('/ik/api/nippo?action=due' + (as ? '&as=' + encodeURIComponent(as) : ''), { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.status === 403 ? { ok: true, due: false, why: 'denied' } : r.json()))
        .then((d: { ok?: boolean; due?: boolean; why?: string; today?: string }) => {
          if (!alive || !d || d.ok === false) return;
          setMust(d.due === true);
          if (d.due !== true && ['done', 'not_reporter', 'denied', 'exempt'].includes(d.why || '')) {
            try { localStorage.setItem(KEY, JSON.stringify({ d: d.today || t.ymd, u: email, s: d.why })); } catch { /* noop */ }
          }
        })
        .catch(() => { /* 分からないときは寄せない */ })
        .finally(() => { busy = false; });
    };
    check();
    const iv = window.setInterval(check, 5 * 60 * 1000);
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) check(); };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('storage', onStorage);
    return () => { alive = false; window.clearInterval(iv); document.removeEventListener('visibilitychange', check); window.removeEventListener('storage', onStorage); };
  }, [email, enabled]);
  return must;
}
