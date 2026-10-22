import 'server-only';
import { cookies } from 'next/headers';
import { DEV_VIEWERS, VIEWER_COOKIE, type Viewer } from './access';

/** いまの人。ログインをつなぐまでは cookie の切り替え（既定は内勤）。 */
export async function getViewer(): Promise<Viewer> {
  const k = (await cookies()).get(VIEWER_COOKIE)?.value;
  return DEV_VIEWERS[k || 'naikin'] ?? DEV_VIEWERS.naikin;
}
