'use client';

import { useEffect } from 'react';

// 画面の不具合を拾って残す（10-30 shoya「不具合多すぎ・モニタリングして直して」）。置き場は /api/live/client-error → saiyou.v2_client_errors。
//   拾うもの：JS のエラー・取りこぼした Promise の失敗・ver2 の口（/api/…）の 5xx と つながらなかったとき（押しても書き込みが通らない の多くはこれ）
//   ・同じものは この画面を開いている間 1回だけ送る。送るのに失敗しても 何もしない（記録のせいで画面を止めない）
//   ・送るのは 場所・エラーの文・口の path（クエリなし）と状態コードだけ。入力した値・本文は送らない
const sent = new Set<string>();
let installed = false;

export function reportClientError(kind: 'js' | 'promise' | 'render' | 'api', message: string, detail = '') {
  if (typeof window === 'undefined') return;
  const page = location.pathname;
  const key = `${kind}|${page}|${message}`;
  if (sent.has(key) || sent.size > 50) return;
  sent.add(key);
  try {
    void origFetch()('/api/live/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, page, message: message.slice(0, 500), detail: detail.slice(0, 1500) }), keepalive: true }).catch(() => {});
  } catch { /* 送れなくてもよい */ }
}

let _orig: typeof fetch | null = null;
const origFetch = () => _orig ?? window.fetch.bind(window);

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e) => {
    if (!e.message || /ResizeObserver loop/.test(e.message)) return; // ブラウザの無害な知らせ
    reportClientError('js', e.message, `${e.filename || ''}:${e.lineno || ''} ${(e.error as Error | undefined)?.stack?.split('\n').slice(0, 4).join(' / ') || ''}`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as Error | string | undefined;
    const msg = typeof r === 'string' ? r : r?.message || String(r);
    if (/AbortError|The user aborted|Load failed|Failed to fetch/.test(msg)) return; // 画面を離れた・電波（下の api で拾う）
    reportClientError('promise', msg, (typeof r === 'object' && r?.stack?.split('\n').slice(0, 4).join(' / ')) || '');
  });
  _orig = window.fetch.bind(window);
  const before = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let path = '';
    try { const u = new URL(url, location.href); if (u.origin === location.origin && u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/live/client-error')) path = u.pathname; } catch { /* 外の URL */ }
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    try {
      const res = await before(input, init);
      if (path && res.status >= 500) {
        let msg = '';
        try { const j = (await res.clone().json()) as { error?: unknown }; msg = typeof j.error === 'string' ? j.error : (j.error as { message?: string } | undefined)?.message || ''; } catch { /* JSON でない */ }
        reportClientError('api', `${method} ${path} ${res.status}`, msg.slice(0, 300));
      }
      return res;
    } catch (e) {
      if (path && navigator.onLine && (e as Error).name !== 'AbortError') reportClientError('api', `${method} ${path} つながらない`, (e as Error).message);
      throw e;
    }
  };
}

/** Shell に1つ置く */
export function ErrorWatch() {
  useEffect(() => { install(); }, []);
  return null;
}
