/**
 * 双端共享服务层的 i18n 入口（两端文件必须逐字节一致）。
 *
 * Vue 端 vue-i18n 的翻译函数在 `i18n.global.t`，React 端 i18next 在 `i18n.t`；
 * 这里统一成 `serviceT(key, options)` / `serviceLocale()`，让 services / utils
 * 层可以逐字节共享，不再各自适配框架 API。
 */
import i18n from '@/i18n'

interface VueI18nGlobal {
  t: (key: string, options?: Record<string, unknown>) => string
  locale?: { value?: string }
}

interface I18nAdapter {
  global?: VueI18nGlobal
  t?: (key: string, options?: Record<string, unknown>) => string
  language?: string
}

const instance = i18n as unknown as I18nAdapter

/** 读取当前语言下的文案（服务层 / 非组件环境使用） */
export function serviceT(key: string, options?: Record<string, unknown>): string {
  if (instance.global?.t) return String(instance.global.t(key, options))
  if (instance.t) return String(instance.t(key, options))
  return key
}

/** 当前界面语言（服务层使用） */
export function serviceLocale(): string {
  return instance.global?.locale?.value ?? instance.language ?? 'zh-CN'
}
