'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { APP_TABS } from '@/tabs'
import { useBabies } from '@/stores/baby'
import TabBar from '@/components/common/TabBar'
import ToastContainer from '@/components/common/ToastContainer'
import FloatingTimer from '@/components/common/FloatingTimer'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const activeTimer = useActiveTimer()
  const { babies } = useBabies()
  const hasBabies = babies.length > 0

  // 标题
  useEffect(() => {
    // 由页面组件通过 document.title 更新；默认保持 layout title
  }, [pathname])

  function openTimerForm(timerId: string) {
    const entry = activeTimer.getById(timerId)
    if (entry) {
      router.push(`/log/?timer=${entry.kind}`)
    }
  }

  const isActive = activeTimer.records.length > 0

  return (
    <div className="app-shell" data-path={pathname}>
      <div className="fade-page">{children}</div>
      {hasBabies && <TabBar tabs={APP_TABS} pathname={pathname} />}
      <ToastContainer />
      <FloatingTimer active={isActive} onOpen={openTimerForm} />
    </div>
  )
}
