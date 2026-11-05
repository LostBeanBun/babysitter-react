'use client'

import { useEffect } from 'react'
import { initTheme } from '@/stores/theme'
import { hydrateActiveTimer } from '@/hooks/useActiveTimer'
import { hydrateActiveBaby } from '@/stores/baby'
import i18n, { hydrateLocale } from '@/i18n'
import { toast } from '@/stores/toast'
import { requestPersistentStorage } from '@/services/backup'

/**
 * PWA 注册（对齐 Vue 版 prompt 策略）：新版本先提示，用户确认后才激活并刷新，
 * 避免静默更新打断正在填写的表单。首次安装成功则提示「已可离线使用」。
 */
function registerPwa() {
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) window.location.reload()
  })

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      const notifyUpdate = (worker: ServiceWorker) => {
        toast(i18n.t('pwa.updateReady'), 'info', {
          actionLabel: i18n.t('pwa.refresh'),
          duration: 0,
          onAction: () => {
            refreshing = true
            worker.postMessage({ type: 'SKIP_WAITING' })
          },
        })
      }

      // 打开页面时已有等待中的新版本（例如上次没点刷新就关掉了）
      if (reg.waiting && navigator.serviceWorker.controller) notifyUpdate(reg.waiting)

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return
          if (navigator.serviceWorker.controller) notifyUpdate(worker)
          else toast(i18n.t('pwa.offlineReady'))
        })
      })
    })
    .catch((err) => console.warn('SW register failed', err))
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initTheme()
    // 申请持久化存储：降低浏览器空间紧张时驱逐 IndexedDB 的概率（失败不影响使用）
    void requestPersistentStorage()
    // 界面语言：首帧固定 zh-CN 与静态 HTML 一致，挂载后再恢复偏好，避免水合失败
    hydrateLocale()
    // 活跃记录：首帧与 SSR 一致（空），挂载后再恢复，避免水合失败
    hydrateActiveTimer()
    // 当前宝宝：同上，刷新后恢复上次选择
    hydrateActiveBaby()

    // PWA：仅生产环境注册；dev 注销残留 SW，避免旧缓存 chunk 导致水合结构不一致
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        registerPwa()
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
