import { describe, it, expect } from 'vitest'
import { buildRangeInsight } from './insights'
import type { DiaperChange, Feeding, Sleep } from '@/types'
import { startOfDay } from '@/utils/format'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 23, 12, 0).getTime()
const TODAY = startOfDay(NOW)
/** 最近 7 天（含今天）窗口 */
const WEEK_START = TODAY - 6 * DAY
const WEEK_END = TODAY + DAY
const EMPTY = { feedings: [], diapers: [], pumpings: [], sleeps: [] }

function feeding(startTime: number, amount = 100): Feeding {
  return { babyId: 1, type: 'bottle_formula', startTime, amount, createdAt: 0, updatedAt: 0 }
}

function sleep(startTime: number, hours: number): Sleep {
  return {
    babyId: 1,
    type: 'nap',
    startTime,
    endTime: startTime + hours * 3_600_000,
    createdAt: 0,
    updatedAt: 0,
  }
}

function diaper(time: number): DiaperChange {
  return { babyId: 1, type: 'wet', time, createdAt: 0, updatedAt: 0 }
}

/** 从「今天 - dayOffsetFrom 天」往前连续 count 天，每天一条 */
function daily<T>(count: number, dayOffsetFrom: number, make: (ts: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => make(NOW - (dayOffsetFrom + i) * DAY + 3_600_000))
}

describe('buildRangeInsight', () => {
  it('没有数据时不产出任何条目，dayCount 跟随区间长度', () => {
    const week = buildRangeInsight(EMPTY, WEEK_START, WEEK_END, NOW)
    expect(week.items).toHaveLength(0)
    expect(week.current.dayCount).toBe(7)
    expect(week.previous.dayCount).toBe(7)

    const oneDay = buildRangeInsight(EMPTY, TODAY, WEEK_END, NOW)
    expect(oneDay.current.dayCount).toBe(1)
    expect(oneDay.previous.dayCount).toBe(1)
  })

  it('奶量明显增加时标记 up', () => {
    const feedings = [...daily(7, 0, (ts) => feeding(ts, 120)), ...daily(7, 7, (ts) => feeding(ts, 60))]
    const r = buildRangeInsight({ ...EMPTY, feedings }, WEEK_START, WEEK_END, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(milk.tone).toBe('up')
    expect(Math.round(milk.change!)).toBe(100)
  })

  it('睡眠明显减少时标记 down', () => {
    const sleeps = [...daily(7, 0, (ts) => sleep(ts, 8)), ...daily(7, 7, (ts) => sleep(ts, 11))]
    const r = buildRangeInsight({ ...EMPTY, sleeps }, WEEK_START, WEEK_END, NOW)
    const item = r.items.find((i) => i.key === 'sleep')!
    expect(item.tone).toBe('down')
    expect(item.change!).toBeLessThan(0)
  })

  it('波动在阈值内视为基本持平', () => {
    const diapers = [...daily(7, 0, (ts) => diaper(ts)), ...daily(6, 7, (ts) => diaper(ts))]
    const r = buildRangeInsight({ ...EMPTY, diapers }, WEEK_START, WEEK_END, NOW)
    const item = r.items.find((i) => i.key === 'diaper')!
    expect(item.tone).toBe('steady')
  })

  it('上一周期无记录时 change 为 null（不凭空算百分比）', () => {
    const feedings = daily(3, 0, (ts) => feeding(ts))
    const r = buildRangeInsight({ ...EMPTY, feedings }, WEEK_START, WEEK_END, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(milk.change).toBeNull()
    expect(milk.tone).toBe('steady')
  })

  it('日均按区间自身天数计算（近 30 天不是按 7 天算）', () => {
    const feedings = [
      ...daily(30, 0, (ts) => feeding(ts, 120)),
      ...daily(30, 30, (ts) => feeding(ts, 60)),
    ]
    const r = buildRangeInsight({ ...EMPTY, feedings }, TODAY - 29 * DAY, WEEK_END, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(r.current.dayCount).toBe(30)
    expect(Math.round(milk.currentDaily)).toBe(120)
    expect(Math.round(milk.change!)).toBe(100)
  })

  it('单日区间与前一天对比', () => {
    const feedings = [feeding(TODAY + 3_600_000, 120), feeding(TODAY - DAY + 3_600_000, 60)]
    const r = buildRangeInsight({ ...EMPTY, feedings }, TODAY, WEEK_END, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(r.current.dayCount).toBe(1)
    expect(milk.tone).toBe('up')
    expect(Math.round(milk.change!)).toBe(100)
  })
})
