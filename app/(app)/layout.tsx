import { redirect } from 'next/navigation';
import { Shell } from '@/components/Shell';
import { canUseApp } from '@/lib/access';
import { getViewer } from '@/lib/viewer';

// 未経験事業部の内勤だけが入れる。それ以外は営業共有リストへ（ver2 でも変えない決まり）。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!canUseApp(viewer)) redirect('/shared');
  return <Shell viewer={viewer}>{children}</Shell>;
}
