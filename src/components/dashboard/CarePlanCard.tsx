'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBabies } from '@/stores/baby'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { buildCarePlan } from '@/services/carePlan'
import { buildHandoffSummary, formatHandoffText } from '@/services/handoff'
import { vaccineDaysLeft } from '@/services/reminders'
import { formatClock, formatDate, formatDuration, startOfDay } from '@/utils/format'
import { MS_PER_DAY } from '@/constants'
import HandoffModal from '@/components/dashboard/HandoffModal'
import type { RecordKind, Vaccination } from '@/types'
import s from './CarePlanCard.module.css'

export interface CarePlanCardProps {
  now: number
  onAdd: (kind: RecordKind) => void
  onEditVaccination: (v: Vaccination) => void
}

function keep<T extends { id?: number }>(
  items: T[],
  kind: string,
  isPending: (target: { kind: string; id: number }) => boolean,
): T[] {
  return items.filter((x) => !isPending({ kind, id: x.id! }))
}

/** 今日照护卡：下次喂养参考 + 清醒窗口 + 今日待办 + 交接摘要 */
export default function CarePlanCard({ now, onAdd, onEditVaccination }: CarePlanCardProps) {
  const { t } = useTranslation()
  const { activeBaby, activeBabyId } = useBabies()
  const { isPending } = useDeleteUndo()
  const activeTimer = useActiveTimer()

  const feedingsResult = useRecordsLive('feedings', activeBabyId)
  const diapersResult = useRecordsLive('diapers', activeBabyId)
  const pumpingsResult = useRecordsLive('pumpings', activeBabyId)
  const sleepsResult = useRecordsLive('sleeps', activeBabyId)
  const medicationsResult = useRecordsLive('medications', activeBabyId)
  const vaccinationsResult = useRecordsLive('vaccinations', activeBabyId)
  const temperaturesResult = useRecordsLive('temperatures', activeBabyId)

  const feedings = useMemo(
    () => keep(feedingsResult ?? [], 'feeding', isPending),
    [feedingsResult, isPending],
  )
  const diapers = useMemo(
    () => keep(diapersResult ?? [], 'diaper', isPending),
    [diapersResult, isPending],
  )
  const pumpings = useMemo(
    () => keep(pumpingsResult ?? [], 'pumping', isPending),
    [pumpingsResult, isPending],
  )
  const sleeps = useMemo(
    () => keep(sleepsResult ?? [], 'sleep', isPending),
    [sleepsResult, isPending],
  )
  const medications = useMemo(
    () => keep(medicationsResult ?? [], 'medication', isPending),
    [medicationsResult, isPending],
  )
  const vaccinations = useMemo(
    () => keep(vaccinationsResult ?? [], 'vaccination', isPending),
    [vaccinationsResult, isPending],
  )
  const temperatures = useMemo(
    () => keep(temperaturesResult ?? [], 'temperature', isPending),
    [temperaturesResult, isPending],
  )

  const activeFeedingStart = useMemo(() => {
    const active = activeTimer.records.find((r) => r.kind === 'feeding')
    if (!active) return undefined
    return feedings.find((f) => f.id === active.recordId)?.startTime ?? active.startTime
  }, [activeTimer.records, feedings])

  const activeSleepStart = useMemo(() => {
    const active = activeTimer.records.find((r) => r.kind === 'sleep')
    if (!active) return undefined
    return sleeps.find((sl) => sl.id === active.recordId)?.startTime ?? active.startTime
  }, [activeTimer.records, sleeps])

  const plan = useMemo(
    () =>
      buildCarePlan({
        baby: activeBaby,
        now,
        feedings,
        sleeps,
        medications,
        vaccinations,
        activeFeedingStart,
        activeSleepStart,
      }),
    [
      activeBaby,
      now,
      feedings,
      sleeps,
      medications,
      vaccinations,
      activeFeedingStart,
      activeSleepStart,
    ],
  )

  const [handoffOpen, setHandoffOpen] = useState(false)
  const handoffSummary = useMemo(
    () =>
      buildHandoffSummary({
        baby: activeBaby,
        now,
        feedings,
        diapers,
        pumpings,
        sleeps,
        medications,
        vaccinations,
        temperatures,
        activeFeedingStart,
        activeSleepStart,
      }),
    [
      activeBaby,
      now,
      feedings,
      diapers,
      pumpings,
      sleeps,
      medications,
      vaccinations,
      temperatures,
      activeFeedingStart,
      activeSleepStart,
    ],
  )
  const handoffText = useMemo(
    () =>
      formatHandoffText(
        handoffSummary,
        (key, params) => t(key, params ?? {}),
        activeBaby?.name ?? t('common.baby'),
      ),
    [handoffSummary, t, activeBaby],
  )

  function timeLabel(ts: number): string {
    const today = startOfDay(now)
    if (ts >= today) return formatClock(ts)
    if (ts >= today - MS_PER_DAY) return t('care.yesterday', { time: formatClock(ts) })
    return `${formatDate(ts).slice(5)} ${formatClock(ts)}`
  }

  const feedValue = (() => {
    const f = plan.feeding
    if (f.activeSince != null) {
      return t('care.feedActive', {
        duration: formatDuration(Math.max(0, now - f.activeSince)),
      })
    }
    if (f.nextAt == null) return t('care.feedEmpty')
    if (f.overdue) return t('care.feedOverdue')
    return t('care.nextFeed', { time: formatClock(f.nextAt) })
  })()

  const feedHint = (() => {
    const f = plan.feeding
    if (f.activeSince != null) return t('care.feedActiveHint')
    if (!f.lastFeeding) return t('care.feedEmptyHint')
    return t('care.feedHint', {
      time: timeLabel(f.lastFeeding.endTime ?? f.lastFeeding.startTime),
      amount:
        f.lastFeeding.amount != null ? t('care.feedAmount', { amount: f.lastFeeding.amount }) : '',
    })
  })()

  const sleepValue = (() => {
    const sl = plan.sleep
    if (sl.activeSince != null) {
      return t('care.sleeping', {
        duration: formatDuration(Math.max(0, now - sl.activeSince)),
      })
    }
    if (sl.awakeMs == null) return t('care.sleepEmpty')
    return t('care.awake', { duration: formatDuration(sl.awakeMs) })
  })()

  const sleepHint = (() => {
    const sl = plan.sleep
    if (sl.activeSince != null) return t('care.sleepingHint')
    if (sl.awakeMs == null) return t('care.sleepEmptyHint')
    return t('care.awakeHint', {
      range: `${formatDuration(sl.wakeMinMs)}–${formatDuration(sl.wakeMaxMs)}`,
    })
  })()

  const vaccine = plan.todo.vaccine

  function vaccineBadge(v: Vaccination): string {
    const n = vaccineDaysLeft(v.date, startOfDay(now))
    if (n === 0) return t('care.vaccineToday')
    if (n > 0) return t('care.vaccineDays', { n })
    return t('care.vaccineOverdue', { n: -n })
  }

  const todoLabel = vaccine
    ? t('care.todo')
    : plan.todo.lastMedication
      ? t('log.filters.medication')
      : t('care.todo')
  const todoValue = vaccine
    ? t('care.vaccineTodo', {
        name: vaccine.name,
        dose: vaccine.dose ? t('care.vaccineDose', { dose: vaccine.dose }) : '',
      })
    : plan.todo.lastMedication
      ? t('care.medicationTodo', { n: plan.todo.medicationCount })
      : t('care.todoEmpty')
  const todoHint = vaccine
    ? vaccineBadge(vaccine)
    : plan.todo.lastMedication
      ? t('care.medicationHint', {
          time: timeLabel(plan.todo.lastMedication.time),
          name: plan.todo.lastMedication.name
            ? t('care.medicationName', { name: plan.todo.lastMedication.name })
            : '',
        })
      : t('care.todoEmptyHint')
  const todoIcon = vaccine ? '💉' : plan.todo.lastMedication ? '💊' : '📋'

  function onTodoClick() {
    if (vaccine) {
      onEditVaccination(vaccine)
      return
    }
    onAdd('medication')
  }

  return (
    <section className={s['care-card']} aria-labelledby="care-title">
      <div className={s['care-head']}>
        <div className={s['care-heading']}>
          <h3 id="care-title" className={s['care-title']}>
            {t('care.title')}
          </h3>
          <p className={s['care-sub']}>{t('care.subtitle')}</p>
        </div>
        <button type="button" className={s['care-handoff']} onClick={() => setHandoffOpen(true)}>
          <span aria-hidden="true">📋</span>
          {t('care.handoff')}
        </button>
      </div>

      <div className={s['care-list']}>
        <button type="button" className={s['care-row']} onClick={() => onAdd('feeding')}>
          <span className={`${s['care-icon']} ${s['care-icon--feed']}`} aria-hidden="true">
            🍼
          </span>
          <span className={s['care-body']}>
            <span className={s['care-label']}>{t('care.feeding')}</span>
            <span className={s['care-value']}>{feedValue}</span>
            <span className={s['care-hint']}>{feedHint}</span>
          </span>
          <span className={s['care-chevron']} aria-hidden="true">
            ›
          </span>
        </button>

        <button type="button" className={s['care-row']} onClick={() => onAdd('sleep')}>
          <span className={`${s['care-icon']} ${s['care-icon--sleep']}`} aria-hidden="true">
            😴
          </span>
          <span className={s['care-body']}>
            <span className={s['care-label']}>{t('care.sleep')}</span>
            <span className={s['care-value']}>{sleepValue}</span>
            <span className={s['care-hint']}>{sleepHint}</span>
          </span>
          <span className={s['care-chevron']} aria-hidden="true">
            ›
          </span>
        </button>

        <button type="button" className={s['care-row']} onClick={onTodoClick}>
          <span className={`${s['care-icon']} ${s['care-icon--todo']}`} aria-hidden="true">
            {todoIcon}
          </span>
          <span className={s['care-body']}>
            <span className={s['care-label']}>{todoLabel}</span>
            <span className={s['care-value']}>{todoValue}</span>
            <span className={s['care-hint']}>{todoHint}</span>
          </span>
          <span className={s['care-chevron']} aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {!plan.hasRecords && <p className={s['care-empty']}>{t('care.empty')}</p>}

      <HandoffModal show={handoffOpen} text={handoffText} onClose={() => setHandoffOpen(false)} />
    </section>
  )
}
