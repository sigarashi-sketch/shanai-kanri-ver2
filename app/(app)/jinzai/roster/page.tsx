'use client';
import { Suspense } from 'react';
import RosterView from '@/components/sy/RosterView';
// 従業員名簿（それゆけ未経験 /roster から移した・10-27）。タグ・部活・ぼうさん・名簿の詳細（情報・チャット・勤怠）はそれゆけのまま
export default function Page() { return <Suspense><RosterView /></Suspense>; }
