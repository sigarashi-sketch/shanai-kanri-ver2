'use client';

import { useState, type MouseEvent } from 'react';
import { Copy, ExternalLink, FileSpreadsheet, FileText } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import type { SukishiFileUrls } from '@/lib/live/eigyo-common';

// スキルシートのファイル（本名版／イニシャル版 × PDF／Excel）＝今の proper.html の PDF 列（pdfCellHtml）と同じ。
//   ・それぞれ「閲覧」（Drive の /view）と「DL」（uc?export=download）。★本名版はドライブの共有しだいで他の人は開けないことがある
//   ・スキシ（スプレッドシート）がある行だけ「PDF出力」「Excel出力」＝今の genPdf / genXlsx と同じ（POST /api/skillsheet・URL は変わらない）
//   ・できるファイルの中身は今のシステムが作る＝ver2 では何も変えない。Google スプレッドシートをブラウザで印刷すると
//     メニューや行番号まで入って右が切れるので、客先に出すのはここの PDF（イニシャル版）を使う
export type { SukishiFileUrls };

export function driveDl(url: string): string {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}
const isUrl = (x?: string) => !!x && /^https?:\/\//.test(x);

/** 絞り込み・並べ替え用の文字（今の proper.html と同じ「PDFあり / Excelなし」） */
export function sukishiFilesText(f: SukishiFileUrls): string {
  return `${isUrl(f.pdfUrl) ? 'PDFあり' : 'PDFなし'} / ${isUrl(f.xlsxUrl) ? 'Excelあり' : 'Excelなし'}`;
}

