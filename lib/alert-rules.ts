// アラート設定の決まり（段階つき：注意→警告→上限間近、段階ごとに「いつ」「だれに」「どうやって」）。
//   残業・有給・派遣契約・未打刻・退勤の打ち忘れ。値は全部「選ぶだけ」（自由入力にしない）。
//   法令に関わる知らせ（36協定・有給5日・派遣の抵触日）は、警告より上の段階で労務を外せない。
import type { ModuleKey } from './theme';
import type { Level } from './roumu-sample';

export type Who = '本人' | '担当営業' | '採用担当' | '労務' | '全体管理者';
export type How = 'やること' | 'Slack' | 'LINE（あおい）';
export type Mode = '送る' | 'ためし（送らない）' | '止める';
export const WHO: Who[] = ['本人', '担当営業', '採用担当', '労務', '全体管理者'];
export const HOW: How[] = ['やること', 'Slack', 'LINE（あおい）'];
export const MODES: Mode[] = ['送る', 'ためし（送らない）', '止める'];

export type Stage = { level: Exclude<Level, 'ok'>; when: string; options: string[]; to: Who[]; how: How[]; lockTo?: Who[] };
export type Rule = {
  key: 'overtime' | 'leave' | 'contract' | 'nopunch' | 'taikin';
  module: ModuleKey; name: string; desc: string; page?: string;
  mode: Mode; stages: Stage[]; sample: string; changedBy?: string; changedAt?: string; note?: string;
};

export const DEFAULT_RULES: Rule[] = [
  {
    key: 'overtime', module: 'roumu', name: '残業の見込み（36協定）', page: '/roumu/overtime', mode: '送る',
    desc: '締め日時点の見込み（実績÷経過した所定日×今月の所定日）で知らせる。新宿事業所の協定届の数字',
    sample: '伊藤 誠 さんの10月度の残業が、締め日の見込みで 52h（月45h超え・今年5回目）です。',
    stages: [
      { level: 'caution', when: '月45hの8割（36h）', options: ['月45hの7割（32h）', '月45hの8割（36h）', '月45hの9割（41h）'], to: ['担当営業'], how: ['やること'] },
      { level: 'warn', when: '月45hを超える見込み', options: ['月45hを超える見込み'], to: ['担当営業', '労務'], how: ['やること', 'Slack'], lockTo: ['労務'] },
      { level: 'danger', when: '特別条項の月上限の9割（81h）', options: ['特別条項の月上限の8割（72h）', '特別条項の月上限の9割（81h）'], to: ['担当営業', '労務', '全体管理者'], how: ['やること', 'Slack'], lockTo: ['労務'] },
    ],
  },
  {
    key: 'leave', module: 'roumu', name: '有給の年5日', page: '/roumu/overtime?tab=leave', mode: '送る',
    desc: '年10日以上付いた人が、付いた日から1年のうちに5日取れそうか',
    sample: '鈴木 一郎 さんの有給があと4日足りません（期限 11/30・あと38日）。',
    stages: [
      { level: 'caution', when: '経過に対して遅れている', options: ['経過に対して遅れている'], to: ['担当営業'], how: ['やること'] },
      { level: 'warn', when: '経過より25%以上遅れている', options: ['経過より15%以上遅れている', '経過より25%以上遅れている'], to: ['本人', '担当営業', '労務'], how: ['やること', 'LINE（あおい）'], lockTo: ['労務'] },
      { level: 'danger', when: '期限まで60日で足りない', options: ['期限まで90日で足りない', '期限まで60日で足りない', '期限まで30日で足りない'], to: ['本人', '担当営業', '労務', '全体管理者'], how: ['やること', 'LINE（あおい）', 'Slack'], lockTo: ['労務'] },
    ],
  },
  {
    key: 'contract', module: 'roumu', name: '派遣契約の終わり・抵触日', page: '/roumu/contracts', mode: '送る',
    desc: '派遣だけ（準委任は対象外）。契約の終わりと抵触日の近いほう。更新の意向が決まれば止まる',
    sample: '林 さくら さん（J社）の派遣契約が 11/30 に終わります。抵触日 12/1 を次の更新でまたぎます。',
    stages: [
      { level: 'caution', when: '60日前', options: ['90日前', '60日前', '45日前'], to: ['担当営業'], how: ['やること'] },
      { level: 'warn', when: '30日前', options: ['45日前', '30日前', '21日前'], to: ['担当営業', '労務'], how: ['やること', 'Slack'], lockTo: ['労務'] },
      { level: 'danger', when: '14日前', options: ['14日前', '7日前'], to: ['担当営業', '労務', '全体管理者'], how: ['やること', 'Slack'], lockTo: ['労務'] },
    ],
  },
  {
    key: 'nopunch', module: 'roumu', name: '未打刻（出勤）', page: '/roumu/today', mode: '送る',
    desc: 'シフトがあるのに出勤の打刻が無い人。シフトが空欄の日は休み扱いで知らせない',
    sample: 'おはようございます。今日の出勤の打刻がまだのようです。打刻をお願いします。',
    stages: [
      { level: 'caution', when: '平日 10:00', options: ['平日 9:30', '平日 10:00', '平日 10:30', '始業から30分'], to: ['本人'], how: ['LINE（あおい）'] },
      { level: 'warn', when: '始業から60分', options: ['始業から45分', '始業から60分', '始業から90分'], to: ['担当営業'], how: ['やること', 'Slack'] },
    ],
  },
  {
    key: 'taikin', module: 'roumu', name: '退勤の打ち忘れ（夕方）', mode: 'ためし（送らない）',
    desc: '出勤の打刻はあるのに退勤が無い人へ、その日のうちに知らせる',
    note: 'いまは「ためし」＝だれにも送らず記録だけ。「送る」にするのは全体管理者の承認のあと',
    sample: 'おつかれさまです。今日の退勤の打刻がまだのようです。打刻をお願いします。',
    stages: [
      { level: 'caution', when: '平日 19:30', options: ['平日 19:00', '平日 19:30', '平日 20:00'], to: ['本人'], how: ['LINE（あおい）'] },
    ],
  },
];

/** 「60日前」「始業から60分」などから数字を取り出す。 */
export const numOf = (s: string) => Number((s.match(/(\d+)/) || [])[1] || 0);
