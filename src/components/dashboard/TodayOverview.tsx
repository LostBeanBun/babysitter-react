'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { startOfDay, formatDuration, formatAmount, formatTime } from '@/utils/format'
import { MS_PER_DAY } from '@/constants'
import { recommendedIntervalMs, recommendedIntervalLabel } from '@/utils/feedingGuide'
import { dailyGuide } from '@/utils/dailyGuides'
import type { Feeding, DiaperChange, Pumping, Sleep, Vaccination } from '@/types'
import s from './TodayOverview.module.css'

export interface TodayOverviewProps {
  now: number
  onAdd?: (kind: 'vaccination') => void
}

/** 今日概览：喂奶/疫苗提醒条 + 统计卡 + 每日小结（数据按 now 实时重算） */
export default function TodayOverview({ now, onAdd }: TodayOverviewProps) {
  const { t } = useTranslation()
  const { activeBaby, activeBabyId } = useBabies()
  const { isPending } = useDeleteUndo()

  /**
   * 提醒条关闭状态（会话级，仅内存）：关闭后当前会话不再显示，刷新页面即重新提醒。
   * 提醒基于实时数据（如喂奶间隔），跨天重新提醒没有意义，故不持久化。
   */
  const [dismissed, setDismissed] = useState<{ feed: boolean; vaccine: boolean }>({ feed: false, vaccine: false })

  /** 关闭某提醒条（当前会话生效） */
  function dismissReminder(kind: 'feed' | 'vaccine') {
    setDismissed((prev) => ({ ...prev, [kind]: true }))
  }

  const feedings =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Feeding[]
        return db.feedings
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Feeding[],
    ) ?? []

  const diapers =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as DiaperChange[]
        return db.diapers
          .where('[babyId+time]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as DiaperChange[],
    ) ?? []

  const pumpings =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Pumping[]
        return db.pumpings
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Pumping[],
    ) ?? []

  const sleeps =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Sleep[]
        return db.sleeps
          .where('[babyId+startTime]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
          .then((a) => a.filter(Boolean))
      },
      [activeBabyId],
      [] as Sleep[],
    ) ?? []

  const vaccinations =
    useLiveQuery(
      async () => {
        if (activeBabyId == null) return [] as Vaccination[]
        return db.vaccinations
          .where('[babyId+date]')
          .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
          .toArray()
      },
      [activeBabyId],
      [] as Vaccination[],
    ) ?? []

  const todayStart = startOfDay(now)
  const todayEnd = todayStart + MS_PER_DAY - 1

  function keep<T extends { id?: number }>(items: T[], kind: string): T[] {
    return items.filter((x) => !isPending({ kind, id: x.id! }))
  }

  const todayFeedings = keep(
    feedings.filter((f) => f.startTime >= todayStart && f.startTime <= todayEnd),
    'feeding',
  )
  const todayDiapers = keep(
    diapers.filter((d) => d.time >= todayStart && d.time <= todayEnd),
    'diaper',
  )
  const todayPumpings = keep(
    pumpings.filter((p) => p.startTime >= todayStart && p.startTime <= todayEnd),
    'pumping',
  )
  const todaySleeps = keep(
    sleeps.filter((sl) => (sl.endTime ?? sl.startTime) >= todayStart && sl.startTime <= todayEnd),
    'sleep',
  )

  const upcomingVaccinations = (() => {
    const cutoff = todayStart - 14 * MS_PER_DAY
    return vaccinations
      .filter((v) => v.status === 'planned' && v.date >= cutoff)
      .sort((a, b) => a.date - b.date)
      .slice(0, 3)
  })()

  function vaccineDaysLeft(date: number): number {
    return Math.round((date - todayStart) / MS_PER_DAY)
  }

  // 今日汇总
  const totalMilk = todayFeedings.reduce((sum, f) => sum + (f.amount ?? 0), 0)
  const feedCount = todayFeedings.length
  /** 今日泵出总量（吸奶产出） */
  const pumpTotal = todayPumpings.reduce((sum, p) => sum + (p.amount ?? 0), 0)
  /** 今日瓶喂母乳消耗量 */
  const bottleBreastmilkTotal = todayFeedings
    .filter((f) => f.type === 'bottle_breastmilk')
    .reduce((sum, f) => sum + (f.amount ?? 0), 0)
  /** 母乳库存 = 泵出 − 瓶喂母乳消耗（可为负：消耗多于泵出） */
  const breastStock = pumpTotal - bottleBreastmilkTotal

  const sleepTotal = todaySleeps.reduce((sum, sl) => {
    const s0 = Math.max(sl.startTime, todayStart)
    const e0 = Math.min(sl.endTime ?? sl.startTime, todayEnd)
    return sum + Math.max(0, e0 - s0)
  }, 0)

  // —— 喂奶提醒 ——
  const lastFeeding = [...feedings].sort((a, b) => b.startTime - a.startTime)[0]
  const lastSleep = [...sleeps].sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))[0]
  const sinceMs = lastFeeding ? now - (lastFeeding.endTime ?? lastFeeding.startTime) : null
  const sinceSleepMs = lastSleep ? now - (lastSleep.endTime ?? lastSleep.startTime) : null
  const recommendedMs = recommendedIntervalMs(activeBaby)
  const overdue = sinceMs != null && sinceMs > recommendedMs
  /** 按月龄的每日参考数据（无出生日期时为 null） */
  const guide = dailyGuide(activeBaby)

  return (
    <div className="today-overview">
      {/* 喂奶提醒条 */}
      {overdue && !dismissed.feed && (
        <div className={s['feed-reminder-banner']}>
          <span className={s['fr-icon']}>🍼</span>
          <div className={s['fr-text']}>
            <p className={s['fr-title']}>{t('feed.sinceLast', { duration: formatDuration(sinceMs ?? 0) })}</p>
            <p className={s['fr-sub']}>{t('feed.reminderSub', { label: recommendedIntervalLabel(activeBaby) })}</p>
          </div>
          <button
            type="button"
            className={s['banner-close']}
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={() => dismissReminder('feed')}
          >
            ✕
          </button>
        </div>
      )}

      {/* 疫苗提醒条 */}
      {upcomingVaccinations.length > 0 && !dismissed.vaccine && (
        <div className={s['vaccine-banner']} onClick={() => onAdd?.('vaccination')}>
          <span className={s['vb-icon']}>💉</span>
          <div className={s['vb-text']}>
            <p className={s['vb-title']}>{t('dashboard.vaccineReminderTitle')}</p>
            <p className={s['vb-sub']}>
              {upcomingVaccinations.map((v) => (
                <span key={v.id} className="vb-item">
                  {v.name}
                  {v.dose ? ` · ${v.dose}` : ''}{' '}
                  <span className={s['vb-days']}>
                    {vaccineDaysLeft(v.date) === 0
                      ? t('dashboard.vaccineToday')
                      : vaccineDaysLeft(v.date) > 0
                        ? t('dashboard.vaccineDaysLeft', { n: vaccineDaysLeft(v.date) })
                        : t('dashboard.vaccineOverdue', { n: -vaccineDaysLeft(v.date) })}
                  </span>
                </span>
              ))}
            </p>
          </div>
          <button
            type="button"
            className={s['banner-close']}
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={(e) => {
              e.stopPropagation()
              dismissReminder('vaccine')
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 统计卡 */}
      <div className={s['overview-grid']}>
        {/* 奶量卡片 */}
        <div className={`${s['ov-card']} ${s['ov-card--milk']}`}>
          <div className={s['ov-card__accent']} />
          <div className={s['ov-card__content']}>
            <div className={s['ov-card__head']}>
              <span className={s['ov-card__icon']}>🥛</span>
              <span className={s['ov-card__label']}>{t('dashboard.statMilk')}</span>
              {lastFeeding && (
                <span className={s['ov-card__alert']}>
                  {formatTime(lastFeeding.endTime ?? lastFeeding.startTime)}
                  {sinceMs != null ? ` · ${formatDuration(sinceMs)}${t('common.ago')}` : ''}
                </span>
              )}
            </div>
            <div className={s['ov-card__hero-row']}>
              <p className={s['ov-card__hero']}>{formatAmount(totalMilk) || '0 ml'}</p>
              {guide && (
                <span className={s['ov-card__guide']}>
                  {t('dashboard.guideDaily')} {guide.milk}
                </span>
              )}
            </div>
            <div className={s['ov-card__details']}>
              <div className={`${s['ov-dt']} ${s['ov-dt--spread']}`}>
                <span className={s['ov-dt__label']}>
                  {t('dashboard.feedCount')}{' '}
                  <span className={s['ov-dt__value']}>
                    {feedCount}
                    {t('common.timesShort')}
                  </span>
                </span>
              </div>
            </div>
            <div className={s['ov-card__footer']}>
              <div className={s['ov-dt']}>
                <span className={s['ov-dt__label']}>
                  {t('dashboard.pumpCount')}{' '}
                  <span className={s['ov-dt__value']}>
                    {todayPumpings.length}
                    {t('common.timesShort')}
                  </span>
                </span>
              </div>
              <div className={s['ov-dt']}>
                <span className={s['ov-dt__label']}>
                  {t('dashboard.breastStock')} <span className={s['ov-dt__value']}>{formatAmount(breastStock)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* 睡眠卡片 */}
        <div className={`${s['ov-card']} ${s['ov-card--sleep']}`}>
          <div className={s['ov-card__accent']} />
          <div className={s['ov-card__content']}>
            <div className={s['ov-card__head']}>
              <span className={s['ov-card__icon']}>😴</span>
              <span className={s['ov-card__label']}>{t('dashboard.statSleep')}</span>
              {lastSleep && (
                <span className={s['ov-card__alert']}>
                  {formatTime(lastSleep.endTime ?? lastSleep.startTime)}
                  {sinceSleepMs != null && sinceSleepMs >= 0
                    ? ` · ${formatDuration(sinceSleepMs)}${t('common.ago')}`
                    : ''}
                </span>
              )}
            </div>
            <div className={s['ov-card__hero-row']}>
              <p className={s['ov-card__hero']}>{formatDuration(sleepTotal)}</p>
              {guide && (
                <span className={s['ov-card__guide']}>
                  {t('dashboard.guideDaily')} {guide.sleep}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* 尿布卡片 */}
        <div className={`${s['ov-card']} ${s['ov-card--diaper']}`}>
          <div className={s['ov-card__accent']} />
          <div className={s['ov-card__content']}>
            <div className={s['ov-card__head']}>
              <span className={s['ov-card__icon']}>🧷</span>
              <span className={s['ov-card__label']}>{t('dashboard.statDiaper')}</span>
            </div>
            <div className={s['ov-card__hero-row']}>
              <p className={s['ov-card__hero']}>
                {todayDiapers.length}
                <span className={s['ov-card__unit']}>{t('common.timesShort')}</span>
              </p>
              {guide && (
                <span className={s['ov-card__guide']}>
                  {t('dashboard.guideDaily')} {guide.diaper}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
