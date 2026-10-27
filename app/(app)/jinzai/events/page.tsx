'use client';
import FormsView from '@/components/sy/FormsView';
import { SyLoad } from '@/components/sy/Load';
import type { FormDef } from '@/lib/sy/forms-types';
// イベント出欠（それゆけ未経験 /events から移した・10-27）。フォームの一覧と「一覧を直せるか」はそれゆけの /api/s/forms（id なし）
export default function Page() { return <SyLoad<{ forms: FormDef[]; canEdit: boolean }> path="/api/sy/s/forms">{(d) => <FormsView forms={d.forms} canEdit={d.canEdit} />}</SyLoad>; }
