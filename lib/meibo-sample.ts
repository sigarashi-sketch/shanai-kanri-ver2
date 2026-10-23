// 従業員名簿の「部門ごとの表示」の見本データ（本物の名前・数字ではない）。PEOPLE の id ごと。
//   2026-10-23 shoya「従業員名簿みたいな感じにしてそこにいろいろ載せたい。労務版・法務版・経理版みたいに、それぞれのロールで必要な情報」
//   「シフトは別タブでもいい」。出どころは今のシステムで拾えているもの（名簿・稼働管理一覧・日報②・freee・ミンミカ・案件ストック・請求書づくり）。
//   健康状況・マイナンバーは載せない（要配慮・freee 側で持つ）。

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';
export type Mark = { text: string; tone: Tone; sub?: string };

// ---- 労務 ----
export type Roumu = {
  koyou: '正社員' | '契約社員';
  nyusha: string;            // 入社日
  shotei: string;            // 所定の勤務時間
  overtime?: Mark;           // 締め日の残業見込み（36協定）
  yukyu: Mark;               // 有給の残り・年5日の進み
  shinya?: Mark;             // 深夜業の健康診断（夜勤がある人だけ）
  shaho: Mark;               // 社会保険・雇用保険
  tetsuzuki?: Mark;          // いま動いている手続き（待機→休業手当・退社予約→喪失届 など）
};
// ---- 法務 ----
export type Houmu = {
  torihiki: string;          // 契約の相手（取引先）
  shouryu?: Mark;            // 商流（何次）。多重の疑いは印だけ
  kihon: Mark;               // 基本契約
  kobetsu: Mark;             // 個別契約・注文書
  shiki?: Mark;              // 準委任なのに客先の指示らしき記載（疑いの印だけ・判断は法務）
  haken?: Mark;              // 派遣：抵触日・派遣先への通知
  koyouKeiyaku: Mark;        // 労働条件通知書 兼 雇用契約書（電子契約）
  seiyaku: Mark;             // 誓約書・秘密保持
};
// ---- 経理 ----
export type Keiri = {
  seikyusaki: string;        // 請求先
  tanka: string;             // 単価
  seisan: string;            // 精算の幅
  site: string;              // 締め・支払
  hours?: Mark;              // 今月の稼働見込み（精算の幅に対して）
  kinmuhyo?: Mark;           // 勤務表の届き具合
  seikyu?: Mark;             // 請求書
  chingin: string;           // 賃金（額面月給）
  kotsuhi: string;           // 交通費（月額）
  arari?: string;            // 粗利（月）
};

