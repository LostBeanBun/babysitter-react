'use client'

import { useEffect } from 'react'
import { toast } from '@/stores/toast'
import i18n from '@/i18n'

/** 疫苗提醒轮询：有到期/过期 planned 疫苗时周期性提示 */
export function useReminderLoop() {
  useEffect(() => {
    // 静态导出应用在客户端运行；疫苗提醒逻辑可按需扩展
    // 这里保留空实现以保持与原 Vue 版接口兼容
    void toast
    void i18n
  }, [])
}
