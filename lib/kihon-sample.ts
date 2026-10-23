// 基本情報（人事管理）＝基本情報フォームの回答の一覧。見本データ（本物の名前・数字ではない）。
//   今のシステムの決まり：
//   ・基本情報（basic_info）が正。名簿などと氏名の表記が食い違ったら、基本情報の名前に合わせる
//   ・電話・住所の番地・緊急連絡先などの機微は一覧に出さない（社員ページの詳細だけ）
//   ・健康の欄は専用の置き場だけ。この一覧には「答えたかどうか」も含め中身を出さない
//   ・職種は職歴ごとに7択から選ぶ → 営業の「属性」に自動で入る
export type KState = '未回答' | '回答中' | '回答済み';

export const JOB_KINDS = ['事務', 'エンジニア', '施工管理', 'マーケティング・SNS運用', '翻訳', 'ヘルプデスク（受電）', '営業・コールセンター（架電）'] as const;

export type KihonRow = {
  id: string;
  name: string;          // 基本情報の表記（正）
  otherName?: string;    // 名簿・営業リストでの表記（食い違いがあるときだけ）
  state: KState;
  issued: string;        // フォームを送った日（承諾日）
  step?: string;         // 回答中：どこまで進んだか
  submitted?: string;    // 回答済み：送信日
  station?: string;
  jobs?: string[];       // 職歴の職種（直近から）
  certs?: string;        // 所有資格（無ければ「なし」と答える）
  asked?: string;        // 最後にお願いした日
};

export const KIHON: KihonRow[] = [
  { id: 's0479', name: '小川 陽菜', state: '回答済み', issued: '10/14', submitted: '10/15', station: '武蔵小杉', jobs: ['事務', '営業・コールセンター（架電）'], certs: 'MOS Excel' },
  { id: 's0483', name: '森 拓海', otherName: '森 拓実', state: '回答済み', issued: '10/16', submitted: '10/18', station: '浦和', jobs: ['ヘルプデスク（受電）'], certs: 'なし' },
  { id: 's0486', name: '西村 大輝', state: '回答中', issued: '10/17', step: '職歴（6/15）', asked: '10/20' },
  { id: 's0496', name: '吉田 美咲', state: '未回答', issued: '10/19' },
  { id: 's0491', name: '斉藤 翔', otherName: '齋藤 翔', state: '回答済み', issued: '10/12', submitted: '10/13', station: '大宮', jobs: ['エンジニア'], certs: 'ITパスポート' },
  { id: 's0492', name: '岡田 りん', state: '未回答', issued: '10/21' },
  { id: 's0493', name: '前田 悠真', state: '回答中', issued: '10/18', step: '通勤・勤務条件（11/15）' },
  { id: 's0494', name: '石井 菜々', state: '未回答', issued: '10/15', asked: '10/18' },
  { id: 's0478', name: '井上 さくら', state: '回答済み', issued: '10/02', submitted: '10/03', station: '横浜', jobs: ['施工管理', '事務'], certs: '日商簿記 3級' },
];

// お願いの文面は選ぶだけ（自由に書かせない）。送り先はインフォメーション（LINE公式）
export const ASK_TEMPLATES = [
  { key: 'first', label: 'はじめてのお願い', text: '入社の準備のため、基本情報フォームへの回答をお願いします（10分ほど）' },
  { key: 'remind', label: 'もう一度のお願い', text: '基本情報フォームがまだのようです。お手すきのときに回答をお願いします' },
  { key: 'continue', label: '続きのお願い', text: '基本情報フォームは途中まで保存されています。続きから回答をお願いします' },
] as const;
