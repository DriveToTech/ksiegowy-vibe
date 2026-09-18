import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: { buildActivity: false },
  output: 'standalone',
};

export default nextConfig;
