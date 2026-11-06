'use client'

import { useEffect } from 'react'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { checkReminders } from '@/utils/reminderScheduler'
import { canNotify, showReminderNotification } from '@/services/notification'

const CHECK_INTERVAL = 60_000

let timer: number | null = null

/**
 * 全局提醒循环：挂载于 AppShell，任何路由/页面下每分钟检查一次提醒并发送系统通知。
 * 每次触发时按需查询 Dexie（而非常驻 live 订阅），静默轮询不产生渲染。
 */
export function useReminderLoop() {
  const { activeBabyId } = useBabies()

  useEffect(() => {
    if (timer != null) return

    async function sendNotifications() {
      if (!canNotify()) return
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
      // 移动端必须走 Service Worker 通知，点击行为由 SW 的 notificationclick 处理
      for (const h of hits) void showReminderNotification(h)
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
