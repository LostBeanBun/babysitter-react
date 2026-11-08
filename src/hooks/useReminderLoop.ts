'use client'

import { useEffect } from 'react'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { checkReminders } from '@/utils/reminderScheduler'
import { canNotify, showReminderNotification, type ReminderNotification } from '@/services/notification'

const CHECK_INTERVAL = 60_000
/** 同一 tag 的通知冷却时间：避免每分钟重复弹出同一条提醒（与「稍后 15 分钟」对齐） */
const NOTIFY_COOLDOWN = 15 * 60_000

let timer: number | null = null
const lastSentAt = new Map<string, number>()

/** 同一 tag 在冷却期内只发一次；数据变化后再次命中会重新通知 */
function dueForNotify(hit: ReminderNotification, now: number): boolean {
  const last = lastSentAt.get(hit.tag)
  return last == null || now - last >= NOTIFY_COOLDOWN
}

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
      const now = Date.now()
      const hits = checkReminders({
        now,
        baby: baby ?? null,
        feedings,
        medications,
        vaccinations,
        diapers,
        sleeps,
      })
      // 移动端必须走 Service Worker 通知，点击行为由 SW 的 notificationclick 处理
      for (const h of hits) {
        if (!dueForNotify(h, now)) continue
        lastSentAt.set(h.tag, now)
        void showReminderNotification(h)
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
