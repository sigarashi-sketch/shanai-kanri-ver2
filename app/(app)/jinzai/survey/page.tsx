'use client';
import SurveyView, { type SurveyRow } from '@/components/sy/SurveyView';
import { SyLoad } from '@/components/sy/Load';
// 月次アンケート（それゆけ未経験 /survey から移した・10-27）。回答はそれゆけの /api/s/survey（いけどんの monthly_survey_responses・ライバーは外す）
export default function Page() { return <SyLoad<{ rows: SurveyRow[] }> path="/api/sy/s/survey">{(d) => <SurveyView rows={d.rows} />}</SyLoad>; }
