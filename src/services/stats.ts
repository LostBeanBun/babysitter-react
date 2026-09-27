import type { Feeding, DiaperChange, Pumping, Sleep, SolidFood, Medication, Temperature } from '@/types'
import { startOfDay, formatDate } from '@/utils/format'
import { MS_PER_DAY } from '@/constants'

/** 单日聚合数据 */
export interface DayAggregate {
  date: string // YYYY-MM-DD
  dayStart: number
  /** 总瓶喂奶量 ml（瓶喂母乳 + 配方奶） */
  bottleAmount: number
  breastMilkAmount: number
  formulaAmount: number
  /** 总奶量（含亲喂估算 0 + 瓶喂） */
  totalMilkAmount: number
  /** 亲喂次数（左/右/双） */
  breastCount: number
  /** 瓶喂次数 */
  bottleCount: number
  /** 喂养总次数 */
  feedCount: number
  /** 睡眠时长 ms */
  sleepMs: number
  /** 小睡次数 */
  napCount: number
  /** 夜间睡眠次数 */
  nightCount: number
  /** 尿布更换总数 */
  diaperCount: number
  wetCount: number
  dirtyCount: number
  /** 吸奶总量 ml */
  pumpAmount: number
  /** 吸奶次数 */
  pumpCount: number
  /** 吸奶总时长 ms */
  pumpMs: number
  /** 辅食次数 */
  solidFoodCount: number
  /** 用药次数 */
  medicationCount: number
  /** 体温测量次数 */
  temperatureCount: number
  /** 当日体温平均值 ℃（无记录为 0） */
  temperatureAvg: number
}

/** 生成空聚合 */
export function emptyDay(dayStart: number): DayAggregate {
  return {
    date: formatDate(dayStart),
    dayStart,
    bottleAmount: 0,
    breastMilkAmount: 0,
    formulaAmount: 0,
    totalMilkAmount: 0,
    breastCount: 0,
    bottleCount: 0,
    feedCount: 0,
    sleepMs: 0,
    napCount: 0,
    nightCount: 0,
    diaperCount: 0,
    wetCount: 0,
    dirtyCount: 0,
    pumpAmount: 0,
    pumpCount: 0,
    pumpMs: 0,
    solidFoodCount: 0,
    medicationCount: 0,
    temperatureCount: 0,
    temperatureAvg: 0,
  }
}

/** 区间聚合（含奶量细分） */
export interface RangeAggregate {
  dayCount: number
  totalMilkAmount: number
  breastMilkAmount: number
  formulaAmount: number
  feedCount: number
  breastCount: number
  bottleCount: number
  sleepMs: number
  napCount: number
  nightCount: number
  diaperCount: number
  wetCount: number
  dirtyCount: number
  pumpAmount: number
  pumpCount: number
  pumpMs: number
  solidFoodCount: number
  medicationCount: number
  temperatureCount: number
}

