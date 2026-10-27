import 'server-only';
import { createHmac } from 'node:crypto';

// 名乗りフォームのURLに入れる合言葉。userId を HMAC で署名して、他人の userId を勝手に名乗れないようにする。
const sig = (uid: string) => createHmac('sha256', String(process.env.SESSION_SECRET)).update('claim:' + uid).digest('base64url').slice(0, 22);
export function claimToken(uid: string) { return Buffer.from(uid).toString('base64url') + '.' + sig(uid); }
export function readClaimToken(t: string): string | null {
  const [b, s] = String(t || '').split('.');
  if (!b || !s) return null;
  const uid = Buffer.from(b, 'base64url').toString();
  return /^U[0-9a-f]{32}$/.test(uid) && sig(uid) === s ? uid : null;
}
export function claimUrl(uid: string) { return `${String(process.env.PUBLIC_APP_URL || 'https://saiyou-app.vercel.app').replace(/\/$/, '')}/n/${claimToken(uid)}`; }

// 名乗りのお願い文（友だち追加直後／未登録の人から初めてメッセージが来たとき、1人1回だけ）
export function claimAskText(uid: string) {
  return `ご登録ありがとうございます！\n担当者とのやりとりをスムーズにするため、お手数ですが下のリンクからお名前の登録をお願いします（30秒ほどで終わります）。\n\n${claimUrl(uid)}`;
}
