import { describe, it, expect } from 'vitest'
import {
  pad2,
  startOfDay,
  formatPercentChange,
  formatAmount,
  fromDateTimeLocal,
  formatTime,
  formatDate,
  formatDuration,
  toDateTimeLocal,
  parseDate,
} from '@/utils/format'
import i18n from '@/i18n'

describe('format utils', () => {
  it('pad2 补零', () => {
    expect(pad2(5)).toBe('05')
    expect(pad2(12)).toBe('12')
    expect(pad2(0)).toBe('00')
    expect(pad2(9)).toBe('09')
    expect(pad2(-1)).toBe('0-1') // 当前行为：n < 10 拼接
  })

  it('startOfDay 返回当天 0 点', () => {
    const ts = new Date(2026, 7, 20, 15, 30).getTime() // 2026-08-20 15:30
    const start = startOfDay(ts)
    const d = new Date(start)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('formatPercentChange 正负号与保留 1 位', () => {
    expect(formatPercentChange(12.345)).toBe('+12.3%')
    expect(formatPercentChange(-3.25)).toBe('-3.3%')
    expect(formatPercentChange(0)).toBe('0.0%')
    expect(formatPercentChange(Infinity)).toBe('—')
    expect(formatPercentChange(NaN)).toBe('—')
  })

  it('formatAmount 输出 ml', () => {
    expect(formatAmount(120)).toBe('120 ml')
    expect(formatAmount(0)).toBe('0 ml')
    expect(formatAmount(undefined)).toBe('')
  })

  it('fromDateTimeLocal 解析 datetime-local 字符串', () => {
    const ts = fromDateTimeLocal('2026-08-20T08:30')
    expect(ts).not.toBeUndefined()
    if (ts != null) {
      const d = new Date(ts)
      expect(d.getFullYear()).toBe(2026)
      expect(d.getMonth()).toBe(7)
      expect(d.getDate()).toBe(20)
      expect(d.getHours()).toBe(8)
      expect(d.getMinutes()).toBe(30)
    }
    expect(fromDateTimeLocal('')).toBeUndefined()
    expect(fromDateTimeLocal('not-a-date')).toBeUndefined()
  })

  it('formatTime / formatDate 固定时间戳', () => {
    const ts = new Date(2026, 0, 5, 7, 5).getTime()
    expect(formatTime(ts)).toBe('07:05:00')
    expect(formatDate(ts)).toBe('2026-01-05')
  })

  it('toDateTimeLocal ↔ fromDateTimeLocal 往返', () => {
    const ts = new Date(2026, 7, 20, 14, 35).getTime()
    const local = toDateTimeLocal(ts)
    expect(local).toBe('2026-08-20T14:35:00')
    expect(fromDateTimeLocal(local)).toBe(ts)
  })

  it('toDateTimeLocal 输出含秒', () => {
    const ts = new Date(2026, 7, 20, 15, 30, 45).getTime()
    expect(toDateTimeLocal(ts)).toBe('2026-08-20T15:30:45')
    expect(fromDateTimeLocal(toDateTimeLocal(ts))).toBe(ts)
  })

  it('formatTime 输出 HH:mm:ss', () => {
    const ts = new Date(2026, 7, 20, 8, 5, 3).getTime()
    expect(formatTime(ts)).toBe('08:05:03')
  })

  it('parseDate 解析与非法输入', () => {
    expect(parseDate('2026-08-20 08:30')).toBeTypeOf('number')
    expect(parseDate('2026-08-20')).toBeTypeOf('number')
    expect(parseDate('')).toBeUndefined()
    expect(parseDate('not-a-date')).toBeUndefined()
  })
})

describe('formatDuration', () => {
  const cases: [number, (s: string) => boolean, string][] = [
    [0, (s) => s === i18n.t('duration.zero'), 'zero'],
    [-100, (s) => s === i18n.t('duration.zero'), 'negative→zero'],
    [30_000, (s) => s.endsWith(i18n.t('duration.second')) && s.startsWith('30'), '30s'],
    [90_000, (s) => s === `1${i18n.t('duration.minute')}`, '90s→1min'],
    [59 * 60_000, (s) => s === `59${i18n.t('duration.minute')}`, '59min'],
    [60 * 60_000, (s) => s === `1${i18n.t('duration.hour')}`, '60min→1h'],
    [90 * 60_000, (s) => s === `1${i18n.t('duration.hour')}30${i18n.t('duration.minShort')}`, '90min'],
    [2 * 3600_000, (s) => s === `2${i18n.t('duration.hour')}`, '2h'],
  ]

  for (const [ms, check, name] of cases) {
    it(`formatDuration(${ms}) → ${name}`, () => {
      expect(check(formatDuration(ms)), formatDuration(ms)).toBe(true)
    })
  }
})
