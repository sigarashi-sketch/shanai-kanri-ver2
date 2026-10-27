import { redirect } from 'next/navigation';

// 当日の出勤状況は人事管理へ移した（10-27 shoya「当日の出勤状況 人事にあげて」）。前の行き先（ブックマーク・アラートの知らせ）はこちらへ
export default async function RoumuTodayMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])));
  const q = sp.toString();
  redirect(`/jinji/today${q ? `?${q}` : ''}`);
}
