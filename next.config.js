
/* @type {import('next').NextConfig} */
/* eslint-disable @typescript-eslint/no-var-requires */

/** @type {import('next').NextConfig} */


const isDockerOrCI = process.env.DOCKER_BUILD || process.env.VERCEL;

const nextConfig = {
  // 生产环境始终使用 standalone 模式（Vercel/Docker/Render）
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


  // Next.js 16 使用 Turbopack，配置 SVG 加载
  turbopack: {
    root: __dirname,
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // 性能优化：包体积优化和模块化导入
  experimental: {
    // 自动优化大型库的导入，只打包实际使用的部分
    optimizePackageImports: [
      'lucide-react',
      '@heroicons/react',
      'framer-motion',
      'react-icons',
    ],
  },

  // 图片优化配置

  images: {
    // 禁用 Next.js 图片优化（代理图片不兼容）
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
