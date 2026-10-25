import { redirect } from 'next/navigation';

// スキルシート作成は営業に移した（10-25 shoya）。古いリンク・ブックマーク用。
export default async function SkillsheetMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? `?q=${encodeURIComponent(sp.q)}` : '';
  redirect(`/eigyo/skillsheet${q}`);
}
