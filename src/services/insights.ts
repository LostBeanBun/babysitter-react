/**
 * 区间小结：把「所选时间范围」与「上一等长周期」的每日均值对比，产出温和的变化描述。
 *
 * 只做描述性统计（多了/少了/基本持平），不做健康判断；
 * 变化幅度低于阈值时归为「基本持平」，避免把正常波动说成异常。
 */
import { aggregateRange, type RangeAggregate } from './stats'
import type { Feeding, DiaperChange, Pumping, Sleep, SolidFood, Medication, Temperature } from '@/types'

/** 统计用记录数据集（与 stats.ts 的位置参数签名对应） */
export interface RecordDatasets {
  feedings: Feeding[]
  diapers: DiaperChange[]
  pumpings: Pumping[]
  sleeps: Sleep[]
  solidFoods?: SolidFood[]
  medications?: Medication[]
  temperatures?: Temperature[]
}

/** 各指标视为「变化」的最小幅度（相对上一周期） */
const THRESHOLDS = {
  milk: 0.15,
  sleep: 0.1,
  feed: 0.15,
  diaper: 0.2,
} as const

export type InsightKey = keyof typeof THRESHOLDS
export type InsightTone = 'up' | 'down' | 'steady'

export interface InsightItem {
  key: InsightKey
  tone: InsightTone
  /** 相对上一周期的变化百分比（上一周期为 0 时为 null） */
  change: number | null
  currentDaily: number
  previousDaily: number
}

export interface RangeInsight {
  current: RangeAggregate
  previous: RangeAggregate
  items: InsightItem[]
}

function makeItem(
  key: InsightKey,
  currentDaily: number,
  previousDaily: number,
  threshold: number,
): InsightItem | null {
  if (currentDaily <= 0 && previousDaily <= 0) return null
  const change = previousDaily > 0 ? ((currentDaily - previousDaily) / previousDaily) * 100 : null
  let tone: InsightTone = 'steady'
  if (change != null) {
    if (change > threshold * 100) tone = 'up'
    else if (change < -threshold * 100) tone = 'down'
  }
  return { key, tone, change, currentDaily, previousDaily }
}

/** 区间汇总（位置参数转调 stats.aggregateRange） */
function sumRange(ds: RecordDatasets, start: number, end: number, now: number): RangeAggregate {
  return aggregateRange(
    ds.feedings,
    ds.diapers,
    ds.pumpings,
    ds.sleeps,
    start,
    end,
    ds.solidFoods,
    ds.medications,
    ds.temperatures,
    now,
  )
}

/**
 * 生成区间小结：start / end 为当前区间（end 不含），上一周期取紧邻的等长区间。
 * 日均按区间自身天数计算，因此今天（1 天）、近 7 天、本月等范围都能直接用。
 */
export function buildRangeInsight(
  ds: RecordDatasets,
  start: number,
  end: number,
  now: number,
): RangeInsight {
  const span = Math.max(1, end - start)
  const current = sumRange(ds, start, end, now)
  const previous = sumRange(ds, start - span, start, now)
  const days = Math.max(1, current.dayCount)
  const prevDays = Math.max(1, previous.dayCount)

  const items = [
    makeItem(
      'milk',
      current.totalMilkAmount / days,
      previous.totalMilkAmount / prevDays,
      THRESHOLDS.milk,
    ),
    makeItem('sleep', current.sleepMs / days, previous.sleepMs / prevDays, THRESHOLDS.sleep),
    makeItem('feed', current.feedCount / days, previous.feedCount / prevDays, THRESHOLDS.feed),
    makeItem('diaper', current.diaperCount / days, previous.diaperCount / prevDays, THRESHOLDS.diaper),
  ].filter((x): x is InsightItem => x !== null)

  return { current, previous, items }
}
