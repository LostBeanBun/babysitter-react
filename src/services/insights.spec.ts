import { describe, it, expect } from 'vitest'
import { buildWeeklyInsight } from './insights'
import type { DiaperChange, Feeding, Sleep } from '@/types'

const DAY = 86_400_000
const NOW = new Date(2026, 9, 23, 12, 0).getTime()

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

function daily<T>(count: number, dayOffsetFrom: number, make: (ts: number) => T): T[] {
  return Array.from({ length: count }, (_, i) => make(NOW - (dayOffsetFrom + i) * DAY + 3_600_000))
}

describe('buildWeeklyInsight', () => {
  it('没有数据时不产出任何条目', () => {
    const r = buildWeeklyInsight({ feedings: [], diapers: [], pumpings: [], sleeps: [] }, NOW)
    expect(r.items).toHaveLength(0)
    expect(r.current.dayCount).toBe(7)
    expect(r.previous.dayCount).toBe(7)
  })

  it('奶量明显增加时标记 up', () => {
    const feedings = [
      ...daily(7, 0, (ts) => feeding(ts, 120)),
      ...daily(7, 7, (ts) => feeding(ts, 60)),
    ]
    const r = buildWeeklyInsight({ feedings, diapers: [], pumpings: [], sleeps: [] }, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(milk.tone).toBe('up')
    expect(Math.round(milk.change!)).toBe(100)
  })

  it('睡眠明显减少时标记 down', () => {
    const sleeps = [
      ...daily(7, 0, (ts) => sleep(ts, 8)),
      ...daily(7, 7, (ts) => sleep(ts, 11)),
    ]
    const r = buildWeeklyInsight({ feedings: [], diapers: [], pumpings: [], sleeps }, NOW)
    const item = r.items.find((i) => i.key === 'sleep')!
    expect(item.tone).toBe('down')
    expect(item.change!).toBeLessThan(0)
  })

  it('波动在阈值内视为基本持平', () => {
    const diapers = [
      ...daily(7, 0, (ts) => diaper(ts)),
      ...daily(6, 7, (ts) => diaper(ts)),
    ]
    const r = buildWeeklyInsight({ feedings: [], diapers, pumpings: [], sleeps: [] }, NOW)
    const item = r.items.find((i) => i.key === 'diaper')!
    expect(item.tone).toBe('steady')
  })

  it('前 7 天无记录时 change 为 null（不凭空算百分比）', () => {
    const feedings = daily(3, 0, (ts) => feeding(ts))
    const r = buildWeeklyInsight({ feedings, diapers: [], pumpings: [], sleeps: [] }, NOW)
    const milk = r.items.find((i) => i.key === 'milk')!
    expect(milk.change).toBeNull()
    expect(milk.tone).toBe('steady')
  })
})
