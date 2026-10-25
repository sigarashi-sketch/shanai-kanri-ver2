import { IKE_ORIGIN } from '@/lib/ike';
import { ClientLinks } from './ClientLinks';

// 客先向けリンク（保留）。客先に渡す URL は今の社内システムの客先の画面（/client.html#k=…）なので、その置き場所をサーバーから渡す
export default function Page() {
  return <ClientLinks origin={IKE_ORIGIN} />;
}
