import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 画面の見本を撮るとき左下の開発用バッジが写り込まないように
  devIndicators: false,
};

export default nextConfig;
