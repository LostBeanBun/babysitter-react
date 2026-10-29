import { describe, it, expect } from 'vitest'
import { computeTodayStats } from '@/services/todayStats'
import type { Feeding, DiaperChange, Pumping, Sleep } from '@/types'

const TODAY_START = 1_700_000_000_000
const TODAY_END = TODAY_START + 24 * 3600_000
/** 假定的「此刻」：当日 20:00，用于未结束睡眠的截断 */
const NOW = TODAY_START + 20 * 3600_000

function feed(partial: Partial<Feeding>): Feeding {
  return {
    babyId: 1,
    type: 'bottle_formula',
    startTime: TODAY_START + 3600_000,
    amount: 100,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function diaper(partial: Partial<DiaperChange>): DiaperChange {
  return {
    babyId: 1,
    type: 'wet',
    time: TODAY_START + 3600_000,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function pumping(partial: Partial<Pumping>): Pumping {
  return {
    babyId: 1,
    side: 'left',
    startTime: TODAY_START + 3600_000,
    amount: 80,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

function sleep(partial: Partial<Sleep>): Sleep {
  return {
    babyId: 1,
    type: 'nap',
    startTime: TODAY_START + 3600_000,
    endTime: TODAY_START + 2 * 3600_000,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

const emptyInput = {
  feedings: [],
  diapers: [],
  pumpings: [],
  sleeps: [],
  todayStart: TODAY_START,
  todayEnd: TODAY_END,
  now: NOW,
}

describe('computeTodayStats', () => {
  it('空数据全部为 0', () => {
    expect(computeTodayStats(emptyInput)).toEqual({
      totalMilk: 0,
      feedCount: 0,
      pumpCount: 0,
      pumpTotal: 0,
      bottleBreastmilkTotal: 0,
      breastStock: 0,
      sleepMs: 0,
      diaperCount: 0,
    })
  })

  it('奶量只统计 amount，母乳库存 = 泵出 − 瓶喂母乳', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      feedings: [
        feed({ type: 'bottle_formula', amount: 120 }),
        feed({ type: 'bottle_breastmilk', amount: 80 }),
        feed({ type: 'breast', amount: undefined }),
      ],
      pumpings: [pumping({ amount: 150 }), pumping({ amount: undefined })],
    })
    expect(stats.totalMilk).toBe(200)
    expect(stats.feedCount).toBe(3)
    expect(stats.pumpCount).toBe(2)
    expect(stats.pumpTotal).toBe(150)
    expect(stats.bottleBreastmilkTotal).toBe(80)
    expect(stats.breastStock).toBe(70)
  })

  it('母乳库存可为负（瓶喂消耗超过泵出）', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      feedings: [feed({ type: 'bottle_breastmilk', amount: 200 })],
      pumpings: [pumping({ amount: 50 })],
    })
    expect(stats.breastStock).toBe(-150)
  })

  it('睡眠按当日边界裁剪，跨天前后只计当日部分', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      sleeps: [
        // 昨天开始 → 裁剪到今日 0 点，睡 2 小时
        sleep({ startTime: TODAY_START - 3600_000, endTime: TODAY_START + 2 * 3600_000 }),
        // 明天结束 → 裁剪到今日 24 点，睡 3 小时
        sleep({ startTime: TODAY_END - 3 * 3600_000, endTime: TODAY_END + 3600_000 }),
        // 完整在今日内 → 1.5 小时
        sleep({ startTime: TODAY_START + 10 * 3600_000, endTime: TODAY_START + 11.5 * 3600_000 }),
      ],
    })
    expect(stats.sleepMs).toBe(6.5 * 3600_000)
  })

  it('负区间睡眠计 0', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      sleeps: [sleep({ startTime: TODAY_END, endTime: TODAY_START })],
    })
    expect(stats.sleepMs).toBe(0)
  })

  it('未结束的睡眠按 now 截断（含跨零点睡到此刻）', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      // 昨天 23:00 开始一直睡到现在（20:00）→ 今日部分 20 小时
      sleeps: [sleep({ startTime: TODAY_START - 3600_000, endTime: undefined })],
    })
    expect(stats.sleepMs).toBe(20 * 3600_000)
  })

  it('纸尿裤计数', () => {
    const stats = computeTodayStats({
      ...emptyInput,
      diapers: [diaper({}), diaper({ type: 'dirty' }), diaper({ type: 'both' })],
    })
    expect(stats.diaperCount).toBe(3)
  })
})
