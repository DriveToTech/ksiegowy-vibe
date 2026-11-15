import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  output: 'standalone',
  // Visual regression builds into its own directory so it never clobbers a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default nextConfig;
