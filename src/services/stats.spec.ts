import { describe, it, expect } from 'vitest'
import { buildDailySeries, aggregateRange, compareRanges, RANGE_PRESETS } from '@/services/stats'
import type { RecordDatasets } from '@/services/stats'
import type { Feeding, Sleep, DiaperChange, Pumping } from '@/types'
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

function ds(partial: Partial<RecordDatasets>): RecordDatasets {
  return { feedings: [], diapers: [], pumpings: [], sleeps: [], ...partial }
}

describe('stats aggregation', () => {
  const now = new Date(2026, 7, 20, 12, 0).getTime()
  const day0 = startOfDay(now)
  const day1 = day0 + DAY

  it('buildDailySeries 按天分桶聚合喂养', () => {
    const days = buildDailySeries(
      ds({
        feedings: [
          feed({ type: 'bottle_formula', startTime: day0 + 1, amount: 120 }),
          feed({ type: 'bottle_breastmilk', startTime: day0 + 2, amount: 60 }),
          feed({ type: 'breast', side: 'both', startTime: day1 + 1 }),
        ],
      }),
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

  it('buildDailySeries 睡眠跨天按每日重叠时长分摊', () => {
    const days = buildDailySeries(
      ds({ sleeps: [sleep({ startTime: day0 + 20 * 3600_000, endTime: day0 + 26 * 3600_000 })] }),
      day0,
      day1 + DAY,
    )
    expect(days[0].sleepMs).toBe(4 * 3600_000)
    expect(days[1].sleepMs).toBe(2 * 3600_000)
  })

  it('buildDailySeries 跨零点睡眠计入次日（今日不再漏算 0 点后时长）', () => {
    const days = buildDailySeries(
      ds({ sleeps: [sleep({ startTime: day0 - 2 * 3600_000, endTime: day0 + 5 * 3600_000 })] }),
      day0,
      day1 + DAY,
    )
    expect(days[0].sleepMs).toBe(5 * 3600_000)
  })

  it('buildDailySeries 未结束的睡眠按 now 截断', () => {
    const at = day0 + 7 * 3600_000
    const days = buildDailySeries(
      ds({ sleeps: [sleep({ startTime: day0 + 5 * 3600_000, endTime: undefined })] }),
      day0,
      day1 + DAY,
      at,
    )
    expect(days[0].sleepMs).toBe(2 * 3600_000)
  })

  it('buildDailySeries 超过一天的长睡眠按天拆分', () => {
    const days = buildDailySeries(
      ds({ sleeps: [sleep({ startTime: day0 + 22 * 3600_000, endTime: day0 + 50 * 3600_000 })] }),
      day0,
      day0 + 3 * DAY,
    )
    expect(days.map((d) => d.sleepMs)).toEqual([2 * 3600_000, 24 * 3600_000, 2 * 3600_000])
  })

  it('buildDailySeries 尿布 wet/dirty/both 分别计数', () => {
    const days = buildDailySeries(
      ds({
        diapers: [
          diaper({ type: 'wet', time: day0 + 1 }),
          diaper({ type: 'dirty', time: day0 + 2 }),
          diaper({ type: 'both', time: day0 + 3 }),
        ],
      }),
      day0,
      day1,
    )
    expect(days[0].diaperCount).toBe(3)
    expect(days[0].wetCount).toBe(2)
    expect(days[0].dirtyCount).toBe(2)
  })

  it('buildDailySeries 吸奶聚合奶量与时长', () => {
    const days = buildDailySeries(
      ds({ pumpings: [pumping({ startTime: day0 + 1, amount: 80, duration: 20 * 60_000 })] }),
      day0,
      day1,
    )
    expect(days[0].pumpCount).toBe(1)
    expect(days[0].pumpAmount).toBe(80)
    expect(days[0].pumpMs).toBe(20 * 60_000)
  })

  it('aggregateRange 汇总多日数据', () => {
    const agg = aggregateRange(
      ds({ feedings: [feed({ startTime: day0, amount: 100 }), feed({ startTime: day1, amount: 50 })] }),
      day0,
      day1 + DAY,
    )
    expect(agg.dayCount).toBe(2)
    expect(agg.totalMilkAmount).toBe(150)
    expect(agg.feedCount).toBe(2)
    expect(agg.formulaAmount).toBe(150)
  })

  it('compareRanges 计算变化百分比与每日均值', () => {
    const current = aggregateRange(ds({ feedings: [feed({ startTime: day0, amount: 120 })] }), day0, day1 + DAY)
    const previous = aggregateRange(ds({ feedings: [feed({ startTime: day0 - DAY, amount: 60 })] }), day0 - DAY, day0)
    const result = compareRanges(current, previous)
    const milk = result.find((r) => r.key === 'totalMilkAmount')!
    expect(milk.current).toBe(120)
    expect(milk.previous).toBe(60)
    expect(milk.change).toBe(100)
    expect(milk.dailyAvg).toBe(60)
  })

  it('compareRanges previous 为 0 时 change 为 null', () => {
    const current = aggregateRange(ds({ feedings: [feed({ startTime: day0, amount: 120 })] }), day0, day1 + DAY)
    const previous = aggregateRange(ds({}), day0 - DAY, day0)
    const result = compareRanges(current, previous)
    expect(result.find((r) => r.key === 'totalMilkAmount')!.change).toBeNull()
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
