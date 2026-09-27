'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBabies } from '@/stores/baby'
import { toggleTheme, useThemeStore } from '@/stores/theme'
import { setLocale, type Locale } from '@/i18n'
import s from './PageHeader.module.css'

export interface PageHeaderProps {
  right?: React.ReactNode
}

export default function PageHeader({ right }: PageHeaderProps) {
  const { t, i18n } = useTranslation()
  const { activeBaby } = useBabies()
  const isDark = useThemeStore((state) => state.isDark)
  const locale = i18n.language || 'zh-CN'

  const [langOpen, setLangOpen] = useState(false)
  const langWrapRef = useRef<HTMLDivElement | null>(null)

  function toggleLang() {
    setLangOpen((open) => !open)
  }

  function chooseLang(l: Locale) {
    setLocale(l)
    setLangOpen(false)
  }

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (langOpen && langWrapRef.current && !langWrapRef.current.contains(e.target as Node)) {
        setLangOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [langOpen])

  return (
    <header className={s['page-header']}>
      <div className={s['header-left']}>
        {activeBaby?.avatar && <span className={s['header-avatar']}>{activeBaby.avatar}</span>}
        <div className={s['header-text']}>
          <h1 className={s['header-title']}>{activeBaby?.name ?? t('app.name')}</h1>
          {activeBaby && <p className={s['header-sub']}>{t('app.tagline')}</p>}
        </div>
      </div>
      <div className={s['header-right']}>
        {right}
        <div ref={langWrapRef} className={s['lang-wrap']}>
          <button
            type="button"
            className={s['lang-toggle']}
            title={t('language.title')}
            aria-label={t('language.title')}
            aria-haspopup="menu"
            aria-expanded={langOpen}
            onClick={(e) => {
              e.stopPropagation()
              toggleLang()
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="15"
              height="15"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
            </svg>
            <span className={s['lang-badge']}>{locale.startsWith('zh') ? '中' : 'EN'}</span>
          </button>
          {langOpen && (
            <div className={s['lang-menu']} role="menu">
              <button
                type="button"
                role="menuitem"
                className={locale === 'zh-CN' ? s.active : undefined}
                onClick={() => chooseLang('zh-CN')}
              >
                {t('language.zh')}
              </button>
              <button
                type="button"
                role="menuitem"
                className={locale === 'en-US' ? s.active : undefined}
                onClick={() => chooseLang('en-US')}
              >
                {t('language.en')}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className={s['theme-toggle']}
          title={isDark ? t('theme.toLight') : t('theme.toDark')}
          aria-label={isDark ? t('theme.toLight') : t('theme.toDark')}
          onClick={toggleTheme}
        >
          {isDark ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="17" height="17" aria-hidden="true">
              <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm9 9a1 1 0 0 1-1 1h-2a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1zM5 12a1 1 0 0 1-1 1H2a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1zm1.05-5.95a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 1 1-1.41-1.41l1.42-1.42a1 1 0 0 1 1.41 0zm12.37 0a1 1 0 0 1 0 1.41l-1.42 1.42a1 1 0 1 1-1.41-1.41l1.42-1.42a1 1 0 0 1 1.41 0zM12 19a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1zm-4.95 2.05a1 1 0 0 1 0-1.41l1.42-1.42a1 1 0 1 1 1.41 1.41l-1.42 1.42a1 1 0 0 1-1.41 0zm9.9 0a1 1 0 0 1-1.41 0l-1.42-1.42a1 1 0 1 1 1.41-1.41l1.42 1.42a1 1 0 0 1 0 1.41z" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