export function SukishiFiles({ files, row, name, canMake, live = true, size = 'sm', onMade }: {
  files: SukishiFileUrls; row?: string; name?: string;
  canMake: boolean;          // スキシ（スプレッドシート）がある＝出力できる
  live?: boolean; size?: 'sm' | 'md'; onMade?: () => unknown;
}) {
  const canEdit = usePerms().can('eigyo', 'edit') && live;
  const { hit, toast } = useMotivation();
  const [made, setMade] = useState<SukishiFileUrls>({});
  const [busy, setBusy] = useState<'' | 'pdf' | 'xlsx'>('');
  const f = { ...files, ...made };

  const make = async (kind: 'pdf' | 'xlsx') => {
    if (!row || busy) return;
    const label = kind === 'pdf' ? 'PDF' : 'Excel';
    setBusy(kind);
    try {
      const r = await fetch('/api/live/proper-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, kind }) });
      const j = (await r.json().catch(() => ({}))) as SukishiFileUrls & { ok?: boolean; error?: string; warning?: string };
      const got = kind === 'pdf' ? j.pdfUrl || j.pdfAnonUrl : j.xlsxUrl || j.xlsxAnonUrl;
      if (!r.ok || !j.ok || !got) toast({ text: `${name ? `${name}：` : ''}${label}を出せませんでした`, sub: j.error || `（${r.status}）` });
      else {
        setMade((m) => ({ ...m, ...(kind === 'pdf' ? { pdfUrl: j.pdfUrl || m.pdfUrl, pdfAnonUrl: j.pdfAnonUrl || m.pdfAnonUrl } : { xlsxUrl: j.xlsxUrl || m.xlsxUrl, xlsxAnonUrl: j.xlsxAnonUrl || m.xlsxAnonUrl }) }));
        hit();
        toast({ text: `${name ? `${name}：` : ''}${label}を出力しました`, sub: j.warning || '→ 本名版・イニシャル版（URL はそのまま）' });
        await onMade?.();
      }
    } catch (e) { toast({ text: `${label}を出せませんでした`, sub: (e as Error).message }); }
    finally { setBusy(''); }
  };

  const text = size === 'md' ? 'text-body' : 'text-sm';
  const one = (label: string, url?: string) => (
    <div key={label} className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="min-w-[72px] text-faint">{label}</span>
      {isUrl(url) ? <>
        <a href={url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="別窓で閲覧" className="underline" style={{ color: 'var(--ad)' }}>閲覧</a>
        <span className="text-faint">/</span>
        <a href={driveDl(url!)} onClick={(e) => e.stopPropagation()} title="ダウンロード" className="underline" style={{ color: 'var(--ad)' }}>DL</a>
        <CopyBtn text={url!} what={`${name ? `${name}の` : ''}${label.replace(/\s+/g, '')}の URL`} />
      </> : <span className="text-faint">—</span>}
    </div>
  );
  const btn = 'inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold disabled:opacity-40';
  return (
    <div className={`flex flex-col gap-0.5 ${text}`}>
      {one('PDF 本名', f.pdfUrl)}
      {one('PDF ｲﾆｼｬﾙ', f.pdfAnonUrl)}
      <div className="h-0.5" />
      {one('XLS 本名', f.xlsxUrl)}
      {one('XLS ｲﾆｼｬﾙ', f.xlsxAnonUrl)}
      {row && (canMake ? (
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" disabled={!canEdit || !!busy} title={canEdit ? 'いまのスキシの中身で 本名版・イニシャル版の PDF を作り直す（URL は変わりません）' : needText('edit')} onClick={(e) => { e.stopPropagation(); make('pdf'); }} className={btn}>
            <FileText size={12} />{busy === 'pdf' ? '出力中…' : 'PDF出力'}</button>
          <button type="button" disabled={!canEdit || !!busy} title={canEdit ? 'いまのスキシの中身で 本名版・イニシャル版の Excel(xlsx) を作る（URL は変わりません）' : needText('edit')} onClick={(e) => { e.stopPropagation(); make('xlsx'); }} className={btn}>
            <FileSpreadsheet size={12} />{busy === 'xlsx' ? '出力中…' : 'Excel出力'}</button>
        </div>
      ) : <span className="mt-0.5 text-xs text-faint" title="先にスキシ（スキルシート）を作ると出力できます">出力不可（スキシ未作成）</span>)}
    </div>
  );
}

// ---- コピー・スキシ単体の URL・プレビュー（10-28 shoya「サマリコピー」「スキシのプレビューを右側に」「スキシ単体URLをコピーか新規タブで」）----

/** 押すと text をコピーする小さいボタン（行の中に置くので 押しても行は開かない） */
export function CopyBtn({ text, what, label, className = '' }: { text: string; what: string; label?: string; className?: string }) {
  const { toast } = useMotivation();
  const [ok, setOk] = useState(false);
  const copy = async (e: MouseEvent) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); toast({ text: `${what}をコピーしました` }); }
    catch { window.prompt('コピーしてください', text); }
  };
  return (
    <button type="button" disabled={!text} onClick={copy} title={`${what}をコピー`} aria-label={`${what}をコピー`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md text-faint hover:text-ink disabled:opacity-40 ${label ? 'min-h-7 border border-field bg-surface px-2 text-xs font-semibold text-ink' : 'size-6 justify-center'} ${className}`}>
      <Copy size={label ? 12 : 13} style={ok ? { color: 'var(--color-ok)' } : undefined} />{label && (ok ? 'コピーしました' : label)}
    </button>
  );
}

/** スキシ（スプレッドシート）単体の URL：コピー／新しいタブで開く */
export function SukishiLinks({ url, name, compact = false }: { url: string; name?: string; compact?: boolean }) {
  if (!isUrl(url)) return null;
  const what = `${name ? `${name}の` : ''}スキシの URL`;
  if (compact) return (
    <span className="inline-flex items-center gap-0.5">
      <a href={url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="スキシを新しいタブで開く" aria-label="スキシを新しいタブで開く" className="inline-flex size-6 items-center justify-center rounded-md text-faint hover:text-ink"><ExternalLink size={13} /></a>
      <CopyBtn text={url} what={what} />
    </span>
  );
  const btn = 'inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold';
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="min-w-0 flex-1 truncate text-sm text-faint" title={url}>{url}</span>
      <CopyBtn text={url} what={what} label="URLをコピー" />
      <a href={url} target="_blank" rel="noopener" className={btn}><ExternalLink size={12} />新しいタブで開く</a>
    </div>
  );
}

const driveId = (url?: string) => (url && (url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/))?.[1]) || '';
type PvKey = 'pdfAnon' | 'pdf' | 'sheet';
const PV_LABEL: Record<PvKey, string> = { pdfAnon: 'PDF イニシャル', pdf: 'PDF 本名', sheet: 'スプレッドシート' };

/** スキシのプレビュー（Google の埋め込み表示）。客先に出す PDF イニシャル版を先に、無ければ本名版・スプレッドシート。
 *  ★見えるかどうかは ドライブの共有しだい（ログイン中の Google アカウントで開けないと「アクセス権が必要」と出る） */
export function SukishiPreview({ files, sheetUrl, className = '' }: { files: SukishiFileUrls; sheetUrl?: string; className?: string }) {
  const src: Partial<Record<PvKey, string>> = {};
  const a = driveId(files.pdfAnonUrl), b = driveId(files.pdfUrl), c = isUrl(sheetUrl) ? sheetUrl!.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] : '';
  if (a) src.pdfAnon = `https://drive.google.com/file/d/${a}/preview`;
  if (b) src.pdf = `https://drive.google.com/file/d/${b}/preview`;
  if (c) src.sheet = `https://docs.google.com/spreadsheets/d/${c}/preview`;
  const keys = (Object.keys(PV_LABEL) as PvKey[]).filter((k) => src[k]);
  const [pick, setPick] = useState<PvKey | null>(null);
  const k = pick && src[pick] ? pick : keys[0];
  if (!k) return <div className={`flex items-center justify-center rounded-[10px] bg-soft px-4 py-8 text-center text-sm text-muted ${className}`}>プレビューできるスキシがまだありません（スキシを作って PDF 出力すると ここに出ます）</div>;
  return (
    <div className={`flex min-h-0 flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-1">
        {keys.map((x) => <button key={x} type="button" onClick={() => setPick(x)} aria-pressed={x === k} className="chip" style={x === k ? { background: 'var(--a)', color: 'var(--ao)' } : undefined}>{PV_LABEL[x]}</button>)}
        <a href={src[k]!.replace(/\/preview$/, k === 'sheet' ? '/edit' : '/view')} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs text-faint hover:text-ink"><ExternalLink size={12} />大きく開く</a>
      </div>
      <iframe key={src[k]} src={src[k]} title={`スキシのプレビュー（${PV_LABEL[k]}）`} className="min-h-[420px] w-full flex-1 rounded-[10px] border border-line bg-white" />
    </div>
  );
}
