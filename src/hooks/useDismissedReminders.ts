'use client'

import { useState } from 'react'

export type ReminderKind = 'feed' | 'vaccine' | 'backup' | 'sleep' | 'diaper'

/**
 * 提醒条关闭状态（会话级，仅内存）：关闭后当前会话不再显示，刷新页面即重新提醒。
 * 提醒基于实时数据（如喂奶间隔），跨天重新提醒没有意义，故不持久化。
 */
export function useDismissedReminders() {
  const [dismissed, setDismissed] = useState<Record<ReminderKind, boolean>>({
    feed: false,
    vaccine: false,
    backup: false,
    sleep: false,
    diaper: false,
  })

  /** 关闭某提醒条（当前会话生效） */
  function dismiss(kind: ReminderKind) {
    setDismissed((prev) => ({ ...prev, [kind]: true }))
  }

  return { dismissed, dismiss }
}
