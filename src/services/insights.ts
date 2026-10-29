/**
 * 近 7 天小结：对比「最近 7 天」与「前 7 天」的每日均值，产出温和的变化描述。
 *
 * 只做描述性统计（多了/少了/基本持平），不做健康判断；
 * 变化幅度低于阈值时归为「基本持平」，避免把正常波动说成异常。
 */
import { aggregateRange, type RangeAggregate } from './stats'
import { startOfDay } from '@/utils/format'
import { MS_PER_DAY } from '@/constants'
import type { Feeding, DiaperChange, Pumping, Sleep, SolidFood, Medication, Temperature } from '@/types'

const DAYS = 7

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

/** 各指标视为「变化」的最小幅度（相对前 7 天） */
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
  /** 相对前 7 天的变化百分比（前 7 天为 0 时为 null） */
  change: number | null
  currentDaily: number
  previousDaily: number
}

export interface WeeklyInsight {
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

/** 生成近 7 天小结（now 当天算完整一天，便于与记录页的「今日」口径一致） */
export function buildWeeklyInsight(ds: RecordDatasets, now: number): WeeklyInsight {
  const today = startOfDay(now)
  const current = aggregateRange(
    ds.feedings,
    ds.diapers,
    ds.pumpings,
    ds.sleeps,
    today - (DAYS - 1) * MS_PER_DAY,
    today + MS_PER_DAY,
    ds.solidFoods,
    ds.medications,
    ds.temperatures,
    now,
  )
  const previous = aggregateRange(
    ds.feedings,
    ds.diapers,
    ds.pumpings,
    ds.sleeps,
    today - (DAYS * 2 - 1) * MS_PER_DAY,
    today - (DAYS - 1) * MS_PER_DAY,
    ds.solidFoods,
    ds.medications,
    ds.temperatures,
    now,
  )

  const items = [
    makeItem('milk', current.totalMilkAmount / DAYS, previous.totalMilkAmount / DAYS, THRESHOLDS.milk),
    makeItem('sleep', current.sleepMs / DAYS, previous.sleepMs / DAYS, THRESHOLDS.sleep),
    makeItem('feed', current.feedCount / DAYS, previous.feedCount / DAYS, THRESHOLDS.feed),
    makeItem('diaper', current.diaperCount / DAYS, previous.diaperCount / DAYS, THRESHOLDS.diaper),
  ].filter((x): x is InsightItem => x !== null)

  return { current, previous, items }
}
