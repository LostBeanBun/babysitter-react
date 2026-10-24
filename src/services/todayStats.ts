import type { Feeding, DiaperChange, Pumping, Sleep } from '@/types'

/** 今日统计输入：仅包含今日（且已过滤删除中）的记录与当日边界 */
export interface TodayStatsInput {
  feedings: Feeding[]
  diapers: DiaperChange[]
  pumpings: Pumping[]
  sleeps: Sleep[]
  todayStart: number
  todayEnd: number
}

/** 今日汇总统计 */
export interface TodayStats {
  /** 今日喂养总奶量（ml） */
  totalMilk: number
  /** 今日喂养次数 */
  feedCount: number
  /** 今日泵奶次数 */
  pumpCount: number
  /** 今日泵出总量（ml） */
  pumpTotal: number
  /** 今日瓶喂母乳消耗量（ml） */
  bottleBreastmilkTotal: number
  /** 母乳库存 = 泵出 − 瓶喂母乳消耗（可为负） */
  breastStock: number
  /** 今日睡眠时长（ms，跨天睡眠按当日边界裁剪） */
  sleepMs: number
  /** 今日更换尿布次数 */
  diaperCount: number
}

/** 计算今日汇总统计（入参需为今日记录） */
export function computeTodayStats(input: TodayStatsInput): TodayStats {
  const { feedings, diapers, pumpings, sleeps, todayStart, todayEnd } = input

  const totalMilk = feedings.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  const pumpTotal = pumpings.reduce((s, p) => s + (p.amount ?? 0), 0)
  const bottleBreastmilkTotal = feedings
    .filter((f) => f.type === 'bottle_breastmilk')
    .reduce((s, f) => s + (f.amount ?? 0), 0)

  const sleepMs = sleeps.reduce((sum, s) => {
    const s0 = Math.max(s.startTime, todayStart)
    const e0 = Math.min(s.endTime ?? s.startTime, todayEnd)
    return sum + Math.max(0, e0 - s0)
  }, 0)

  return {
    totalMilk,
    feedCount: feedings.length,
    pumpCount: pumpings.length,
    pumpTotal,
    bottleBreastmilkTotal,
    breastStock: pumpTotal - bottleBreastmilkTotal,
    sleepMs,
    diaperCount: diapers.length,
  }
}
