// 保留の画面の上に出す一言（いつものメニューに入れるかはあとで決める）
export function HoryuNote({ from }: { from: string }) {
  return (
    <div className="rounded-xl border border-line bg-soft px-4 py-2.5 text-sm text-muted">
      保留（あとで決める）の画面です。今の社内システムの「{from}」を写したもので、ver2 のどこに置くか・出すかはあとで決めます。
    </div>
  );
}