export const ROUMU: Record<string, Roumu> = {
  s0412: { koyou: '正社員', nyusha: '2025/04/01', shotei: '9:00〜18:00（休憩1h）', overtime: { text: '17h 見込み', tone: 'ok' }, yukyu: { text: '残7日', tone: 'ok', sub: '年5日 4/5' }, shaho: { text: '加入済み', tone: 'ok' }, tetsuzuki: { text: '現場の変更 10/26', tone: 'info', sub: '通勤手当の変更' } },
  s0388: { koyou: '正社員', nyusha: '2024/10/01', shotei: '9:00〜18:00（休憩1h）', overtime: { text: '48h 見込み', tone: 'bad', sub: '45h超 今年5回目' }, yukyu: { text: '残4日', tone: 'warn', sub: '年5日 2/5・期限 12/31' }, shaho: { text: '加入済み', tone: 'ok' }, tetsuzuki: { text: '派遣契約 11/30 終了', tone: 'warn', sub: '更新の意向 未確認' } },
  s0441: { koyou: '正社員', nyusha: '2025/07/01', shotei: '9:00〜18:00（休憩1h）', yukyu: { text: '残10日', tone: 'ok', sub: '年5日 1/5' }, shaho: { text: '加入済み', tone: 'ok' }, tetsuzuki: { text: '待機 12日目', tone: 'bad', sub: '休業手当の判断（60%以上）' } },
  s0302: { koyou: '正社員', nyusha: '2023/04/01', shotei: '9:00〜18:00（休憩1h）', overtime: { text: '22h 見込み', tone: 'ok' }, yukyu: { text: '残12日', tone: 'ok', sub: '年5日 5/5 済' }, shinya: { text: '次回 11/15', tone: 'warn', sub: '深夜業 6か月ごと' }, shaho: { text: '加入済み', tone: 'ok' } },
  s0455: { koyou: '正社員', nyusha: '2025/11/01', shotei: '9:30〜18:30（休憩1h）', yukyu: { text: '付与前', tone: 'mute', sub: '2026/05/01 付与' }, shaho: { text: '手続き中', tone: 'warn', sub: '資格取得届 11/5 まで' }, tetsuzuki: { text: '入社手続き', tone: 'info', sub: 'freee 入力待ち' } },
  s0399: { koyou: '正社員', nyusha: '2024/11/01', shotei: '10:00〜19:00（シフト）', overtime: { text: '8h 見込み', tone: 'ok' }, yukyu: { text: '残9日', tone: 'ok', sub: '年5日 3/5' }, shinya: { text: '次回 2027/02', tone: 'ok', sub: '深夜業 6か月ごと' }, shaho: { text: '加入済み', tone: 'ok' }, tetsuzuki: { text: '産休 11/1〜', tone: 'info', sub: '産前産後休業の届' } },
  s0410: { koyou: '契約社員', nyusha: '2025/03/01', shotei: '9:00〜18:00（休憩1h）', overtime: { text: '30h 見込み', tone: 'ok' }, yukyu: { text: '残6日', tone: 'ok', sub: '年5日 3/5' }, shaho: { text: '加入済み', tone: 'ok' }, tetsuzuki: { text: '雇用契約 2026/02 更新', tone: 'mute', sub: '有期・更新上限 5年' } },
};

export const HOUMU: Record<string, Houmu> = {
  s0412: { torihiki: 'A社', shouryu: { text: '2次', tone: 'ok' }, kihon: { text: '締結済み', tone: 'ok' }, kobetsu: { text: '11月分 未着', tone: 'warn', sub: '10/26 から B社' }, koyouKeiyaku: { text: '締結済み', tone: 'ok' }, seiyaku: { text: '受領', tone: 'ok' } },
  s0388: { torihiki: 'C社', kihon: { text: '締結済み', tone: 'ok' }, kobetsu: { text: '〜11/30', tone: 'ok' }, haken: { text: '抵触日 2027/09/30', tone: 'ok', sub: '派遣先へ通知済み' }, koyouKeiyaku: { text: '締結済み', tone: 'ok' }, seiyaku: { text: '受領', tone: 'ok' } },
  s0441: { torihiki: '—', kihon: { text: '—', tone: 'mute' }, kobetsu: { text: '—', tone: 'mute' }, koyouKeiyaku: { text: '締結済み', tone: 'ok' }, seiyaku: { text: '受領', tone: 'ok' } },
  s0302: { torihiki: 'D社', shouryu: { text: '4次', tone: 'bad', sub: '多重の疑い（案件の本文から）' }, kihon: { text: '締結済み', tone: 'ok' }, kobetsu: { text: '〜12/31', tone: 'ok' }, shiki: { text: '疑いあり', tone: 'bad', sub: '「客先リーダーの指示で作業」' }, koyouKeiyaku: { text: '締結済み', tone: 'ok' }, seiyaku: { text: '受領', tone: 'ok' } },
  s0455: { torihiki: 'E社', kihon: { text: '未締結', tone: 'bad', sub: '11/1 入場までに' }, kobetsu: { text: '未作成', tone: 'bad' }, haken: { text: '抵触日 2028/10/31', tone: 'warn', sub: '派遣先への通知 まだ' }, koyouKeiyaku: { text: '送信済み・未署名', tone: 'warn', sub: '10/21 送信' }, seiyaku: { text: '未受領', tone: 'warn' } },
  s0399: { torihiki: 'G社', kihon: { text: '締結済み', tone: 'ok' }, kobetsu: { text: '〜12/31', tone: 'ok' }, haken: { text: '抵触日 2027/10/31', tone: 'ok', sub: '派遣先へ通知済み' }, koyouKeiyaku: { text: '締結済み', tone: 'ok' }, seiyaku: { text: '受領', tone: 'ok' } },
  s0410: { torihiki: 'F社', kihon: { text: '締結済み', tone: 'ok' }, kobetsu: { text: '〜11/30', tone: 'warn', sub: '更新の意向 未確認' }, haken: { text: '抵触日 2028/02/28', tone: 'ok', sub: '派遣先へ通知済み' }, koyouKeiyaku: { text: '締結済み', tone: 'ok', sub: '有期' }, seiyaku: { text: '受領', tone: 'ok' } },
};

