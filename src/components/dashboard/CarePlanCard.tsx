'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBabies } from '@/stores/baby'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { buildCarePlan } from '@/services/carePlan'
import { buildHandoffSummary, formatHandoffText } from '@/services/handoff'
import { computeTodayStats } from '@/services/todayStats'
import { dailyGuide } from '@/utils/dailyGuides'
import {
  formatAmount,
  formatClock,
  formatDate,
  formatDuration,
  startOfDay,
} from '@/utils/format'
import { MS_PER_DAY, MS_PER_HOUR } from '@/constants'
import { loadReminders } from '@/utils/reminderScheduler'
import HandoffModal from '@/components/dashboard/HandoffModal'
import type { RecordKind } from '@/types'
import s from './CarePlanCard.module.css'

export interface CarePlanCardProps {
  now: number
  onAdd: (kind: RecordKind) => void
}

function keep<T extends { id?: number }>(
  items: T[],
  kind: string,
  isPending: (target: { kind: string; id: number }) => boolean,
): T[] {
  return items.filter((x) => !isPending({ kind, id: x.id! }))
}

/** 今日照护卡：今日汇总 + 下次喂养 / 清醒参考 + 交接摘要 */
export default function CarePlanCard({ now, onAdd }: CarePlanCardProps) {
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

  const todayStart = startOfDay(now)
  const todayEnd = todayStart + MS_PER_DAY - 1

  /** 今日汇总：奶量 / 喂养次数 / 吸奶 / 母乳库存 / 睡眠 / 尿布（按当日边界裁剪） */
  const stats = useMemo(
    () =>
      computeTodayStats({
        feedings: feedings.filter(
          (f) => f.startTime >= todayStart && f.startTime <= todayEnd,
        ),
        diapers: diapers.filter((d) => d.time >= todayStart && d.time <= todayEnd),
        pumpings: pumpings.filter(
          (p) => p.startTime >= todayStart && p.startTime <= todayEnd,
        ),
        sleeps: sleeps.filter(
          (sl) =>
            (sl.endTime ?? sl.startTime) >= todayStart && sl.startTime <= todayEnd,
        ),
        todayStart,
        todayEnd,
      }),
    [feedings, diapers, pumpings, sleeps, todayStart, todayEnd],
  )

  /** 按月龄的每日参考（无出生日期时为 null） */
  const guide = useMemo(() => dailyGuide(activeBaby), [activeBaby])

  const lastDiaper = useMemo(
    () => [...diapers].sort((a, b) => b.time - a.time)[0],
    [diapers],
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

  /** 换尿布参考间隔（毫秒）：与提醒设置共用同一阈值（随渲染重新读取，设置变更即时生效） */
  const diaperIntervalMs = loadReminders().diaper.intervalHours * MS_PER_HOUR

  const plan = useMemo(
    () =>
      buildCarePlan({
        baby: activeBaby,
        now,
        feedings,
        diapers,
        sleeps,
        medications,
        vaccinations,
        activeFeedingStart,
        activeSleepStart,
        diaperIntervalMs,
      }),
    [
      activeBaby,
      now,
      feedings,
      diapers,
      sleeps,
      medications,
      vaccinations,
      activeFeedingStart,
      activeSleepStart,
      diaperIntervalMs,
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

  /** 距上次喂养结束（或开始）已过去多久 */
  const feedValue = (() => {
    const f = plan.feeding
    if (f.activeSince != null) {
      return t('care.feedActive', {
        duration: formatDuration(Math.max(0, now - f.activeSince)),
      })
    }
    if (f.lastAt == null) return t('care.feedEmpty')
    return `${formatDuration(Math.max(0, now - f.lastAt))}${t('common.ago')}`
  })()

  /** 今日喂养汇总 + 上次喂养时间 */
  const feedHint = [
    t('care.todayMilk', {
      amount: formatAmount(stats.totalMilk),
      count: stats.feedCount,
    }),
    plan.feeding.lastAt != null
      ? t('care.lastAt', { time: timeLabel(plan.feeding.lastAt) })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  /** 吸奶次数 / 母乳库存 + 月龄奶量参考 */
  const feedMeta = [
    t('care.feedMeta', {
      count: stats.pumpCount,
      stock: formatAmount(stats.breastStock),
    }),
    guide ? t('care.dailyGuide', { guide: guide.milk }) : '',
  ]
    .filter(Boolean)
    .join(' · ')

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

  /** 今日睡眠总时长 + 上次睡眠结束时间 */
  const sleepHint = [
    t('care.todaySleep', { duration: formatDuration(stats.sleepMs) }),
    plan.sleep.lastEndAt != null
      ? t('care.lastAt', { time: timeLabel(plan.sleep.lastEndAt) })
      : '',
  ]
    .filter(Boolean)
    .join(' · ')

  /** 清醒窗口参考 + 月龄睡眠参考 */
  const sleepMeta = [
    plan.sleep.activeSince != null
      ? t('care.sleepingHint')
      : plan.sleep.awakeMs != null
        ? t('care.awakeHint', {
            range: `${formatDuration(plan.sleep.wakeMinMs)}–${formatDuration(plan.sleep.wakeMaxMs)}`,
          })
        : '',
    guide ? t('care.dailyGuide', { guide: guide.sleep }) : '',
  ]
    .filter(Boolean)
    .join(' · ')

  /** 距上次换尿布已过去多久 */
  const diaperValue = lastDiaper
    ? `${formatDuration(Math.max(0, now - lastDiaper.time))}${t('common.ago')}`
    : t('care.diaperEmpty')
  /** 今日换尿布次数 + 上次时间 */
  const diaperHint = [
    t('care.todayDiaper', { count: stats.diaperCount }),
    lastDiaper ? t('care.lastAt', { time: timeLabel(lastDiaper.time) }) : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const diaperMeta = guide ? t('care.dailyGuide', { guide: guide.diaper }) : ''

  /** 照护卡只展示喂养 / 睡眠 / 尿布，三者都为空时给出空态提示 */
  const hasCareRecords = feedings.length + sleeps.length + diapers.length > 0

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
            <span
              className={`${s['care-value']} ${
                plan.feeding.activeSince != null
                  ? s['care-value--live']
                  : plan.feeding.overdue
                    ? s['care-value--attention']
                    : ''
              }`}
            >
              {feedValue}
            </span>
            <span className={s['care-hint']}>{feedHint}</span>
            <span className={s['care-meta']}>{feedMeta}</span>
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
            <span
              className={`${s['care-value']} ${
                plan.sleep.activeSince != null
                  ? s['care-value--live']
                  : plan.sleep.overAwake
                    ? s['care-value--attention']
                    : ''
              }`}
            >
              {sleepValue}
            </span>
            <span className={s['care-hint']}>{sleepHint}</span>
            {sleepMeta && <span className={s['care-meta']}>{sleepMeta}</span>}
          </span>
          <span className={s['care-chevron']} aria-hidden="true">
            ›
          </span>
        </button>

        <button type="button" className={s['care-row']} onClick={() => onAdd('diaper')}>
          <span className={`${s['care-icon']} ${s['care-icon--diaper']}`} aria-hidden="true">
            🧷
          </span>
          <span className={s['care-body']}>
            <span className={s['care-label']}>{t('care.diaper')}</span>
            <span
              className={`${s['care-value']} ${
                plan.diaper.overdue && plan.diaper.lastAt != null ? s['care-value--attention'] : ''
              }`}
            >
              {diaperValue}
            </span>
            <span className={s['care-hint']}>{diaperHint}</span>
            {diaperMeta && <span className={s['care-meta']}>{diaperMeta}</span>}
          </span>
          <span className={s['care-chevron']} aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {!hasCareRecords && <p className={s['care-empty']}>{t('care.empty')}</p>}

      <HandoffModal show={handoffOpen} text={handoffText} onClose={() => setHandoffOpen(false)} />
    </section>
  )
}
