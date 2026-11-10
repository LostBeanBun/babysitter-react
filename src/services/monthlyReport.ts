/**
 * 月报与照护洞察（两端同一份逻辑，仅 stats 调用签名按各仓库适配）。
 *
 * - 月报：按自然月汇总，并与上一个自然月按「日均」对比（月份天数不同也公平）
 * - 照护洞察：日均睡眠、平均入睡时间、夜间醒来次数、平均喂养间隔、尿布频率
 * - 成长速度：最近两次测量的体重 g/周、身高/头围 cm/月，以及 WHO 百分位变化
 *
 * 只做描述性统计，不做健康判断。
 */
import type { Baby, GrowthRecord } from '@/types'
import { aggregateRange, type RangeAggregate } from './stats'
import type { RecordDatasets } from './insights'
import { MS_PER_DAY } from '@/constants'
import { estimatePercentile } from '@/utils/growthPercentile'
import { whoData, type WhoField } from '@/constants/whoGrowth'
import { ageInMonths } from '@/utils/age'

/** React 版 stats 使用位置参数，这里统一成数据集对象调用（与 Vue 版行为一致） */
function aggregate(ds: RecordDatasets, start: number, end: number, now: number): RangeAggregate {
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

/** 自然月范围：end 为下月 1 日 0 点（不含） */
export interface MonthRange {
  start: number
  end: number
  /** YYYY-MM */
  key: string
}

/** 计算自然月范围；offset 0 = 本月，-1 = 上月 */
export function monthRange(now: number, offset = 0): MonthRange {
  const base = new Date(now)
  const start = new Date(base.getFullYear(), base.getMonth() + offset, 1)
  const end = new Date(base.getFullYear(), base.getMonth() + offset + 1, 1)
  const month = String(start.getMonth() + 1).padStart(2, '0')
  return { start: start.getTime(), end: end.getTime(), key: `${start.getFullYear()}-${month}` }
}

/** 月报对比指标（按日均计算变化，避免月份天数差异） */
const MONTHLY_METRICS = [
  { key: 'totalMilkAmount', label: 'stats.compare.totalMilk' },
  { key: 'feedCount', label: 'stats.compare.feedCount' },
  { key: 'sleepMs', label: 'stats.compare.sleepMs' },
  { key: 'diaperCount', label: 'stats.compare.diaperCount' },
  { key: 'pumpAmount', label: 'stats.compare.pumpAmount' },
  { key: 'solidFoodCount', label: 'stats.compare.solidFoodCount' },
] as const satisfies readonly { key: keyof RangeAggregate; label: string }[]

export interface MonthlyMetricRow {
  key: keyof RangeAggregate
  label: string
  current: number
  previous: number
  currentDaily: number
  previousDaily: number
  /** 按日均计算的变化百分比；上月日均 0 时为 null */
  change: number | null
}

export interface MonthlyReport {
  range: MonthRange
  previousRange: MonthRange
  current: RangeAggregate
  previous: RangeAggregate
  rows: MonthlyMetricRow[]
  growthCount: number
  hasData: boolean
}

/** 生成月报：当前月汇总 + 上一个自然月按日均对比 */
export function buildMonthlyReport(
  ds: RecordDatasets,
  growths: GrowthRecord[],
  range: MonthRange,
  now: number,
): MonthlyReport {
  const current = aggregate(ds, range.start, range.end, now)
  const previousRange = monthRange(range.start, -1)
  const previous = aggregate(ds, previousRange.start, previousRange.end, now)
  const growthCount = growths.filter((g) => g.date >= range.start && g.date < range.end).length

  const rows = MONTHLY_METRICS.map(({ key, label }) => {
    const currentDaily = current.dayCount > 0 ? current[key] / current.dayCount : 0
    const previousDaily = previous.dayCount > 0 ? previous[key] / previous.dayCount : 0
    return {
      key,
      label,
      current: current[key],
      previous: previous[key],
      currentDaily,
      previousDaily,
      change: previousDaily === 0 ? null : ((currentDaily - previousDaily) / previousDaily) * 100,
    }
  })

  const totalRecords =
    current.feedCount +
    current.diaperCount +
    current.pumpCount +
    current.solidFoodCount +
    current.medicationCount +
    current.temperatureCount +
    current.sleepMs

  return { range, previousRange, current, previous, rows, growthCount, hasData: totalRecords > 0 || growthCount > 0 }
}

/** 照护洞察（区间内的描述性统计） */
export interface CareInsights {
  days: number
  sleep: {
    avgDailyMs: number
    /** 18:00 之后入睡的平均分钟数（相对 18:00），无记录为 null */
    avgBedtimeMinutes: number | null
    /** 0:00–6:00 之间开始的睡眠次数（夜间醒来次数近似） */
    nightWakes: number
  } | null
  feed: {
    avgIntervalMs: number | null
    avgDailyAmount: number
    avgDailyCount: number
  } | null
  diaper: {
    avgDailyCount: number
    /** 尿湿占比 0-1，无记录为 null */
    wetShare: number | null
  } | null
}

function averageBedtimeMinutes(times: number[]): number | null {
  const minutes = times
    .map((t) => new Date(t))
    .filter((d) => d.getHours() >= 18)
    .map((d) => (d.getHours() - 18) * 60 + d.getMinutes())
  if (!minutes.length) return null
  return Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length)
}

