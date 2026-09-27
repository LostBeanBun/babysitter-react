'use client'

import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_KEY = 'babysitter.theme'

function resolveDark(mode: ThemeMode): boolean {
  if (typeof window === 'undefined') return false
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readSavedMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
}

function applyTheme(isDark: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  const color = isDark ? '#0f0e0c' : '#f2f0ed'
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute('media')
    meta.setAttribute('content', color)
  })
}

interface ThemeState {
  themeMode: ThemeMode
  isDark: boolean
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
  initTheme: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  themeMode: 'system',
  isDark: false,
  setTheme: (mode) => {
    const isDark = resolveDark(mode)
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_KEY, mode)
    }
    applyTheme(isDark)
    set({ themeMode: mode, isDark })
  },
  toggleTheme: () => {
    get().setTheme(get().isDark ? 'light' : 'dark')
  },
  initTheme: () => {
    const mode = readSavedMode()
    const isDark = resolveDark(mode)
    applyTheme(isDark)
    set({ themeMode: mode, isDark })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const current = get().themeMode
      if (current === 'system') {
        const next = mq.matches
        applyTheme(next)
        set({ isDark: next })
      }
    }
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
  },
}))

/** 模块级当前是否暗色（供非组件代码读取；组件请用 useThemeStore） */
export function isDarkNow(): boolean {
  return useThemeStore.getState().isDark
}

/** 兼容旧用法的导出 */
export function useTheme() {
  return useThemeStore()
}

export function toggleTheme() {
  useThemeStore.getState().toggleTheme()
}

export function initTheme() {
  useThemeStore.getState().initTheme()
}

export function setTheme(mode: ThemeMode) {
  useThemeStore.getState().setTheme(mode)
}
