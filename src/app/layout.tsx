import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './Providers'
import { AppShell } from '@/components/AppShell'

export const metadata: Metadata = {
  metadataBase: new URL('https://example.com'),
  title: '宝宝日记 - 宝宝喂养记录、睡眠统计与成长曲线工具',
  description:
    '宝宝日记是一款免费、纯本地保存的宝宝喂养记录与统计工具：记录亲喂/瓶喂、睡眠、纸尿裤、吸奶、体温与成长数据，自动生成趋势统计、周期对比和 WHO 百分位成长曲线，支持多宝宝与数据导出导入。',
  keywords: [
    '宝宝日记',
    '宝宝喂养记录',
    '母乳记录',
    '睡眠记录',
    '成长曲线',
    'WHO百分位',
    '育儿工具',
    'PWA',
  ],
  authors: [{ name: '宝宝日记' }],
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png' }],
  },
  openGraph: {
    type: 'website',
    siteName: '宝宝日记',
    title: '宝宝日记 - 宝宝喂养记录、睡眠统计与成长曲线工具',
    description: '温馨简约的宝宝喂养记录工具：纯本地保存、私密安全，支持趋势统计、周期对比与 WHO 成长曲线。',
    images: ['/icons/icon-512.png'],
    locale: 'zh_CN',
  },
  twitter: {
    card: 'summary',
    title: '宝宝日记 - 宝宝喂养记录与成长统计工具',
    description: '温馨简约的宝宝喂养记录工具：纯本地保存、私密安全，支持趋势统计、周期对比与 WHO 成长曲线。',
    images: ['/icons/icon-512.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f0ed' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0c' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
