'use client'

import { useEffect } from 'react'
import { initTheme } from '@/stores/theme'
import { hydrateActiveTimer } from '@/hooks/useActiveTimer'
import { hydrateActiveBaby } from '@/stores/baby'
import { hydrateLocale } from '@/i18n'

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initTheme()
    // 界面语言：首帧固定 zh-CN 与静态 HTML 一致，挂载后再恢复偏好，避免水合失败
    hydrateLocale()
    // 活跃记录：首帧与 SSR 一致（空），挂载后再恢复，避免水合失败
    hydrateActiveTimer()
    // 当前宝宝：同上，刷新后恢复上次选择
    hydrateActiveBaby()

    // PWA：仅生产环境注册；dev 注销残留 SW，避免旧缓存 chunk 导致水合结构不一致
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW register failed', err))
      } else {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => undefined)
      }
    }

    // 全局错误兜底
    const onErr = (e: PromiseRejectionEvent | ErrorEvent) => {
      console.error('[app error]', 'reason' in e ? e.reason : e)
    }
    window.addEventListener('unhandledrejection', onErr as EventListener)
    window.addEventListener('error', onErr as EventListener)
    return () => {
      window.removeEventListener('unhandledrejection', onErr as EventListener)
      window.removeEventListener('error', onErr as EventListener)
    }
  }, [])

  return <>{children}</>
}
