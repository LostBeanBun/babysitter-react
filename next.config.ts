import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NextConfig } from 'next'

// 版本号唯一来源：package.json#version（注入到客户端，供「设置 → 关于」展示）
const { version } = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  typescript: { ignoreBuildErrors: false },
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // GitHub Pages 项目页部署在子路径（/babysitter-react/）：
  // 构建时由 deploy.yml 注入 NEXT_PUBLIC_BASE_PATH，本地 / 其他根路径部署保持空
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
}

export default nextConfig
