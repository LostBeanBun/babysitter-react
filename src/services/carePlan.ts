import type { Baby, DiaperChange, Feeding, Medication, Sleep, Vaccination } from '@/types'
import { MS_PER_DAY, MS_PER_HOUR } from '@/constants'
import { ageInMonths } from '@/constants/whoGrowth'
import { recommendedIntervalMs } from '@/utils/feedingGuide'
import { startOfDay } from '@/utils/format'

/** 各月龄段参考清醒窗口（小时）：0-1 / 1-3 / 3-6 / 6-9 / 9-12 / 12+ */
const WAKE_WINDOW_HOURS: [number, number][] = [
  [0.75, 1],
  [1, 1.5],
  [1.5, 2],
  [2, 2.5],
  [2.5, 3],
  [3, 4],
]

/** 疫苗待办保留窗口：与首页提醒条保持一致 */
const VACCINE_WINDOW_DAYS = 14

/** 换尿布默认参考间隔（小时）：与提醒系统 DEFAULT_REMINDERS.diaper.intervalHours 保持一致 */
const DIAPER_DEFAULT_INTERVAL_HOURS = 3

/** 按月龄分段：0-1 / 1-3 / 3-6 / 6-9 / 9-12 / 12+ */
function bucketIndexByMonths(months: number): number {
  if (months < 1) return 0
  if (months < 3) return 1
  if (months < 6) return 2
  if (months < 9) return 3
  if (months < 12) return 4
  return 5
}

export interface CarePlanInput {
  baby?: Baby
  now: number
  feedings: Feeding[]
  diapers: DiaperChange[]
  sleeps: Sleep[]
  medications: Medication[]
  vaccinations: Vaccination[]
  /** 正在进行的喂养开始时间（来自全局计时器） */
  activeFeedingStart?: number
  /** 正在进行的睡眠开始时间（来自全局计时器） */
  activeSleepStart?: number
  /** 换尿布参考间隔（毫秒）：来自提醒设置，未配置时用默认值 */
  diaperIntervalMs?: number
}

export interface CarePlan {
  feeding: {
    lastFeeding: Feeding | null
    lastAt: number | null
    nextAt: number | null
    amount: number | null
    overdue: boolean
    activeSince: number | null
    intervalMs: number
  }
  sleep: {
    lastSleep: Sleep | null
    lastEndAt: number | null
    awakeMs: number | null
    activeSince: number | null
    wakeMinMs: number
    wakeMaxMs: number
    /** 清醒时长已超出月龄清醒窗口上限（需要关注） */
    overAwake: boolean
  }
  diaper: {
    lastAt: number | null
    /** 距上次换尿布超过参考间隔（需要关注） */
    overdue: boolean
  }
  todo: {
    vaccine: Vaccination | null
    vaccineCount: number
    medicationCount: number
    lastMedication: Medication | null
  }
  hasRecords: boolean
}

/** 按月龄返回参考清醒窗口（毫秒） */
export function wakeWindowMs(baby: Baby | undefined, now: number): { minMs: number; maxMs: number } {
  const months = baby?.birthDate ? ageInMonths(baby.birthDate, now) : 0
  const [minHours, maxHours] = WAKE_WINDOW_HOURS[bucketIndexByMonths(months)]
  return { minMs: minHours * MS_PER_HOUR, maxMs: maxHours * MS_PER_HOUR }
}

/** 汇总首页照护卡所需的最近记录与参考值（纯函数，便于两端共享同一套规则） */
export function buildCarePlan(input: CarePlanInput): CarePlan {
  const { baby, now, feedings, diapers, sleeps, medications, vaccinations } = input

  const sortedFeedings = [...feedings].sort(
    (a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime),
  )
  const lastFeeding = sortedFeedings[0] ?? null
  const lastAt = lastFeeding ? (lastFeeding.endTime ?? lastFeeding.startTime) : null
  const intervalMs = recommendedIntervalMs(baby, now)
  const activeFeedingSince = input.activeFeedingStart ?? null
  const nextAt = lastAt != null && activeFeedingSince == null ? lastAt + intervalMs : null
  const overdue = nextAt != null && nextAt <= now

  const sortedSleeps = [...sleeps]
    .filter((s) => s.endTime != null)
    .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))
  const lastSleep = sortedSleeps[0] ?? null
  const lastEndAt = lastSleep?.endTime ?? null
  const activeSleepSince = input.activeSleepStart ?? null
  const awakeMs =
    activeSleepSince == null && lastEndAt != null ? Math.max(0, now - lastEndAt) : null
  const wakeWindow = wakeWindowMs(baby, now)
  const overAwake = awakeMs != null && awakeMs > wakeWindow.maxMs

  const lastDiaper = [...diapers].sort((a, b) => b.time - a.time)[0] ?? null
  const diaperIntervalMs =
    input.diaperIntervalMs != null && input.diaperIntervalMs > 0
      ? input.diaperIntervalMs
      : DIAPER_DEFAULT_INTERVAL_HOURS * MS_PER_HOUR
  const diaperOverdue = lastDiaper != null && now - lastDiaper.time > diaperIntervalMs

  const todayStart = startOfDay(now)
  const vaccineCutoff = todayStart - VACCINE_WINDOW_DAYS * MS_PER_DAY
  const upcomingVaccines = vaccinations
    .filter((v) => v.status === 'planned' && v.date >= vaccineCutoff)
    .sort((a, b) => a.date - b.date)
  const lastMedication =
    [...medications]
      .filter((m) => m.time >= todayStart && m.time <= now)
      .sort((a, b) => b.time - a.time)[0] ?? null
  const medicationCount = medications.filter((m) => m.time >= todayStart && m.time <= now).length

  return {
    feeding: {
      lastFeeding,
      lastAt,
      nextAt,
      amount: lastFeeding?.amount ?? null,
      overdue,
      activeSince: activeFeedingSince,
      intervalMs,
    },
    sleep: {
      lastSleep,
      lastEndAt,
      awakeMs,
      activeSince: activeSleepSince,
      wakeMinMs: wakeWindow.minMs,
      wakeMaxMs: wakeWindow.maxMs,
      overAwake,
    },
    diaper: {
      lastAt: lastDiaper?.time ?? null,
      overdue: diaperOverdue,
    },
    todo: {
      vaccine: upcomingVaccines[0] ?? null,
      vaccineCount: upcomingVaccines.length,
      medicationCount,
      lastMedication,
    },
    hasRecords:
      feedings.length > 0 || sleeps.length > 0 || medications.length > 0 || vaccinations.length > 0,
  }
}
