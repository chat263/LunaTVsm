/* @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

const isDockerOrCI = process.env.DOCKER_BUILD || process.env.VERCEL;

const nextConfig = {
  // Docker / CI 使用 standalone
  ...(isDockerOrCI ? { output: 'standalone' } : {}),

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
