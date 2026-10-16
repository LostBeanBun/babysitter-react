import { describe, it, expect } from 'vitest'
import { buildIcs, googleCalendarUrl } from '@/services/calendar'

/** 本地时间 2026-11-20（用本地分量构造，断言与设备时区无关） */
const DATE = new Date(2026, 10, 20).getTime()
/** 固定 now，保证 DTSTAMP 可预测 */
const NOW = Date.UTC(2026, 0, 2, 3, 4, 5)

describe('buildIcs', () => {
  it('生成单个事件：本地 09:00–09:30，含提前 1 天与当天两条提醒', () => {
    const ics = buildIcs([{ uid: 'vaccination-1@babysitter', title: '乙肝疫苗 · 第2剂', date: DATE }], NOW)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('CALSCALE:GREGORIAN')
    expect(ics).toContain('UID:vaccination-1@babysitter')
    expect(ics).toContain('DTSTAMP:20260102T030405Z')
    expect(ics).toContain('DTSTART:20261120T090000')
    expect(ics).toContain('DTEND:20261120T093000')
    expect(ics).toContain('SUMMARY:乙肝疫苗 · 第2剂')
    expect(ics).toContain('TRIGGER:-P1D')
    expect(ics).toContain('TRIGGER:PT0S')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
    // 未提供说明时只有两条提醒的 DESCRIPTION（不含事件级说明）
    expect(ics.match(/^DESCRIPTION:/gm)).toHaveLength(2)
  })

  it('同一日期多条记录各自独立：事件与 UID 一一对应，可单独修改', () => {
    const ics = buildIcs(
      [
        { uid: 'vaccination-1@babysitter', title: '乙肝疫苗 · 第2剂', date: DATE },
        { uid: 'vaccination-2@babysitter', title: '脊灰疫苗 · 第2剂', date: DATE },
      ],
      NOW,
    )
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics.match(/UID:/g)).toHaveLength(2)
    expect(ics).toContain('UID:vaccination-1@babysitter')
    expect(ics).toContain('UID:vaccination-2@babysitter')
    expect(ics).toContain('SUMMARY:乙肝疫苗 · 第2剂')
    expect(ics).toContain('SUMMARY:脊灰疫苗 · 第2剂')
  })

  it('转义逗号、分号与换行，避免破坏 iCalendar 结构', () => {
    const ics = buildIcs([{ uid: 'u@x', title: 'A,B;C\nD', date: DATE, description: '备注一, 备注二' }], NOW)
    expect(ics).toContain('SUMMARY:A\\,B\\;C\\nD')
    expect(ics).toContain('DESCRIPTION:备注一\\, 备注二')
  })

  it('超长行按 75 字节折行且不截断多字节字符', () => {
    const ics = buildIcs([{ uid: 'u@x', title: '疫苗'.repeat(60), date: DATE }], NOW)
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
    expect(ics).toContain('\r\n ')
  })
})

describe('googleCalendarUrl', () => {
  it('生成 Google 日历网页模板链接：单条事件、本地时间与标题/说明', () => {
    const url = googleCalendarUrl({
      uid: 'vaccination-1@babysitter',
      title: '乙肝疫苗 · 第2剂',
      date: DATE,
      description: '来自宝宝日记的疫苗计划',
    })
    const params = new URL(url).searchParams
    expect(url.startsWith('https://calendar.google.com/calendar/render?')).toBe(true)
    expect(params.get('action')).toBe('TEMPLATE')
    expect(params.get('text')).toBe('乙肝疫苗 · 第2剂')
    expect(params.get('dates')).toBe('20261120T090000/20261120T093000')
    expect(params.get('details')).toBe('来自宝宝日记的疫苗计划')
    expect(params.get('ctz')).not.toBeNull()
  })

  it('无说明时 details 为空字符串', () => {
    const url = googleCalendarUrl({ uid: 'u@x', title: 'x', date: DATE })
    expect(new URL(url).searchParams.get('details')).toBe('')
  })
})