/** 生成从 start 到 end（不含）的每日序列 */
export function buildDailySeries(
  feedings: Feeding[],
  diapers: DiaperChange[],
  pumpings: Pumping[],
  sleeps: Sleep[],
  start: number,
  end: number,
  solidFoods: SolidFood[] = [],
  medications: Medication[] = [],
  temperatures: Temperature[] = [],
): DayAggregate[] {
  const days: DayAggregate[] = []
  const startDay = startOfDay(start)
  const endDay = startOfDay(end)
  // 按日历日进位，避免 +MS_PER_DAY 在 DST 切换后偏离本地 0 点
  for (let t = startDay; t < endDay; ) {
    days.push(emptyDay(t))
    const d = new Date(t)
    t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  }
  const dayMap = new Map<number, DayAggregate>()
  for (const d of days) dayMap.set(d.dayStart, d)

  // 睡眠可能跨天，按开始时间归到当天
  for (const s of sleeps) {
    const d = dayMap.get(startOfDay(s.startTime))
    if (!d) continue
    const span = s.endTime != null ? s.endTime - s.startTime : (s.duration ?? 0)
    d.sleepMs += Math.max(0, span)
    if (s.type === 'nap') d.napCount++
    else d.nightCount++
  }

  for (const f of feedings) {
    const d = dayMap.get(startOfDay(f.startTime))
    if (!d) continue
    d.feedCount++
    if (f.type === 'breast') {
      d.breastCount++
      // 亲喂量按估算：无奶量数据，仅计数
    } else {
      d.bottleCount++
      const amt = f.amount ?? 0
      d.bottleAmount += amt
      if (f.type === 'bottle_formula') {
        d.formulaAmount += amt
      } else {
        d.breastMilkAmount += amt
      }
      d.totalMilkAmount += amt
    }
  }

  for (const p of pumpings) {
    const d = dayMap.get(startOfDay(p.startTime))
    if (!d) continue
    d.pumpCount++
    d.pumpAmount += p.amount ?? 0
    d.pumpMs += p.duration ?? 0
  }

  for (const dp of diapers) {
    const d = dayMap.get(startOfDay(dp.time))
    if (!d) continue
    d.diaperCount++
    if (dp.type === 'wet' || dp.type === 'both') d.wetCount++
    if (dp.type === 'dirty' || dp.type === 'both') d.dirtyCount++
  }

  for (const sf of solidFoods) {
    const d = dayMap.get(startOfDay(sf.time))
    if (!d) continue
    d.solidFoodCount++
  }

  for (const m of medications) {
    const d = dayMap.get(startOfDay(m.time))
    if (!d) continue
    d.medicationCount++
  }

  // 体温：每天聚合次数与均值
  for (const tmp of temperatures) {
    const d = dayMap.get(startOfDay(tmp.time))
    if (!d) continue
    d.temperatureCount++
    d.temperatureAvg += tmp.value
  }
  for (const d of days) {
    if (d.temperatureCount > 0) d.temperatureAvg = d.temperatureAvg / d.temperatureCount
  }

  return days
}

/** 区间汇总（用于对比面板） */
export function aggregateRange(
  feedings: Feeding[],
  diapers: DiaperChange[],
  pumpings: Pumping[],
  sleeps: Sleep[],
  start: number,
  end: number,
  solidFoods: SolidFood[] = [],
  medications: Medication[] = [],
  temperatures: Temperature[] = [],
): RangeAggregate {
  const days = buildDailySeries(feedings, diapers, pumpings, sleeps, start, end, solidFoods, medications, temperatures)
  const agg: RangeAggregate = {
    dayCount: days.length,
    totalMilkAmount: 0,
    breastMilkAmount: 0,
    formulaAmount: 0,
    feedCount: 0,
    breastCount: 0,
    bottleCount: 0,
    sleepMs: 0,
    napCount: 0,
    nightCount: 0,
    diaperCount: 0,
    wetCount: 0,
    dirtyCount: 0,
    pumpAmount: 0,
    pumpCount: 0,
    pumpMs: 0,
    solidFoodCount: 0,
    medicationCount: 0,
    temperatureCount: 0,
  }
  for (const d of days) {
    agg.totalMilkAmount += d.totalMilkAmount
    agg.breastMilkAmount += d.breastMilkAmount
    agg.formulaAmount += d.formulaAmount
    agg.feedCount += d.feedCount
    agg.breastCount += d.breastCount
    agg.bottleCount += d.bottleCount
    agg.sleepMs += d.sleepMs
    agg.napCount += d.napCount
    agg.nightCount += d.nightCount
    agg.diaperCount += d.diaperCount
    agg.wetCount += d.wetCount
    agg.dirtyCount += d.dirtyCount
    agg.pumpAmount += d.pumpAmount
    agg.pumpCount += d.pumpCount
    agg.pumpMs += d.pumpMs
    agg.solidFoodCount += d.solidFoodCount
    agg.medicationCount += d.medicationCount
    agg.temperatureCount += d.temperatureCount
  }
  return agg
}

/** 区间比较结果：当前 vs 上一周期 */
export interface ComparisonResult {
  key: string
  label: string
  current: number
  previous: number
  /** 变化百分比，previous 为 0 时返回 null */
  change: number | null
  /** 每日均值（当前周期） */
  dailyAvg: number
}

