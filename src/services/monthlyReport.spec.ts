import { describe, expect, it } from 'vitest'
import {
  buildCareInsights,
  buildGrowthVelocity,
  buildMonthlyReport,
  monthRange,
} from './monthlyReport'
import type { DiaperChange, Feeding, GrowthRecord, Sleep } from '@/types'

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const base = { babyId: 1, createdAt: 0, updatedAt: 0 }

function feeding(startTime: number, amount = 120): Feeding {
  return { ...base, id: startTime, type: 'bottle_formula', startTime, amount }
}

function sleep(startTime: number, hours = 1): Sleep {
  return { ...base, id: startTime, type: 'night', startTime, duration: hours * 3600_000 }
}

function diaper(time: number, type: DiaperChange['type']): DiaperChange {
  return { ...base, id: time, time, type }
}

function growth(date: number, weight?: number, height?: number, headCircumference?: number): GrowthRecord {
  return { ...base, id: date, date, weight, height, headCircumference }
}

const NOW = at(2026, 11, 15, 12)

describe('monthRange', () => {
  it('返回本月的起止（end 为下月 1 日）', () => {
    const range = monthRange(NOW)
    expect(range.start).toBe(at(2026, 11, 1))
    expect(range.end).toBe(at(2026, 12, 1))
    expect(range.key).toBe('2026-11')
  })

  it('offset=-1 返回上月并正确跨年', () => {
    expect(monthRange(NOW, -1).key).toBe('2026-10')
    const jan = monthRange(at(2026, 1, 10), -1)
    expect(jan.start).toBe(at(2025, 12, 1))
    expect(jan.end).toBe(at(2026, 1, 1))
    expect(jan.key).toBe('2025-12')
  })
})

describe('buildMonthlyReport', () => {
  const ds = {
    feedings: [feeding(at(2026, 11, 5), 120), feeding(at(2026, 10, 5), 60)],
    diapers: [diaper(at(2026, 11, 6), 'wet')],
    pumpings: [],
    sleeps: [sleep(at(2026, 11, 7), 2)],
  }
  const growths = [growth(at(2026, 11, 8), 6.2), growth(at(2026, 10, 8), 6.0)]

  it('汇总当前月并统计本月成长记录数', () => {
    const report = buildMonthlyReport(ds, growths, monthRange(NOW), NOW)
    expect(report.current.feedCount).toBe(1)
    expect(report.current.totalMilkAmount).toBe(120)
    expect(report.current.dayCount).toBe(30)
    expect(report.current.sleepMs).toBe(2 * 3600_000)
    expect(report.growthCount).toBe(1)
    expect(report.hasData).toBe(true)
  })

  it('与上月按日均对比（月份天数不同也公平）', () => {
    const report = buildMonthlyReport(ds, growths, monthRange(NOW), NOW)
    const milk = report.rows.find((r) => r.key === 'totalMilkAmount')!
    expect(milk.current).toBe(120)
    expect(milk.previous).toBe(60)
    expect(milk.currentDaily).toBe(4)
    expect(milk.previousDaily).toBeCloseTo(60 / 31, 6)
    expect(milk.change).toBeCloseTo(((4 - 60 / 31) / (60 / 31)) * 100, 6)
  })

  it('空月份 hasData 为 false', () => {
    const report = buildMonthlyReport(
      { feedings: [], diapers: [], pumpings: [], sleeps: [] },
      [],
      monthRange(NOW),
      NOW,
    )
    expect(report.hasData).toBe(false)
    expect(report.rows.every((r) => r.change === null)).toBe(true)
  })
})

describe('buildCareInsights', () => {
  it('统计日均睡眠、平均入睡时间与夜醒次数', () => {
    const start = at(2026, 11, 1)
    const end = at(2026, 12, 1)
    const ds = {
      feedings: [feeding(at(2026, 11, 3, 8)), feeding(at(2026, 11, 3, 11)), feeding(at(2026, 11, 3, 14))],
      diapers: [diaper(at(2026, 11, 3, 9), 'wet'), diaper(at(2026, 11, 3, 10), 'dirty')],
      pumpings: [],
      sleeps: [sleep(at(2026, 11, 3, 21, 30), 8), sleep(at(2026, 11, 4, 2), 1)],
    }

    const insights = buildCareInsights(ds, start, end, NOW)

    expect(insights.days).toBe(30)
    expect(insights.sleep?.avgDailyMs).toBe((9 * 3600_000) / 30)
    expect(insights.sleep?.avgBedtimeMinutes).toBe(210)
    expect(insights.sleep?.nightWakes).toBe(1)
    expect(insights.feed?.avgIntervalMs).toBe(3 * 3600_000)
    expect(insights.feed?.avgDailyAmount).toBe(360 / 30)
    expect(insights.diaper?.avgDailyCount).toBe(2 / 30)
    expect(insights.diaper?.wetShare).toBe(0.5)
  })

  it('无记录时对应分组为 null', () => {
    const insights = buildCareInsights(
      { feedings: [], diapers: [], pumpings: [], sleeps: [] },
      at(2026, 11, 1),
      at(2026, 12, 1),
      NOW,
    )
    expect(insights.sleep).toBeNull()
    expect(insights.feed).toBeNull()
    expect(insights.diaper).toBeNull()
  })
})

describe('buildGrowthVelocity', () => {
  const baby = { gender: 'girl' as const, birthDate: '2026-05-15' }

  it('体重换算为 g/周、身高换算为 cm/月', () => {
    const growths = [
      growth(at(2026, 9, 1), 6.0, 65),
      growth(at(2026, 9, 8), 6.35, 65.2),
      growth(at(2026, 10, 1), 6.5, 66),
    ]

    const items = buildGrowthVelocity(growths, baby)
    const weight = items.find((i) => i.field === 'weight')!
    const height = items.find((i) => i.field === 'length')!

    expect(weight.latestValue).toBe(6.5)
    expect(weight.rate).toBeCloseTo((0.15 / 23) * 7 * 1000, 6)
    expect(height.rate).toBeCloseTo((0.8 / 23) * 30.44, 6)
    expect(weight.percentile).not.toBeNull()
    expect(weight.percentileDelta).not.toBeNull()
  })

  it('只有一次测量时速率为 null，百分位仍可计算', () => {
    const items = buildGrowthVelocity([growth(at(2026, 10, 1), undefined, undefined, 42)], baby)
    const head = items.find((i) => i.field === 'hc')!
    expect(head.rate).toBeNull()
    expect(head.previousValue).toBeNull()
    expect(head.percentile).not.toBeNull()
    expect(head.percentileDelta).toBeNull()
  })

  it('没有出生日期时不计算百分位', () => {
    const items = buildGrowthVelocity([growth(at(2026, 9, 1), 6), growth(at(2026, 9, 8), 6.2)], {
      gender: 'girl',
    })
    expect(items[0].percentile).toBeNull()
  })
})
