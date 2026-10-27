import { redirect } from 'next/navigation';

// 欠勤管理は 人事管理「当日の出勤状況」のタブへ移した（10-27 shoya）。前の行き先はこちらへ
export default function RoumuKekkinMoved() {
  redirect('/jinji/today?tab=kekkin');
}
