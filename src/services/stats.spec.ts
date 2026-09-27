import { describe, it, expect } from 'vitest'
import {
  buildDailySeries,
  aggregateRange,
  compareRanges,
  getComparisonRange,
  RANGE_PRESETS,
} from '@/services/stats'
import type { Feeding, Sleep, DiaperChange, Pumping, SolidFood, Medication, Temperature } from '@/types'
import { startOfDay } from '@/utils/format'

const DAY = 24 * 3600 * 1000

function feed(partial: Partial<Feeding>): Feeding {
  return {
    babyId: 1,
    type: 'bottle_formula',
    startTime: 0,
    amount: 100,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function sleep(partial: Partial<Sleep>): Sleep {
  return {
    babyId: 1,
    type: 'nap',
    startTime: 0,
    endTime: 3600_000,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function diaper(partial: Partial<DiaperChange>): DiaperChange {
  return {
    babyId: 1,
    type: 'wet',
    time: 0,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function pumping(partial: Partial<Pumping>): Pumping {
  return {
    babyId: 1,
    side: 'left',
    startTime: 0,
    amount: 80,
    duration: 15 * 60_000,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function solidFood(partial: Partial<SolidFood>): SolidFood {
  return { babyId: 1, time: 0, food: '米糊', createdAt: 0, updatedAt: 0, ...partial }
}

function medication(partial: Partial<Medication>): Medication {
  return { babyId: 1, time: 0, name: '药', createdAt: 0, updatedAt: 0, ...partial }
}

function temperature(partial: Partial<Temperature>): Temperature {
  return { babyId: 1, time: 0, value: 36.5, method: 'armpit', createdAt: 0, updatedAt: 0, ...partial }
}

describe('stats aggregation', () => {
  const now = new Date(2026, 7, 20, 12, 0).getTime()
  const day0 = startOfDay(now)
  const day1 = day0 + DAY

  it('buildDailySeries 按天分桶聚合喂养', () => {
    const days = buildDailySeries(
      [
        feed({ type: 'bottle_formula', startTime: day0 + 1, amount: 120 }),
        feed({ type: 'bottle_breastmilk', startTime: day0 + 2, amount: 60 }),
        feed({ type: 'breast', side: 'both', startTime: day1 + 1 }),
      ],
      [],
      [],
      [],
      day0,
      day1 + DAY,
    )
    expect(days.length).toBe(2)
    const d0 = days[0]
    expect(d0.feedCount).toBe(2)
    expect(d0.breastCount).toBe(0)
    expect(d0.bottleCount).toBe(2)
    expect(d0.totalMilkAmount).toBe(180)
    expect(d0.formulaAmount).toBe(120)
    expect(d0.breastMilkAmount).toBe(60)
    const d1 = days[1]
    expect(d1.feedCount).toBe(1)
    expect(d1.breastCount).toBe(1)
    expect(d1.totalMilkAmount).toBe(0)
  })

  it('buildDailySeries 睡眠跨天按开始时间归当天', () => {
    const days = buildDailySeries(
      [],
      [],
      [],
      [sleep({ startTime: day0 + 20 * 3600_000, endTime: day0 + 26 * 3600_000 })],
      day0,
      day1 + DAY,
    )
    expect(days[0].sleepMs).toBe(6 * 3600_000)
    expect(days[0].napCount).toBe(1)
    expect(days[1].sleepMs).toBe(0)
  })

  it('睡眠无 endTime 时回退 duration', () => {
    const days = buildDailySeries(
      [],
      [],
      [],
      [sleep({ startTime: day0 + 8 * 3600_000, endTime: undefined, duration: 90 * 60_000 })],
      day0,
      day1,
    )
    expect(days[0].sleepMs).toBe(90 * 60_000)
  })

  it('buildDailySeries 尿布 wet/dirty/both 分别计数', () => {
    const days = buildDailySeries(
      [],
      [
        diaper({ type: 'wet', time: day0 + 1 }),
        diaper({ type: 'dirty', time: day0 + 2 }),
        diaper({ type: 'both', time: day0 + 3 }),
      ],
      [],
      [],
      day0,
      day1,
    )
    expect(days[0].diaperCount).toBe(3)
    expect(days[0].wetCount).toBe(2)
    expect(days[0].dirtyCount).toBe(2)
  })

  it('buildDailySeries 吸奶聚合奶量与时长', () => {
    const days = buildDailySeries(
      [],
      [],
      [pumping({ startTime: day0 + 1, amount: 80, duration: 20 * 60_000 })],
      [],
      day0,
      day1,
    )
    expect(days[0].pumpCount).toBe(1)
    expect(days[0].pumpAmount).toBe(80)
    expect(days[0].pumpMs).toBe(20 * 60_000)
  })

  it('辅食/用药按天计数，区间外记录被丢弃', () => {
    const days = buildDailySeries(
      [],
      [],
      [],
      [],
      day0,
      day1 + DAY,
      [
        solidFood({ time: day0 + 1 }),
        solidFood({ time: day0 + 2 }),
        solidFood({ time: day0 - 1 }),
      ],
      [medication({ time: day1 + 1 }), medication({ time: day0 - 100 })],
      [],
    )
    expect(days).toHaveLength(2)
    expect(days[0].solidFoodCount).toBe(2)
    expect(days[1].solidFoodCount).toBe(0)
    expect(days[0].medicationCount).toBe(0)
    expect(days[1].medicationCount).toBe(1)
  })

  it('体温：每日 count 与均值', () => {
    const days = buildDailySeries(
      [],
      [],
      [],
      [],
      day0,
      day1,
      [],
      [],
      [
        temperature({ time: day0 + 1, value: 36.5 }),
        temperature({ time: day0 + 2, value: 37.5 }),
        temperature({ time: day0 - 1, value: 40 }),
      ],
    )
    expect(days[0].temperatureCount).toBe(2)
    expect(days[0].temperatureAvg).toBeCloseTo((36.5 + 37.5) / 2, 5)
  })

  it('无体温记录 → avg=0', () => {
    const days = buildDailySeries([], [], [], [], day0, day1)
    expect(days[0].temperatureCount).toBe(0)
    expect(days[0].temperatureAvg).toBe(0)
  })

  it('空区间 start>=end → days=[]', () => {
    expect(buildDailySeries([], [], [], [], day1, day0)).toEqual([])
    expect(buildDailySeries([], [], [], [], day0, day0)).toEqual([])
  })

  it('区间起点非 0 点时序列按整天对齐', () => {
    const midday = day0 + 12 * 3600_000
    const days = buildDailySeries([], [], [], [], midday, day1 + 6 * 3600_000)
    expect(days).toHaveLength(1)
    expect(days[0].dayStart).toBe(day0)
  })

  it('all 预设区间可生成有限日序列', () => {
    const p = RANGE_PRESETS.find((x) => x.key === 'all')!
    const [s, e] = p.getRange(now)
    const days = buildDailySeries([], [], [], [], s, e)
    expect(days.length).toBeGreaterThan(0)
    expect(Number.isFinite(days.length)).toBe(true)
    expect(days[days.length - 1]!.dayStart).toBe(startOfDay(now))
  })

  it('aggregateRange 汇总多日数据', () => {
    const agg = aggregateRange(
      [feed({ startTime: day0, amount: 100 }), feed({ startTime: day1, amount: 50 })],
      [],
      [],
      [],
      day0,
      day1 + DAY,
    )
    expect(agg.dayCount).toBe(2)
    expect(agg.totalMilkAmount).toBe(150)
    expect(agg.feedCount).toBe(2)
    expect(agg.formulaAmount).toBe(150)
  })

  it('aggregateRange 包含 solidFood/medication/temperature 计数', () => {
    const agg = aggregateRange(
      [],
      [],
      [],
      [],
      day0,
      day1 + DAY,
      [solidFood({ time: day0 })],
      [medication({ time: day0 })],
      [temperature({ time: day0, value: 37 })],
    )
    expect(agg.solidFoodCount).toBe(1)
    expect(agg.medicationCount).toBe(1)
    expect(agg.temperatureCount).toBe(1)
    expect(agg.dayCount).toBe(2)
  })

  it('compareRanges 计算变化百分比与每日均值', () => {
    const current = aggregateRange([feed({ startTime: day0, amount: 120 })], [], [], [], day0, day1 + DAY)
    const previous = aggregateRange([feed({ startTime: day0 - DAY, amount: 60 })], [], [], [], day0 - DAY, day0)
    const result = compareRanges(current, previous)
    const milk = result.find((r) => r.key === 'totalMilkAmount')!
    expect(milk.current).toBe(120)
    expect(milk.previous).toBe(60)
    expect(milk.change).toBe(100)
    expect(milk.dailyAvg).toBe(60)
  })

  it('compareRanges previous 为 0 时 change 为 null', () => {
    const current = aggregateRange([feed({ startTime: day0, amount: 120 })], [], [], [], day0, day1 + DAY)
    const previous = aggregateRange([], [], [], [], day0 - DAY, day0)
    const result = compareRanges(current, previous)
    expect(result.find((r) => r.key === 'totalMilkAmount')!.change).toBeNull()
    for (const item of result) {
      expect(item.change, item.key).toBeNull()
    }
  })

  it('dailyAvg 按当前周期天数计算', () => {
    const current = aggregateRange(
      [feed({ startTime: day0 }), feed({ startTime: day1 })],
      [],
      [],
      [],
      day0,
      day1 + DAY,
    )
    const previous = aggregateRange([], [], [], [], day0 - DAY, day0)
    const result = compareRanges(current, previous)
    const feedCount = result.find((r) => r.key === 'feedCount')!
    expect(feedCount.dailyAvg).toBe(1)
  })

  it('getComparisonRange 生成当前与上一等长区间', () => {
    const r = getComparisonRange('7d', now)!
    expect(r).not.toBeNull()
    const curLen = r.current[1] - r.current[0]
    const prevLen = r.previous[1] - r.previous[0]
    expect(curLen).toBe(prevLen)
  })

  it('未知 key → null', () => {
    expect(getComparisonRange('nope', now)).toBeNull()
    expect(getComparisonRange('__missing__' as string, now)).toBeNull()
  })
})

describe('RANGE_PRESETS', () => {
  const now = new Date(2026, 7, 20, 12, 0).getTime()

  it('各预设 [start,end) 合法且 start < end', () => {
    for (const p of RANGE_PRESETS) {
      const [s, e] = p.getRange(now)
      expect(Number.isFinite(s), p.key).toBe(true)
      expect(Number.isFinite(e), p.key).toBe(true)
      expect(e, p.key).toBeGreaterThan(s)
    }
  })

  it('today 从当天 0 点到次日 0 点', () => {
    const p = RANGE_PRESETS.find((x) => x.key === 'today')!
    const [s, e] = p.getRange(now)
    expect(s).toBe(startOfDay(now))
    expect(e).toBe(s + DAY)
  })

  it('all 上下界均为有限值且 start < end', () => {
    const p = RANGE_PRESETS.find((x) => x.key === 'all')!
    const [s, e] = p.getRange(now)
    expect(Number.isFinite(s)).toBe(true)
    expect(Number.isFinite(e)).toBe(true)
    expect(e).toBeGreaterThan(s)
    // 不应再返回 MAX_SAFE_INTEGER（startOfDay 会得到 NaN，日序列变空）
    expect(e).toBeLessThan(Number.MAX_SAFE_INTEGER)
  })
})
