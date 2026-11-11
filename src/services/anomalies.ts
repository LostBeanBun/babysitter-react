/**
 * 异常提示：近 3 个完整自然日 vs 前 7 个完整自然日的日均对比 + 近 24 小时体温。
 *
 * 只做描述性提示（多了 / 少了 / 偏高），不做健康判断，也不替代就医建议；
 * 两个窗口都取「完整自然日」，避免今天还没过完就被误判成骤降。
 */
import type { DiaperChange, Feeding, Sleep, Temperature } from '@/types'
import { MS_PER_DAY, MS_PER_HOUR } from '@/constants'
import { startOfDay } from '@/utils/format'

/** 对比窗口：最近 N 个完整自然日 */
export const RECENT_DAYS = 3
/** 基线窗口：再往前 N 个完整自然日 */
export const BASELINE_DAYS = 7
/** 视为明显变化的最小相对幅度 */
export const ANOMALY_THRESHOLD = 0.3
/** 体温提示阈值（℃）：只描述读数，不做医疗判断 */
export const TEMPERATURE_WATCH = 37.5
/** 体温观察窗口（小时） */
export const TEMPERATURE_WINDOW_HOURS = 24
/** 基线日均过低时不提示，避免少量记录被放大成「骤降」 */
const MIN_BASELINE = { feed: 3, diaper: 4, sleepMs: MS_PER_HOUR } as const

export type AnomalyKey = 'feedDrop' | 'diaperDrop' | 'sleepUp' | 'sleepDown' | 'temperature'
export type AnomalyTone = 'watch' | 'info'

export interface AnomalyHint {
  key: AnomalyKey
  tone: AnomalyTone
  /** 近 3 天日均（体温为近 24 小时最高读数） */
  recent: number
  /** 前 7 天日均（体温为 0） */
  baseline: number
  /** 相对基线的变化（正=上升；体温为 0） */
  change: number
}

export interface AnomalyInput {
  now: number
  feedings: Feeding[]
  diapers: DiaperChange[]
  sleeps: Sleep[]
  temperatures: Temperature[]
}

/** 展示优先级：体温 > 喂养骤降 > 尿布骤降 > 睡眠减少 > 睡眠增多 */
const PRIORITY: Record<AnomalyKey, number> = {
  temperature: 0,
  feedDrop: 1,
  diaperDrop: 2,
  sleepDown: 3,
  sleepUp: 4,
}

function countIn(times: number[], start: number, end: number): number {
  let n = 0
  for (const ts of times) if (ts >= start && ts < end) n++
  return n
}

/** 睡眠与窗口的重叠时长（进行中的睡眠按窗口末尾截断） */
function sleepOverlapMs(sleep: Sleep, start: number, end: number): number {
  const from = Math.max(sleep.startTime, start)
  const to = Math.min(sleep.endTime ?? end, end)
  return Math.max(0, to - from)
}

function changeOf(recentDaily: number, baselineDaily: number): number {
  if (baselineDaily <= 0) return 0
  return (recentDaily - baselineDaily) / baselineDaily
}

/** 生成异常提示（无足够基线数据时返回空数组） */
export function buildAnomalyHints(input: AnomalyInput): AnomalyHint[] {
  const { now, feedings, diapers, sleeps, temperatures } = input
  const todayStart = startOfDay(now)
  const recentStart = todayStart - RECENT_DAYS * MS_PER_DAY
  const baselineStart = recentStart - BASELINE_DAYS * MS_PER_DAY
  const hints: AnomalyHint[] = []

  // 喂养次数：日均下降 ≥ 30%
  const recentFeed =
    countIn(
      feedings.map((f) => f.startTime),
      recentStart,
      todayStart,
    ) / RECENT_DAYS
  const baseFeed =
    countIn(
      feedings.map((f) => f.startTime),
      baselineStart,
      recentStart,
    ) / BASELINE_DAYS
  if (baseFeed >= MIN_BASELINE.feed) {
    const change = changeOf(recentFeed, baseFeed)
    if (change <= -ANOMALY_THRESHOLD) {
      hints.push({ key: 'feedDrop', tone: 'watch', recent: recentFeed, baseline: baseFeed, change })
    }
  }

  // 尿布次数：日均下降 ≥ 30%
  const recentDiaper =
    countIn(
      diapers.map((d) => d.time),
      recentStart,
      todayStart,
    ) / RECENT_DAYS
  const baseDiaper =
    countIn(
      diapers.map((d) => d.time),
      baselineStart,
      recentStart,
    ) / BASELINE_DAYS
  if (baseDiaper >= MIN_BASELINE.diaper) {
    const change = changeOf(recentDiaper, baseDiaper)
    if (change <= -ANOMALY_THRESHOLD) {
      hints.push({
        key: 'diaperDrop',
        tone: 'watch',
        recent: recentDiaper,
        baseline: baseDiaper,
        change,
      })
    }
  }

  // 睡眠时长：日均变化 ≥ 30%（减少需留意，增多仅作提示）
  const recentSleep =
    sleeps.reduce((sum, s) => sum + sleepOverlapMs(s, recentStart, todayStart), 0) / RECENT_DAYS
  const baseSleep =
    sleeps.reduce((sum, s) => sum + sleepOverlapMs(s, baselineStart, recentStart), 0) / BASELINE_DAYS
  if (baseSleep >= MIN_BASELINE.sleepMs) {
    const change = changeOf(recentSleep, baseSleep)
    if (Math.abs(change) >= ANOMALY_THRESHOLD) {
      hints.push({
        key: change < 0 ? 'sleepDown' : 'sleepUp',
        tone: change < 0 ? 'watch' : 'info',
        recent: recentSleep,
        baseline: baseSleep,
        change,
      })
    }
  }

  // 体温：近 24 小时最高读数达到提示阈值
  const tempFrom = now - TEMPERATURE_WINDOW_HOURS * MS_PER_HOUR
  const highTemps = temperatures.filter(
    (t) => t.time >= tempFrom && t.time <= now && t.value >= TEMPERATURE_WATCH,
  )
  if (highTemps.length > 0) {
    hints.push({
      key: 'temperature',
      tone: 'watch',
      recent: Math.max(...highTemps.map((t) => t.value)),
      baseline: 0,
      change: 0,
    })
  }

  return hints.sort((a, b) => PRIORITY[a.key] - PRIORITY[b.key])
}
