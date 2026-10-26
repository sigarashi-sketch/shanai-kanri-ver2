import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 画面の見本を撮るとき左下の開発用バッジが写り込まないように
  devIndicators: false,
  // マネフォ経費の取り込み（mf/・git に入れない）をサーバの関数に同梱する（/api/live/keihi-mf が読む）
  outputFileTracingIncludes: { '/api/live/keihi-mf': ['./mf/*.json'] },
};

export default nextConfig;
