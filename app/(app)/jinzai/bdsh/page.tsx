'use client';
import { Suspense } from 'react';
import KyouikuAdmin from '@/components/sy/kyouiku/KyouikuAdmin';

// bdsh（教育コンテンツの内勤画面）。10-28 shoya「それゆけ開いちゃってる・ver2 で開けて欲しい」＝それゆけ /kyouiku を中身ごと移した。
//   画面は components/sy/kyouiku（それゆけ components/kyouiku の管理画面の写し）、処理は app/api/sy/s/kyouiku・ccna・course（それゆけ app/api/s の写し・lib/sy）。
//   受講ページ（https://b-dash-app.vercel.app/k/…）・共通の入口・LINE の bdsh ボタンは それゆけのまま
export default function BdshPage() { return <Suspense><KyouikuAdmin /></Suspense>; }
