import { redirect } from 'next/navigation';

// 人財管理へ移した（10-27 shoya）。前の行き先はこちらへ
export default async function Moved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v != null ? [[k, v]] : [])));
  const q = sp.toString();
  redirect(`/jinzai/rishoku${q ? `?${q}` : ''}`);
}
