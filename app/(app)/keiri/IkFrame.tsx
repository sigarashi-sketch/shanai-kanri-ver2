import { ikeToken } from '@/lib/ike';

// 今の社内システムの画面（/ik/…）を ver2 の外枠の中にそのまま出す。高さは上のバー（58px）を除いた画面いっぱい。
//   ★データ・計算・見た目は今の画面のまま（ver2 では作り直さない）。保存は今の段階では止めてある（app/ik/api）
export async function IkFrame({ src, title }: { src: string; title: string }) {
  if (!(await ikeToken())) {
    return (
      <div className="flex min-h-[calc(100vh-58px)] flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-md font-semibold">ログインしてください</div>
        <div className="text-body text-muted">{title}は今の社内システムのデータをそのまま出します。ログインすると開けます。</div>
        <a href="/api/ike-auth/start" className="rounded-lg border border-line px-4 py-2 text-body">会社のアカウントでログイン</a>
      </div>
    );
  }
  return <iframe src={src} title={title} className="block w-full border-0" style={{ height: 'calc(100vh - 58px)' }} />;
}
