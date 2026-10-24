import type {
  Baby,
  DiaperChange,
  Feeding,
  Medication,
  Pumping,
  Sleep,
  Temperature,
  Vaccination,
} from '@/types'
import { MS_PER_DAY } from '@/constants'
import { buildCarePlan } from '@/services/carePlan'
import { upcomingVaccinations, vaccineDaysLeft } from '@/services/reminders'
import { formatClock, formatDate, formatDuration, startOfDay } from '@/utils/format'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface HandoffInput {
  baby?: Baby
  now: number
  feedings: Feeding[]
  diapers: DiaperChange[]
  pumpings: Pumping[]
  sleeps: Sleep[]
  medications: Medication[]
  vaccinations: Vaccination[]
  temperatures: Temperature[]
  activeFeedingStart?: number
  activeSleepStart?: number
}

export interface HandoffSummary {
  windowStart: number
  windowEnd: number
  feedCount: number
  feedAmount: number
  lastFeeding: Feeding | null
  diaperCount: number
  wetCount: number
  dirtyCount: number
  lastDiaper: DiaperChange | null
  sleepMs: number
  lastSleep: Sleep | null
  activeSleepStart: number | null
  pumpCount: number
  pumpAmount: number
  medicationCount: number
  lastMedication: Medication | null
  lastTemperature: Temperature | null
  nextVaccine: Vaccination | null
  nextFeedAt: number | null
  awakeMs: number | null
}

/** 汇总最近 24 小时的交接数据；数量按窗口统计，最近一次事件取全部记录 */
export function buildHandoffSummary(input: HandoffInput): HandoffSummary {
  const { baby, now, feedings, diapers, pumpings, sleeps, medications, vaccinations, temperatures } =
    input
  const windowStart = now - MS_PER_DAY
  const windowEnd = now
  const inWindow = (ts: number) => ts >= windowStart && ts <= windowEnd

  const windowFeedings = feedings.filter((f) => inWindow(f.startTime))
  const lastFeeding =
    [...feedings].sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))[0] ??
    null
  const feedAmount = windowFeedings.reduce((sum, f) => sum + (f.amount ?? 0), 0)

  const windowDiapers = diapers.filter((d) => inWindow(d.time))
  const lastDiaper = [...diapers].sort((a, b) => b.time - a.time)[0] ?? null
  const wetCount = windowDiapers.filter((d) => d.type === 'wet' || d.type === 'both').length
  const dirtyCount = windowDiapers.filter((d) => d.type === 'dirty' || d.type === 'both').length

  const windowSleeps = sleeps.filter((s) => (s.endTime ?? s.startTime) >= windowStart)
  let sleepMs = windowSleeps.reduce((sum, s) => {
    const start = Math.max(s.startTime, windowStart)
    const end = Math.min(s.endTime ?? s.startTime, windowEnd)
    return sum + Math.max(0, end - start)
  }, 0)
  const lastSleep =
    [...sleeps]
      .filter((s) => s.endTime != null)
      .sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))[0] ?? null
  const activeSleepStart = input.activeSleepStart ?? null
  if (activeSleepStart != null) {
    sleepMs += Math.max(0, windowEnd - Math.max(activeSleepStart, windowStart))
  }

  const windowPumpings = pumpings.filter((p) => inWindow(p.startTime))
  const pumpAmount = windowPumpings.reduce((sum, p) => sum + (p.amount ?? 0), 0)

  const windowMedications = medications.filter((m) => inWindow(m.time))
  const lastMedication =
    [...medications].sort((a, b) => b.time - a.time).find((m) => inWindow(m.time)) ?? null

  const windowTemperatures = temperatures.filter((t) => inWindow(t.time))
  const lastTemperature =
    [...windowTemperatures].sort((a, b) => b.time - a.time)[0] ?? null

  const plan = buildCarePlan({
    baby,
    now,
    feedings,
    sleeps,
    medications,
    vaccinations,
    activeFeedingStart: input.activeFeedingStart,
    activeSleepStart: activeSleepStart ?? undefined,
  })
  const nextVaccine =
    upcomingVaccinations(vaccinations, startOfDay(now), 1)[0] ?? plan.todo.vaccine

  return {
    windowStart,
    windowEnd,
    feedCount: windowFeedings.length,
    feedAmount,
    lastFeeding,
    diaperCount: windowDiapers.length,
    wetCount,
    dirtyCount,
    lastDiaper,
    sleepMs,
    lastSleep,
    activeSleepStart,
    pumpCount: windowPumpings.length,
    pumpAmount,
    medicationCount: windowMedications.length,
    lastMedication,
    lastTemperature,
    nextVaccine,
    nextFeedAt: plan.feeding.nextAt,
    awakeMs: plan.sleep.awakeMs,
  }
}

