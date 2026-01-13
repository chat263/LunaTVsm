/* @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const isDockerOrCI = process.env.DOCKER_BUILD || process.env.VERCEL;

const nextConfig = {
  // 生产环境始终使用 standalone 模式（Vercel/Docker/Zeabur）
  // 本地开发时（NODE_ENV !== 'production'）不使用 standalone
  ...(process.env.NODE_ENV === 'production' ? { output: 'standalone' } : {}),

  reactStrictMode: false,

  // ⭐ 关键：Docker / CI 环境禁用 Turbopack
  ...(isDockerOrCI
    ? {
        experimental: {
          turbo: false,
        },
      }
    : {
        turbopack: {
          root: __dirname,
          rules: {
            '*.svg': {
              loaders: ['@svgr/webpack'],
              as: '*.js',
            },
          },
        },
      }),

  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
