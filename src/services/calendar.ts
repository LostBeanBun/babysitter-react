import { pad2 } from '@/utils/format'

/** 单个日历事件（一条记录 = 一个独立事件，同一时间多条互不影响，可在日历中单独修改/删除） */
export interface CalendarEvent {
  /** 稳定唯一标识：同一条记录再次添加时，日历会视作同一事件而非新建 */
  uid: string
  /** 事件标题（含名称与剂次，同一天多条时便于区分） */
  title: string
  /** 事件日期时间戳（取当天 EVENT_HOUR 点，按设备本地时区） */
  date: number
  /** 事件说明 */
  description?: string
}

/** 事件默认开始时刻（本地时间）：疫苗门诊多在上午 */
const EVENT_HOUR = 9
/** 事件时长（分钟） */
const EVENT_MINUTES = 30
/** 提前提醒天数 */
const ALARM_DAYS_BEFORE = 1

/** 本地时间 → iCalendar 本地时间格式（无时区后缀，按设备时区解读） */
function localStamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`
}

/** 时间戳 → iCalendar UTC 时间格式（DTSTAMP） */
function utcStamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(
    d.getUTCMinutes(),
  )}${pad2(d.getUTCSeconds())}Z`
}

/** 文本转义（RFC 5545 3.3.11：反斜杠、分号、逗号、换行） */
function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** 折行到 75 字节（RFC 5545 3.1，续行以单个空格开头；按字符切分避免截断多字节字符） */
function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const chunks: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = encoder.encode(ch).length
    // 续行开头会加一个空格（占 1 字节）
    const limit = chunks.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      chunks.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  chunks.push(current)
  return chunks.join('\r\n ')
}

/**
 * 生成 iCalendar（.ics）文本：
 * 每个事件独立（各自 UID），同一时间多条互不影响，可在日历中单独修改；
 * 每个事件含两条提醒（提前 1 天、当天开始）。
 */
export function buildIcs(events: CalendarEvent[], now = Date.now()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Babysitter//Vaccine Plan//CN',
    'CALSCALE:GREGORIAN',
  ]
  for (const event of events) {
    const start = new Date(event.date)
    start.setHours(EVENT_HOUR, 0, 0, 0)
    const end = new Date(start.getTime() + EVENT_MINUTES * 60 * 1000)
    const alarm = (trigger: string): string[] => [
      'BEGIN:VALARM',
      `TRIGGER:${trigger}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(event.title)}`,
      'END:VALARM',
    ]
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${localStamp(start)}`,
      `DTEND:${localStamp(end)}`,
      `SUMMARY:${escapeText(event.title)}`,
    )
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    lines.push(...alarm(`-P${ALARM_DAYS_BEFORE}D`), ...alarm('PT0S'), 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** 本地时间 → Google 日历模板时间格式（不带 Z，由 ctz 参数解释时区） */
function templateStamp(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`
}

/**
 * Google 日历网页「新建事件」模板链接（单条记录，无需下载 .ics）：
 * 打开后可直接在 Google 日历网页保存，适合不想导入文件的用户。
 * 说明：Google 模板一次只能带一条事件，多条请逐条添加或改用 .ics 批量导入。
 */
export function googleCalendarUrl(event: CalendarEvent): string {
  const start = new Date(event.date)
  start.setHours(EVENT_HOUR, 0, 0, 0)
  const end = new Date(start.getTime() + EVENT_MINUTES * 60 * 1000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${templateStamp(start)}/${templateStamp(end)}`,
    details: event.description ?? '',
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export type CalendarDelivery = 'shared' | 'downloaded' | 'aborted' | 'failed'

/**
 * 把 .ics 交给系统日历：
 * 1) 支持文件分享（iOS/Android）→ 唤起系统分享面板，用户选择日历应用；
 * 2) 否则下载 .ics（桌面端会直接唤起日历应用；iOS 落到「文件」，打开即可添加）。
 */
export async function deliverIcs(content: string, filename: string, title: string): Promise<CalendarDelivery> {
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (typeof File !== 'undefined' && typeof nav.canShare === 'function') {
    const file = new File([new Blob([content], { type: 'text/calendar' })], filename, { type: 'text/calendar' })
    const data: ShareData = { files: [file], title }
    if (nav.canShare(data)) {
      try {
        await nav.share(data)
        return 'shared'
      } catch (error) {
        // 用户取消：不做额外提示
        if ((error as Error)?.name === 'AbortError') return 'aborted'
        // 其他失败（如无可用分享目标）继续走下载
      }
    }
  }
  try {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // 延迟释放：Safari/iOS 立即 revoke 会中断下载
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}
