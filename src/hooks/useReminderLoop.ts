'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { checkReminders } from '@/utils/reminderScheduler'

const CHECK_INTERVAL = 60_000

let timer: number | null = null

/**
 * 全局提醒循环：挂载于 AppShell，任何路由/页面下每分钟检查一次提醒并发送系统通知。
 * 每次触发时按需查询 Dexie（而非常驻 live 订阅），静默轮询不产生渲染。
 */
export function useReminderLoop() {
  const { activeBabyId } = useBabies()
  const pathname = usePathname()
  const router = useRouter()

  // 通知点击回调脱离 React 渲染上下文，经 ref 取最新 router（ref 写入放在 effect 中）
  const routerRef = useRef(router)
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    routerRef.current = router
    pathnameRef.current = pathname
  })

  useEffect(() => {
    if (timer != null) return

    async function sendNotifications() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (activeBabyId == null) return
      const [baby, feedings, medications, vaccinations, diapers, sleeps] = await Promise.all([
        db.babies.get(activeBabyId),
        db.feedings
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray(),
        db.medications
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray(),
        db.vaccinations
          .where('[babyId+date]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray(),
        db.diapers
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray(),
        db.sleeps
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray(),
      ])
      const hits = checkReminders({
        now: Date.now(),
        baby: baby ?? null,
        feedings,
        medications,
        vaccinations,
        diapers,
        sleeps,
      })
      for (const h of hits) {
        const notification = new Notification(h.title, { body: h.body, tag: h.tag })
        // 点击通知时聚焦窗口，并回到首页查看详情
        notification.onclick = () => {
          window.focus()
          if (pathnameRef.current !== '/') routerRef.current.push('/')
          notification.close()
        }
      }
    }

    // 首次进入页面即检查一次，随后每分钟轮询
    void sendNotifications()
    timer = window.setInterval(() => void sendNotifications(), CHECK_INTERVAL)
    return () => {
      if (timer != null) {
        window.clearInterval(timer)
        timer = null
      }
    }
  }, [activeBabyId])
}
