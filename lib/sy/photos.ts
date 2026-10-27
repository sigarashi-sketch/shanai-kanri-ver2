import 'server-only';
import { createHash } from 'node:crypto';
import { ike, onIkeikeDb } from './db';
import { normName } from './name';

// 要員の顔写真（丸アイコン）。置き場は いけどん本番の roster_avatars 表＋ avatar バケット（いけどん api/avatar.ts と同じ形）。
//   ＝いけどんのコミュニティ画面と 同じ写真を 見る・どちらで 差し替えても 両方に 出る。キーは 正規化氏名（1人1枚・パス固定で upsert）
//   ★Storage のパスに 日本語は 使えない（Invalid key）。氏名の ハッシュを ファイル名に する（どの名前の 写真かは 表の norm_name が持つ）
//   ★バケットは private。名簿を 読むたびに 署名URLを 発行し直す（URLは 保存しない）
const TABLE = 'roster_avatars';
const BUCKET = 'avatar';
const SIGNED_TTL = 60 * 60 * 12;   // 名簿を 開いている 間は 切れない長さ
const MAX_BYTES = 2 * 1024 * 1024;

// 正規化氏名 → 署名URL。読めないときは 空（画面は 頭文字の丸を 出す）
export async function photoUrls(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!onIkeikeDb()) return out;
  const rows: { norm_name: string; storage_path: string }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await ike().from(TABLE).select('norm_name, storage_path').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as { norm_name: string; storage_path: string }[]));
    if (!data || data.length < 1000) break;
  }
  if (!rows.length) return out;
  const { data } = await ike().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_TTL);
  const urlOf = new Map((data || []).filter((s) => s.path && s.signedUrl).map((s) => [s.path as string, s.signedUrl]));
  rows.forEach((r) => { const u = urlOf.get(r.storage_path); if (u) out.set(r.norm_name, u); });
  return out;
}

// 画面で 縮めた JPEG（data URL）を 受けて 差し替える。名乗りは 信じず 先頭バイトで JPEG を 確かめる
export async function savePhoto(name: string, dataUrl: unknown, by: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const nn = normName(name);
  if (!nn) return { ok: false, error: '氏名が空です' };
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  const buf = m ? Buffer.from(m[1], 'base64') : null;
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return { ok: false, error: '画像を読めませんでした（JPEGに変換できない）' };
  if (buf.length > MAX_BYTES) return { ok: false, error: '画像が大きすぎます' };
  const path = 'p/' + createHash('sha256').update(nn).digest('hex').slice(0, 40) + '.jpg';
  const st = ike().storage.from(BUCKET);
  const up = await st.upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (up.error) return { ok: false, error: '写真の保存に失敗しました: ' + up.error.message };
  // 前の 写真が 別のパス（いけどん側で 上げた PNG など）なら 掃除する
  const { data: old } = await ike().from(TABLE).select('storage_path').eq('norm_name', nn).maybeSingle();
  const oldPath = (old as { storage_path?: string } | null)?.storage_path;
  if (oldPath && oldPath !== path) await st.remove([oldPath]);
  const { error } = await ike().from(TABLE).upsert({
    norm_name: nn, name: name.trim(), storage_path: path, mime: 'image/jpeg',
    bytes: buf.length, updated_at: new Date().toISOString(), updated_by: by,
  }, { onConflict: 'norm_name' });
  if (error) return { ok: false, error: error.message };
  const { data } = await st.createSignedUrl(path, SIGNED_TTL);
  return { ok: true, url: data?.signedUrl || '' };
}

export async function deletePhoto(name: string): Promise<{ error?: string }> {
  const nn = normName(name);
  if (!nn) return { error: '氏名が空です' };
  const { data } = await ike().from(TABLE).select('storage_path').eq('norm_name', nn).maybeSingle();
  const path = (data as { storage_path?: string } | null)?.storage_path;
  if (path) await ike().storage.from(BUCKET).remove([path]);
  const { error } = await ike().from(TABLE).delete().eq('norm_name', nn);
  return error ? { error: error.message } : {};
}
