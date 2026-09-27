/** 通用工具函数 */
import i18n from '@/i18n'

/** 补零 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 格式化时间为 HH:mm:ss */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** 格式化日期为 YYYY-MM-DD */
export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 当天 0 点时间戳 */
export function startOfDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 格式化时长：秒/分钟 → "X小时Y分" / "Y分钟"（跟随当前界面语言） */
export function formatDuration(ms: number): string {
  const t = (key: string): string => String(i18n.t(key))
  if (!ms || ms < 0) return t('duration.zero')
  const totalMin = Math.floor(ms / 60000)
  if (totalMin < 1) return `${Math.max(1, Math.floor(ms / 1000))}${t('duration.second')}`
  if (totalMin < 60) return `${totalMin}${t('duration.minute')}`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m === 0 ? `${h}${t('duration.hour')}` : `${h}${t('duration.hour')}${m}${t('duration.minShort')}`
}

/** 格式化奶量为 "120 ml" */
export function formatAmount(ml?: number): string {
  if (ml === undefined || ml === null) return ''
  return `${Math.round(ml)} ml`
}

/** 百分比变化格式：+12.5% / -3.2% */
export function formatPercentChange(change: number): string {
  if (!isFinite(change)) return '—'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

/** 下载文件到本地 */
export function downloadBlob(content: Blob | string, filename: string, mime: string): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 时间戳 → datetime-local 输入框值（含秒） */
export function toDateTimeLocal(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** datetime-local 输入框值 → 时间戳（无效返回 undefined） */
export function fromDateTimeLocal(value: string): number | undefined {
  if (!value) return undefined
  const ts = new Date(value).getTime()
  return isNaN(ts) ? undefined : ts
}

/** 解析 "YYYY-MM-DD HH:mm" 或 "YYYY-MM-DD" 为时间戳（无效返回 undefined） */
export function parseDate(value: string): number | undefined {
  if (!value) return undefined
  const ts = new Date(value).getTime()
  return isNaN(ts) ? undefined : ts
}