/** 交接摘要文本：复制 / 系统分享共用同一份内容 */
export function formatHandoffText(
  summary: HandoffSummary,
  t: Translate,
  babyName: string,
): string {
  const now = summary.windowEnd
  const todayStart = startOfDay(now)
  const when = (ts: number): string => {
    if (ts >= todayStart) return formatClock(ts)
    if (ts >= todayStart - MS_PER_DAY) return t('care.yesterday', { time: formatClock(ts) })
    return `${formatDate(ts).slice(5)} ${formatClock(ts)}`
  }
  const lines: string[] = [
    t('care.handoffTitle'),
    t('care.handoffBaby', { name: babyName, time: `${formatDate(now)} ${formatClock(now)}` }),
    '',
    t('care.last24h'),
  ]

  const hasWindowData =
    summary.feedCount > 0 ||
    summary.diaperCount > 0 ||
    summary.sleepMs > 0 ||
    summary.pumpCount > 0 ||
    summary.medicationCount > 0 ||
    summary.lastTemperature != null

  if (!hasWindowData) {
    lines.push(t('care.noData'))
  } else {
    if (summary.feedCount > 0) {
      lines.push(
        t('care.feedingLine', {
          count: summary.feedCount,
          milk:
            summary.feedAmount > 0
              ? t('care.feedingMilk', { amount: summary.feedAmount })
              : '',
        }),
      )
    } else {
      lines.push(t('care.noFeeding'))
    }
    if (summary.lastFeeding) {
      lines.push(
        t('care.lastFeedingLine', {
          time: when(summary.lastFeeding.endTime ?? summary.lastFeeding.startTime),
          amount:
            summary.lastFeeding.amount != null
              ? t('care.feedAmount', { amount: summary.lastFeeding.amount })
              : '',
        }),
      )
    }

    if (summary.sleepMs > 0) {
      lines.push(t('care.sleepLine', { duration: formatDuration(summary.sleepMs) }))
    } else {
      lines.push(t('care.noSleep'))
    }
    if (summary.activeSleepStart != null) {
      lines.push(
        t('care.sleepingLine', { duration: formatDuration(now - summary.activeSleepStart) }),
      )
    } else if (summary.lastSleep?.endTime != null) {
      lines.push(
        t('care.lastSleepLine', {
          start: when(summary.lastSleep.startTime),
          end: when(summary.lastSleep.endTime),
        }),
      )
    }

    if (summary.diaperCount > 0) {
      lines.push(
        t('care.diaperLine', {
          count: summary.diaperCount,
          wet: summary.wetCount,
          dirty: summary.dirtyCount,
        }),
      )
    } else {
      lines.push(t('care.noDiaper'))
    }
    if (summary.lastDiaper) {
      lines.push(t('care.lastDiaperLine', { time: when(summary.lastDiaper.time) }))
    }

    if (summary.pumpCount > 0) {
      lines.push(
        t('care.pumpLine', { count: summary.pumpCount, amount: summary.pumpAmount }),
      )
    }
    if (summary.medicationCount > 0) {
      lines.push(t('care.medicationLine', { count: summary.medicationCount }))
    }
    if (summary.lastMedication) {
      lines.push(
        t('care.lastMedicationLine', {
          time: when(summary.lastMedication.time),
          name: summary.lastMedication.name,
          dose: summary.lastMedication.dose ? ` ${summary.lastMedication.dose}` : '',
        }),
      )
    }
    if (summary.lastTemperature) {
      lines.push(t('care.tempLine', { value: summary.lastTemperature.value }))
    }
  }

  if (summary.nextVaccine) {
    const n = vaccineDaysLeft(summary.nextVaccine.date, todayStart)
    const badge =
      n === 0
        ? t('care.vaccineToday')
        : n > 0
          ? t('care.vaccineDays', { n })
          : t('care.vaccineOverdue', { n: -n })
    lines.push(
      t('care.todoLine', {
        name: summary.nextVaccine.name,
        dose: summary.nextVaccine.dose ? t('care.vaccineDose', { dose: summary.nextVaccine.dose }) : '',
        badge,
      }),
    )
  }

  if (summary.nextFeedAt != null || summary.awakeMs != null) {
    lines.push('', t('care.reference'))
    if (summary.nextFeedAt != null) {
      lines.push(t('care.nextFeedLine', { time: formatClock(summary.nextFeedAt) }))
    }
    if (summary.awakeMs != null) {
      lines.push(t('care.awakeLine', { duration: formatDuration(summary.awakeMs) }))
    }
  }

  lines.push('', t('care.disclaimer'))
  return lines.join('\n')
}
