'use client';
import { Suspense } from 'react';
import ChatView from '@/components/sy/ChatView';
// チャット（公式LINE「インフォメーション」の 1:1・それゆけ未経験 /chat から移した・10-27）
// それゆけでは画面いっぱいの枠の中に置いていた（h-full）。ver2 では上のバー（58px）を除いた高さを与える
export default function Page() { return <div style={{ height: "calc(100vh - 58px)" }}><Suspense><ChatView /></Suspense></div>; }
