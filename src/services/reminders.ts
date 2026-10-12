import type { Vaccination } from '@/types'
import { MS_PER_DAY } from '@/constants'

/** 疫苗提醒窗口：逾期该种未种的计划在窗口内仍提醒 */
const REMIND_WINDOW_DAYS = 14
/** 提醒条最多展示的疫苗条数 */
const MAX_REMIND_ITEMS = 3

/**
 * 即将接种/逾期未种的提醒列表：
 * planned 状态、日期在 todayStart - 14 天之后（逾期未种也提醒），按日期升序取前 limit 条。
 */
export function upcomingVaccinations(
  vaccinations: Vaccination[],
  todayStart: number,
  limit = MAX_REMIND_ITEMS,
): Vaccination[] {
  const cutoff = todayStart - REMIND_WINDOW_DAYS * MS_PER_DAY
  return vaccinations
    .filter((v) => v.status === 'planned' && v.date >= cutoff)
    .sort((a, b) => a.date - b.date)
    .slice(0, limit)
}

/** 距接种日天数：今天为 0，未来为正，逾期为负 */
export function vaccineDaysLeft(date: number, todayStart: number): number {
  return Math.round((date - todayStart) / MS_PER_DAY)
}
