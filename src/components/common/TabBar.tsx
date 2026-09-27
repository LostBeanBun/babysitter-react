'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useBabies } from '@/stores/baby'
import { APP_TABS, type AppTab } from '@/tabs'
import s from './TabBar.module.css'

export interface TabBarProps {
  tabs?: AppTab[]
  pathname?: string
}

function isActiveTab(path: string, tab: AppTab): boolean {
  if (tab.path === '/') return path === '/'
  return path.startsWith(tab.path)
}

export default function TabBar({ tabs, pathname }: TabBarProps) {
  const routerPathname = usePathname()
  const path = pathname ?? routerPathname
  const { babies } = useBabies()
  const { t } = useTranslation()

  const showTabbar = babies.length > 0
  const tabList = tabs ?? APP_TABS

  if (!showTabbar) return null

  return (
    <nav className={s.tabbar} aria-label={t('nav.dashboard')}>
      <div className={s['tabbar-glass']}>
        <span className={s['tabbar-shine']} aria-hidden="true" />
        {tabList.map((tab) => {
          const active = isActiveTab(path, tab)
          return (
            <Link
              key={tab.name}
              href={tab.path}
              className={active ? `${s['tabbar-item']} ${s.active}` : s['tabbar-item']}
              aria-current={active ? 'page' : undefined}
            >
              <span className={s['tabbar-pill']}>
                <svg viewBox="0 0 24 24" fill="currentColor" className={s['tabbar-icon']} aria-hidden="true">
                  <path d={tab.icon} />
                </svg>
              </span>
              <span className={s['tabbar-label']}>{t(tab.label)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
