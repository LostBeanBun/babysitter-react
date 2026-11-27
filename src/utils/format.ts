/** 通用工具函数 */
import { serviceT } from '@/i18n/service'

/** 补零 */
export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** 格式化时间为 HH:mm:ss */
export function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** 格式化时间为 HH:mm（照护参考 / 交接摘要等紧凑场景） */
export function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
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

/** 当月 1 日 0 点时间戳 */
export function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/** 下月 1 日 0 点时间戳（当月末的下一刻） */
export function endOfMonth(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
}

/** 解析 "YYYY-MM-DD" 为当天 0 点时间戳（无效返回 undefined） */
export function parseDateOnly(value: string): number | undefined {
  if (!value) return undefined
  const ts = new Date(value + 'T00:00:00').getTime()
  return isNaN(ts) ? undefined : ts
}

/** 月加减：目标月的同一天（溢出钳制到月末，如 1/31 + 1 月 → 2/28） */
export function addMonths(ts: number, months: number): number {
  const d = new Date(ts)
  const m = d.getMonth() + months
  const y = d.getFullYear() + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  const day = Math.min(d.getDate(), new Date(y, mm + 1, 0).getDate())
  return new Date(y, mm, day).getTime()
}

/** 时长拆分为 时/分/秒 */
export function durationParts(ms: number): { hours: number; minutes: number; seconds: number } {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  }
}

/** 格式化时长：秒/分钟 → "X小时Y分" / "Y分钟"（跟随当前界面语言） */
export function formatDuration(ms: number): string {
  const t = serviceT
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