/** 比较两个区间各指标（label 为 i18n key） */
export function compareRanges(current: RangeAggregate, previous: RangeAggregate): ComparisonResult[] {
  const items: { key: string; label: string; current: number; previous: number }[] = [
    {
      key: 'totalMilkAmount',
      label: 'stats.compare.totalMilk',
      current: current.totalMilkAmount,
      previous: previous.totalMilkAmount,
    },
    {
      key: 'breastMilkAmount',
      label: 'stats.compare.bottleMilk',
      current: current.breastMilkAmount,
      previous: previous.breastMilkAmount,
    },
    {
      key: 'formulaAmount',
      label: 'stats.compare.formula',
      current: current.formulaAmount,
      previous: previous.formulaAmount,
    },
    { key: 'feedCount', label: 'stats.compare.feedCount', current: current.feedCount, previous: previous.feedCount },
    {
      key: 'breastCount',
      label: 'stats.compare.breastCount',
      current: current.breastCount,
      previous: previous.breastCount,
    },
    { key: 'sleepMs', label: 'stats.compare.sleepMs', current: current.sleepMs, previous: previous.sleepMs },
    {
      key: 'diaperCount',
      label: 'stats.compare.diaperCount',
      current: current.diaperCount,
      previous: previous.diaperCount,
    },
    {
      key: 'pumpAmount',
      label: 'stats.compare.pumpAmount',
      current: current.pumpAmount,
      previous: previous.pumpAmount,
    },
    { key: 'pumpCount', label: 'stats.compare.pumpCount', current: current.pumpCount, previous: previous.pumpCount },
    {
      key: 'solidFoodCount',
      label: 'stats.compare.solidFoodCount',
      current: current.solidFoodCount,
      previous: previous.solidFoodCount,
    },
    {
      key: 'medicationCount',
      label: 'stats.compare.medicationCount',
      current: current.medicationCount,
      previous: previous.medicationCount,
    },
    {
      key: 'temperatureCount',
      label: 'stats.compare.temperatureCount',
      current: current.temperatureCount,
      previous: previous.temperatureCount,
    },
  ]

  return items.map((item) => {
    // previous 为 0 时无法计算百分比变化
    const change =
      item.previous === 0 ? null : ((item.current - item.previous) / item.previous) * 100
    const dailyAvg = current.dayCount > 0 ? item.current / current.dayCount : 0
    return {
      key: item.key,
      label: item.label,
      current: item.current,
      previous: item.previous,
      change,
      dailyAvg,
    }
  })
}

/** 常用预设区间 */
export interface RangePreset {
  key: string
  label: string
  /** 返回 [start, end] 毫秒时间戳 */
  getRange: (now: number) => [number, number]
}

export const RANGE_PRESETS: RangePreset[] = [
  {
    key: 'today',
    label: 'stats.periods.today',
    getRange: (now) => {
      const s = startOfDay(now)
      return [s, s + MS_PER_DAY]
    },
  },
  {
    key: '7d',
    label: 'stats.periods.week7',
    getRange: (now) => {
      const s = startOfDay(now) - 6 * MS_PER_DAY
      return [s, startOfDay(now) + MS_PER_DAY]
    },
  },
  {
    key: '14d',
    label: 'stats.periods.week14',
    getRange: (now) => {
      const s = startOfDay(now) - 13 * MS_PER_DAY
      return [s, startOfDay(now) + MS_PER_DAY]
    },
  },
  {
    key: '30d',
    label: 'stats.periods.week30',
    getRange: (now) => {
      const s = startOfDay(now) - 29 * MS_PER_DAY
      return [s, startOfDay(now) + MS_PER_DAY]
    },
  },
  {
    key: 'month',
    label: 'stats.periods.month',
    getRange: (now) => {
      const d = new Date(now)
      const s = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
      return [s, e]
    },
  },
    {
      key: 'all',
      label: 'stats.periods.all',
      // 用有限上界：MAX_SAFE_INTEGER 会使 startOfDay 得到 NaN，日序列直接变空
      getRange: (now) => [0, startOfDay(now) + MS_PER_DAY],
    },
]

/** 对比预设：当前区间 vs 前一个等长区间 */
export function getComparisonRange(
  presetKey: string,
  now: number,
): { current: [number, number]; previous: [number, number]; currentLabel: string; previousLabel: string } | null {
  const preset = RANGE_PRESETS.find((p) => p.key === presetKey)
  if (!preset) return null
  const [start, end] = preset.getRange(now)
  const len = end - start
  const previousStart = start - len
  return {
    current: [start, end],
    previous: [previousStart, start],
    currentLabel: preset.label,
    previousLabel: 'stats.previous',
  }
}
