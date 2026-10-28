// bdsh の クリック数（lib/kyouiku-views.ts が組み立てて KyouikuViews.tsx が描く）
export interface ViewsLesson { id: string; title: string; opens: number; people: number; last: string }
export interface ViewsCourse { id: string; name: string; opens: number; people: number; last: string; lessonOpens: number; lessons: ViewsLesson[]; who: { name: string; opens: number }[] }
export interface ViewsData { ok: boolean; error?: string; courses: ViewsCourse[]; total: number; people: number; days: number }
