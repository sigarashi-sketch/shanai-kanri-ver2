// 採用（承諾者・面談）の見本データ。本物の名前ではない。
//   承諾の日時は「承諾の記録（shoudaku_bi 相当）」が正。名簿の作成日は移行でずれているので使わない。
//   氏名は基本情報フォームの名前が正。同姓同名は実在する → 応募IDで見分ける（採用担当・最寄駅も添える）。
//   今のシステムの「承諾者一覧」シートには書き戻さない（下の方は式で展開された行で、1セル書くと全部消える）。
export type FollowState = '未設定' | '予定あり' | '日程調整中' | '済み';
export type Acceptor = {
  appId: string; name: string; recruiter: string; station: string;
  norm?: string; // 本物のときだけ：名前のキー（normName）。兆しの材料と当てるのに使う
  acceptedAt: string; joinDate: string | null;
  lastReplyDays: number; // 本人の最後の返信から何日
  reschedules: number; // フォロー面談のリスケ回数
  formDone: boolean; // 基本情報フォームに答えたか
  words: string[]; // 面談メモ・トークの気になる言葉（本文は出さない）
  follow: FollowState; followAt?: string; followBy?: string;
};

export const ACCEPTORS: Acceptor[] = [
  { appId: '応募 #10231', name: '佐藤 翔', recruiter: '中村', station: '川口', acceptedAt: '2026-10-14', joinDate: '2026-11-01', lastReplyDays: 6, reschedules: 2, formDone: false, words: ['他社の選考'], follow: '日程調整中' },
  { appId: '応募 #10288', name: '佐藤 翔', recruiter: '田中', station: '町田', acceptedAt: '2026-10-18', joinDate: '2026-11-01', lastReplyDays: 0, reschedules: 0, formDone: true, words: [], follow: '予定あり', followAt: '10/27 18:00', followBy: '田中' },
  { appId: '応募 #10240', name: '木村 七海', recruiter: '田中', station: '大宮', acceptedAt: '2026-10-09', joinDate: null, lastReplyDays: 4, reschedules: 0, formDone: true, words: ['家族に反対'], follow: '未設定' },
  { appId: '応募 #10255', name: '石井 拓海', recruiter: '中村', station: '蒲田', acceptedAt: '2026-10-16', joinDate: '2026-11-16', lastReplyDays: 1, reschedules: 0, formDone: false, words: [], follow: '未設定' },
  { appId: '応募 #10262', name: '林 美咲', recruiter: '中村', station: '浦和', acceptedAt: '2026-10-20', joinDate: '2026-11-01', lastReplyDays: 0, reschedules: 0, formDone: true, words: [], follow: '済み', followAt: '10/22 12:00', followBy: '中村' },
  { appId: '応募 #10270', name: '清水 大和', recruiter: '田中', station: '千葉', acceptedAt: '2026-10-11', joinDate: '2026-12-01', lastReplyDays: 9, reschedules: 1, formDone: false, words: [], follow: '未設定' },
];

export const FOLLOW_BY = ['中村', '田中', '吉村'];
export const SLOTS = ['10/26 12:00', '10/26 18:00', '10/27 12:00', '10/27 19:00', '10/28 18:00'];