function averageFeedInterval(times: number[]): number | null {
  const sorted = [...times].sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i] - sorted[i - 1]
    // 超过 12 小时的间隔视为跨天漏记，不参与平均
    if (gap > 0 && gap <= 12 * 3600_000) gaps.push(gap)
  }
  if (!gaps.length) return null
  return gaps.reduce((a, b) => a + b, 0) / gaps.length
}

/** 生成照护洞察（睡眠 / 喂养 / 尿布） */
export function buildCareInsights(
  ds: RecordDatasets,
  start: number,
  end: number,
  now: number,
): CareInsights {
  const agg = aggregate(ds, start, end, now)
  const days = Math.max(1, agg.dayCount)
  const inRange = (t: number) => t >= start && t < end

  const sleeps = ds.sleeps.filter((s) => inRange(s.startTime))
  const sleep = sleeps.length
    ? {
        avgDailyMs: agg.sleepMs / days,
        avgBedtimeMinutes: averageBedtimeMinutes(sleeps.map((s) => s.startTime)),
        nightWakes: sleeps.filter((s) => new Date(s.startTime).getHours() < 6).length,
      }
    : null

  const feedTimes = ds.feedings.filter((f) => inRange(f.startTime)).map((f) => f.startTime)
  const feed = feedTimes.length
    ? {
        avgIntervalMs: averageFeedInterval(feedTimes),
        avgDailyAmount: agg.totalMilkAmount / days,
        avgDailyCount: agg.feedCount / days,
      }
    : null

  const diaper =
    agg.diaperCount > 0
      ? {
          avgDailyCount: agg.diaperCount / days,
          wetShare: agg.wetCount / agg.diaperCount,
        }
      : null

  return { days, sleep, feed, diaper }
}

/** 成长速度：最近两次测量之间的变化速率 + 百分位变化 */
export interface GrowthVelocityItem {
  field: WhoField
  labelKey: string
  unit: 'kg' | 'cm'
  latestValue: number
  previousValue: number | null
  /** 展示速率：体重 g/周，身高/头围 cm/月 */
  rate: number | null
  rateUnit: 'g/week' | 'cm/month'
  percentile: number | null
  previousPercentile: number | null
  percentileDelta: number | null
}

const GROWTH_FIELDS = [
  {
    field: 'weight',
    labelKey: 'stats.monthly.growthWeight',
    unit: 'kg',
    rateUnit: 'g/week',
    pick: (g: GrowthRecord) => g.weight,
  },
  {
    field: 'length',
    labelKey: 'stats.monthly.growthHeight',
    unit: 'cm',
    rateUnit: 'cm/month',
    pick: (g: GrowthRecord) => g.height,
  },
  {
    field: 'hc',
    labelKey: 'stats.monthly.growthHead',
    unit: 'cm',
    rateUnit: 'cm/month',
    pick: (g: GrowthRecord) => g.headCircumference,
  },
] as const satisfies readonly {
  field: WhoField
  labelKey: string
  unit: 'kg' | 'cm'
  rateUnit: 'g/week' | 'cm/month'
  pick: (g: GrowthRecord) => number | undefined
}[]

function ratePerUnit(field: WhoField, delta: number, days: number): number {
  if (days <= 0) return 0
  if (field === 'weight') return (delta / days) * 7 * 1000
  return (delta / days) * 30.44
}

/** 生成成长速度（每个指标取最近两条有该测量的记录） */
export function buildGrowthVelocity(
  growths: GrowthRecord[],
  baby: Pick<Baby, 'gender' | 'birthDate'> | undefined,
): GrowthVelocityItem[] {
  const who = baby?.birthDate ? whoData(baby.gender) : null
  const items: GrowthVelocityItem[] = []

  for (const cfg of GROWTH_FIELDS) {
    const points = growths
      .filter((g) => cfg.pick(g) != null)
      .sort((a, b) => b.date - a.date)
    const latest = points[0]
    if (!latest) continue
    const latestValue = cfg.pick(latest)!
    const previous = points[1]
    const previousValue = previous ? (cfg.pick(previous) ?? null) : null

    const days = previous ? (latest.date - previous.date) / MS_PER_DAY : 0
    const rate = previous && previousValue != null ? ratePerUnit(cfg.field, latestValue - previousValue, days) : null

    let percentile: number | null = null
    let previousPercentile: number | null = null
    if (who && baby?.birthDate) {
      percentile = estimatePercentile(who, ageInMonths(baby.birthDate, latest.date), cfg.field, latestValue)
      if (previous && previousValue != null) {
        previousPercentile = estimatePercentile(
          who,
          ageInMonths(baby.birthDate, previous.date),
          cfg.field,
          previousValue,
        )
      }
    }

    items.push({
      field: cfg.field,
      labelKey: cfg.labelKey,
      unit: cfg.unit,
      latestValue,
      previousValue,
      rate,
      rateUnit: cfg.rateUnit,
      percentile,
      previousPercentile,
      percentileDelta:
        percentile != null && previousPercentile != null ? percentile - previousPercentile : null,
    })
  }

  return items
}
