'use client';

import { useEffect, useState } from 'react';

// Google ログインから戻ってくるところ。#access_token を受け取ってサーバに覚えさせ、スキルシート作成へ戻る。
export default function AuthCallback() {
  const [msg, setMsg] = useState('ログインしています…');
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    const access_token = h.get('access_token');
    history.replaceState(null, '', window.location.pathname);   // トークンを URL に残さない
    if (!access_token) { setMsg(h.get('error_description') || 'ログインできませんでした'); return; }
    fetch('/api/ike-auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token, refresh_token: h.get('refresh_token') || '', expires_in: Number(h.get('expires_in')) || 3600 }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string }) => { if (j.ok) window.location.replace('/'); else setMsg(j.error || 'ログインできませんでした'); })
      .catch(() => setMsg('ログインできませんでした'));
  }, []);
  return <main className="grid min-h-screen place-items-center bg-soft text-body text-muted"><div>{msg} <a href="/" className="ml-2 font-semibold underline">戻る</a></div></main>;
}
