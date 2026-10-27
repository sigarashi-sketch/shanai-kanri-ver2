'use client';
import EnqueteList from '@/components/sy/enquete/EnqueteList';
import { SyLoad } from '@/components/sy/Load';
import type { EnqForm } from '@/lib/sy/enquete-types';
// アンケート作成（それゆけ未経験 /enquete から移した・10-27）。回答ページ（/f/<id>）はそれゆけ未経験のまま
export default function Page() { return <SyLoad<{ forms: EnqForm[] }> path="/api/sy/s/enquete">{(d) => <EnqueteList initial={d.forms} />}</SyLoad>; }