export const KEIRI: Record<string, Keiri> = {
  s0412: { seikyusaki: 'A社', tanka: '45万', seisan: '140〜180h', site: '末締め・翌月末', hours: { text: '158h 見込み', tone: 'ok' }, kinmuhyo: { text: '9月分 届いた', tone: 'ok' }, seikyu: { text: '9月分 作成済み', tone: 'ok' }, chingin: '23万', kotsuhi: '1.3万', arari: '17.6万' },
  s0388: { seikyusaki: 'C社', tanka: '42万', seisan: '150〜190h', site: '末締め・翌々月10日', hours: { text: '196h 見込み', tone: 'warn', sub: '上限超え → 超過精算' }, kinmuhyo: { text: '9月分 届いた', tone: 'ok' }, seikyu: { text: '9月分 作成済み', tone: 'ok' }, chingin: '24万', kotsuhi: '0.9万', arari: '13.2万' },
  s0441: { seikyusaki: '—', tanka: '—', seisan: '—', site: '—', chingin: '21万', kotsuhi: '—', arari: '−21万' },
  s0302: { seikyusaki: 'D社', tanka: '45万', seisan: '140〜180h', site: '末締め・翌月末', hours: { text: '132h 見込み', tone: 'warn', sub: '下限割れ → 控除' }, kinmuhyo: { text: '9月分 未着', tone: 'bad', sub: '締めから23日' }, seikyu: { text: '9月分 未作成', tone: 'bad' }, chingin: '25万', kotsuhi: '1.6万', arari: '15.1万' },
  s0455: { seikyusaki: 'E社', tanka: '38万', seisan: '140〜180h', site: '末締め・翌月末', seikyu: { text: '11月分から', tone: 'mute' }, chingin: '21万', kotsuhi: '1.1万' },
  s0399: { seikyusaki: 'G社', tanka: '40万', seisan: '固定', site: '末締め・翌月末', hours: { text: '— 産休 11/1〜', tone: 'info', sub: '11月から請求止め' }, kinmuhyo: { text: '9月分 届いた', tone: 'ok' }, seikyu: { text: '9月分 作成済み', tone: 'ok' }, chingin: '22万', kotsuhi: '1.0万', arari: '14.8万' },
  s0410: { seikyusaki: 'F社', tanka: '41万', seisan: '140〜180h', site: '20日締め・翌月末', hours: { text: '165h 見込み', tone: 'ok' }, kinmuhyo: { text: '9月分 届いた', tone: 'ok' }, seikyu: { text: '9月分 作成済み', tone: 'ok' }, chingin: '22万', kotsuhi: '1.4万', arari: '15.3万' },
};

// ---- シフト（週）。'休' は休み・'夜' がつけば夜勤（深夜業）。空は未提出 ----
export const SHIFT_WEEK = { label: '10/19（月）〜 10/25（日）', days: ['19 月', '20 火', '21 水', '22 木', '23 金', '24 土', '25 日'] };
export const SHIFTS: Record<string, string[]> = {
  s0412: ['9-18', '9-18', '9-18', '9-18', '9-18', '休', '休'],
  s0388: ['9-18', '9-18', '9-18', '9-18', '9-18', '休', '休'],
  s0441: ['休', '休', '休', '休', '休', '休', '休'],
  s0302: ['9-18', '9-18', '22-7 夜', '22-7 夜', '休', '休', '9-18'],
  s0455: ['', '', '', '', '', '', ''],
  s0399: ['10-19', '休', '10-19', '10-19', '10-19', '10-19', '休'],
  s0410: ['9-18', '9-18', '9-18', '9-18', '9-18', '9-18', '9-18'],
};
