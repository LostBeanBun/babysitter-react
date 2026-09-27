import type { Baby } from '@/types'
import { ageInMonths } from '@/constants/whoGrowth'
import i18n from '@/i18n'

const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never))

/** 按月龄返回推荐喂奶间隔（毫秒），参考常见育儿指南 */
export function recommendedIntervalMs(baby?: Baby): number {
  const months = baby?.birthDate ? ageInMonths(baby.birthDate, Date.now()) : 0
  if (months < 1) return 2.5 * 3600_000
  if (months < 3) return 3 * 3600_000
  if (months < 6) return 3.5 * 3600_000
  if (months < 9) return 4 * 3600_000
  if (months < 12) return 4.5 * 3600_000
  return 5 * 3600_000
}

/** 推荐间隔的人类可读文案（如「约 3 小时」） */
export function recommendedIntervalLabel(baby?: Baby): string {
  const ms = recommendedIntervalMs(baby)
  const h = ms / 3600_000
  return t('feed.aboutHours', { h })
}

/** 最近 N 次喂养的平均间隔（毫秒），不足 2 次返回 null */
export function avgFeedingIntervalMs(startTimes: number[], count = 3): number | null {
  const sorted = [...startTimes].sort((a, b) => b - a).slice(0, count + 1)
  if (sorted.length < 2) return null
  const gaps: number[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i] - sorted[i + 1])
  }
  return gaps.reduce((s, g) => s + g, 0) / gaps.length
}

/** 距上次喂养的时长（毫秒） */
export function sinceLastFeedingMs(lastStart: number, now: number): number {
  return Math.max(0, now - lastStart)
}
