import { redirect } from 'next/navigation';

// シフト表は人事管理へ移した（10-27 shoya「シフト表も人事側に移して」）。前の行き先（ブックマーク・アラートの知らせ）はこちらへ
export default async function RoumuShiftMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])));
  const q = sp.toString();
  redirect(`/jinji/shift${q ? `?${q}` : ''}`);
}
