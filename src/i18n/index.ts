import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

export type Locale = 'zh-CN' | 'en-US'

const LOCALE_KEY = 'babysitter.locale'

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-CN'
  const saved = localStorage.getItem(LOCALE_KEY)
  if (saved === 'zh-CN' || saved === 'en-US') return saved
  return 'zh-CN'
}

// 首帧必须与静态 HTML（zh-CN）一致，避免水合失败；用户偏好在挂载后由 hydrateLocale 恢复
void i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  interpolation: {
    escapeValue: false,
    // 与 vue-i18n / 语言包一致：使用 {n} 而非 i18next 默认的 {{n}}
    prefix: '{',
    suffix: '}',
  },
  returnNull: false,
  // 同步完成 init，保证 SSR / 首次客户端渲染时 t() 即可用
  initImmediate: false,
})

/** 切换界面语言并持久化 */
export function setLocale(next: Locale) {
  void i18n.changeLanguage(next)
  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCALE_KEY, next)
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'en-US' ? 'en' : 'zh-CN'
  }
}

/** 挂载后恢复用户保存的语言（勿在渲染/模块加载期调用） */
export function hydrateLocale(): void {
  const saved = detectLocale()
  if (saved !== i18n.language) {
    void i18n.changeLanguage(saved)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = saved === 'en-US' ? 'en' : 'zh-CN'
    }
  }
}

export default i18n
