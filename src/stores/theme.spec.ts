import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useThemeStore, isDarkNow, setTheme, initTheme, toggleTheme } from '@/stores/theme'

const THEME_KEY = 'babysitter.theme'

function setupMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = []
  const mq = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: () => void) => {
      listeners.push(cb)
    },
    removeEventListener: () => {},
    addListener: (cb: () => void) => {
      listeners.push(cb)
    },
    removeListener: () => {},
    dispatchEvent: () => true,
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mq))
  return {
    setMatches(next: boolean) {
      mq.matches = next
      listeners.forEach((cb) => cb())
    },
  }
}

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    useThemeStore.setState({ themeMode: 'system', isDark: false })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("setTheme('dark') 写 localStorage + data-theme + meta theme-color", () => {
    setupMatchMedia(false)
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('content', '#f2f0ed')
    document.head.appendChild(meta)

    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(meta.getAttribute('content')).toBe('#0f0e0c')
    expect(useThemeStore.getState().isDark).toBe(true)
    expect(isDarkNow()).toBe(true)
    meta.remove()
  })

  it("setTheme('light') → data-theme=light", () => {
    setupMatchMedia(true)
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(useThemeStore.getState().isDark).toBe(false)
  })

  it('持久化损坏值 → 回退 system', () => {
    setupMatchMedia(true)
    localStorage.setItem(THEME_KEY, 'purple')
    initTheme()
    expect(useThemeStore.getState().themeMode).toBe('system')
    expect(useThemeStore.getState().isDark).toBe(true) // system + dark mq
  })

  it('system 模式跟随 matchMedia', () => {
    const media = setupMatchMedia(false)
    initTheme()
    expect(useThemeStore.getState().themeMode).toBe('system')
    expect(useThemeStore.getState().isDark).toBe(false)
    media.setMatches(true)
    expect(useThemeStore.getState().isDark).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggle 在 light/dark 间切换', () => {
    setupMatchMedia(false)
    setTheme('light')
    toggleTheme()
    expect(useThemeStore.getState().themeMode).toBe('dark')
    toggleTheme()
    expect(useThemeStore.getState().themeMode).toBe('light')
  })

  it('initTheme 仅 system 模式响应系统变化', () => {
    const media = setupMatchMedia(false)
    setTheme('dark')
    // 已是 dark，init 后系统变 light 不应覆盖
    initTheme()
    media.setMatches(true)
    expect(useThemeStore.getState().themeMode).toBe('dark')
    expect(useThemeStore.getState().isDark).toBe(true)
  })
})
