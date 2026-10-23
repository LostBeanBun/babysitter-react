'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useBabies } from '@/stores/baby'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { useDismissedReminders } from '@/hooks/useDismissedReminders'
import ReminderBanner from '@/components/common/ReminderBanner'
import { startOfDay, formatDuration, formatAmount, formatTime } from '@/utils/format'
import { MS_PER_DAY } from '@/constants'
import { upcomingVaccinations, vaccineDaysLeft } from '@/services/reminders'
import { recommendedIntervalMs, recommendedIntervalLabel } from '@/utils/feedingGuide'
import { dailyGuide } from '@/utils/dailyGuides'
import { exportJsonBackup, getLastBackupAt, shouldSuggestBackup } from '@/services/backup'
import { isSnoozed, snoozeReminder } from '@/utils/reminderScheduler'
import type { Feeding, DiaperChange, Pumping, Sleep, Vaccination } from '@/types'
import s from './TodayOverview.module.css'

export interface TodayOverviewProps {
  now: number
  /** 点击疫苗提醒条/芯片：编辑对应计划记录 */
  onEdit?: (v: Vaccination) => void
}

/** 今日概览：喂奶/疫苗提醒条 + 统计卡 + 每日小结（数据按 now 实时重算） */
export default function TodayOverview({ now, onEdit }: TodayOverviewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { activeBaby, activeBabyId } = useBabies()
  const { isPending } = useDeleteUndo()
  const { dismissed, dismiss } = useDismissedReminders()

  const feedingsResult = useRecordsLive('feedings', activeBabyId)
  const feedings = useMemo(() => feedingsResult ?? [], [feedingsResult])

  const diapersResult = useRecordsLive('diapers', activeBabyId)
  const diapers = useMemo(() => diapersResult ?? [], [diapersResult])

  const pumpingsResult = useRecordsLive('pumpings', activeBabyId)
  const pumpings = useMemo(() => pumpingsResult ?? [], [pumpingsResult])

  const sleepsResult = useRecordsLive('sleeps', activeBabyId)
  const sleeps = useMemo(() => sleepsResult ?? [], [sleepsResult])

  const vaccinationsResult = useRecordsLive('vaccinations', activeBabyId)
  const vaccinations = useMemo(() => vaccinationsResult ?? [], [vaccinationsResult])

  const todayStart = startOfDay(now)
  const todayEnd = todayStart + MS_PER_DAY - 1

  function keep<T extends { id?: number }>(items: T[], kind: string): T[] {
    return items.filter((x) => !isPending({ kind, id: x.id! }))
  }

  const todayFeedings = useMemo(
    () => keep(feedings.filter((f) => f.startTime >= todayStart && f.startTime <= todayEnd), 'feeding'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feedings, todayStart, todayEnd, isPending],
  )
  const todayDiapers = useMemo(
    () => keep(diapers.filter((d) => d.time >= todayStart && d.time <= todayEnd), 'diaper'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [diapers, todayStart, todayEnd, isPending],
  )
  const todayPumpings = useMemo(
    () => keep(pumpings.filter((p) => p.startTime >= todayStart && p.startTime <= todayEnd), 'pumping'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pumpings, todayStart, todayEnd, isPending],
  )
  const todaySleeps = useMemo(
    () => keep(sleeps.filter((sl) => (sl.endTime ?? sl.startTime) >= todayStart && sl.startTime <= todayEnd), 'sleep'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sleeps, todayStart, todayEnd, isPending],
  )

  const upcomingVaccinationsList = useMemo(() => upcomingVaccinations(vaccinations, todayStart), [
    vaccinations,
    todayStart,
  ])

  /** 疫苗提醒条内容芯片：名称 · 剂次 + 距接种日文案 */
  const vaccineChips = useMemo(
    () =>
      upcomingVaccinationsList.map((v) => {
        const n = vaccineDaysLeft(v.date, todayStart)
        const badge =
          n === 0
            ? t('dashboard.vaccineToday')
            : n > 0
              ? t('dashboard.vaccineDaysLeft', { n })
              : t('dashboard.vaccineOverdue', { n: -n })
        return { key: v.id!, label: v.dose ? `${v.name} · ${v.dose}` : v.name, badge }
      }),
    [upcomingVaccinationsList, todayStart, t],
  )

  /** 点击提醒条/单个芯片：编辑对应计划记录 */
  function onSelectVaccination(key: number | string) {
    const v = vaccinations.find((x) => x.id === key)
    if (v) onEdit?.(v)
  }

  /** 全部待种计划数（提醒条只展示最近 3 条，其余仅在记录页疫苗筛选中可见/可改） */
  const plannedVaccineCount = useMemo(() => vaccinations.filter((v) => v.status === 'planned').length, [vaccinations])

  /** 「全部 N 条」→ 记录页疫苗筛选（可逐条选择修改保存） */
  function openAllVaccinations() {
    router.push('/log/?filter=vaccination')
  }

  // 今日汇总
  const summary = useMemo(() => {
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

    return { totalMilk, feedCount, pumpTotal, bottleBreastmilkTotal, breastStock, sleepTotal }
  }, [todayFeedings, todayPumpings, todaySleeps, todayStart, todayEnd])
  const { totalMilk, feedCount, breastStock, sleepTotal } = summary

  // —— 喂奶提醒 ——
  const lastFeeding = useMemo(() => [...feedings].sort((a, b) => b.startTime - a.startTime)[0], [feedings])
  const lastSleep = useMemo(() => [...sleeps].sort((a, b) => (b.endTime ?? b.startTime) - (a.endTime ?? a.startTime))[0], [sleeps])
  const lastDiaper = useMemo(() => [...diapers].sort((a, b) => b.time - a.time)[0], [diapers])
  const sinceMs = lastFeeding ? now - (lastFeeding.endTime ?? lastFeeding.startTime) : null
  const sinceSleepMs = lastSleep ? now - (lastSleep.endTime ?? lastSleep.startTime) : null
  const sinceDiaperMs = lastDiaper ? now - lastDiaper.time : null
  const recommended = useMemo(
    () => ({ ms: recommendedIntervalMs(activeBaby), guide: dailyGuide(activeBaby) }),
    [activeBaby],
  )
  const recommendedMs = recommended.ms
  const overdue = sinceMs != null && sinceMs > recommendedMs
  /** 按月龄的每日参考数据（无出生日期时为 null） */
  const guide = recommended.guide

  // —— 稍后提醒：15 分钟内隐藏横幅并抑制系统通知 ——
  const [snoozeTick, setSnoozeTick] = useState(0)
  const feedSnoozed = useMemo(() => {
    void snoozeTick
    return isSnoozed('feed', now)
  }, [now, snoozeTick])
  function snoozeFeed() {
    snoozeReminder('feed', 15, now)
    setSnoozeTick((n) => n + 1)
  }

  // —— 备份提醒：本地数据唯一兜底，超过 7 天未备份时提示 ——
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端 localStorage 初始化
    setLastBackupAt(getLastBackupAt())
  }, [])
  const hasAnyData =
    feedings.length + diapers.length + pumpings.length + sleeps.length + vaccinations.length > 0
  const backupDue = shouldSuggestBackup({ lastBackupAt, hasData: hasAnyData, now })
  const backupDays = lastBackupAt == null ? 0 : Math.floor((now - lastBackupAt) / MS_PER_DAY)
  async function handleBackup() {
    await exportJsonBackup()
    setLastBackupAt(getLastBackupAt())
  }

  return (
    <div className="today-overview">
      {/* 喂奶提醒条 */}
      {overdue && !dismissed.feed && !feedSnoozed && (
        <ReminderBanner
          icon="🍼"
          variant="feed"
          title={t('feed.sinceLast', { duration: formatDuration(sinceMs ?? 0) })}
          sub={t('feed.reminderSub', { label: recommendedIntervalLabel(activeBaby) })}
          actionLabel={t('dashboard.snooze15')}
          dismissLabel={t('common.close')}
          onAction={snoozeFeed}
          onDismiss={() => dismiss('feed')}
        />
      )}

      {/* 备份提醒 */}
      {backupDue && !dismissed.backup && (
        <ReminderBanner
          icon="💾"
          variant="backup"
          title={t('dashboard.backupTitle')}
          sub={
            lastBackupAt == null
              ? t('dashboard.backupSubNever')
              : t('dashboard.backupSub', { days: backupDays })
          }
          actionLabel={t('dashboard.backupAction')}
          dismissLabel={t('common.close')}
          onAction={handleBackup}
          onDismiss={() => dismiss('backup')}
        />
      )}

      {/* 疫苗提醒条：点击打开最近一条待种记录进行编辑，点具体芯片可直接编辑该条，「全部」进记录页 */}
      {upcomingVaccinationsList.length > 0 && !dismissed.vaccine && (
        <ReminderBanner
          icon="💉"
          variant="vaccine"
          title={t('dashboard.vaccineReminderTitle')}
          chips={vaccineChips}
          allLabel={plannedVaccineCount > 1 ? t('dashboard.vaccineAll', { n: plannedVaccineCount }) : undefined}
          dismissLabel={t('common.close')}
          onClick={() => onEdit?.(upcomingVaccinationsList[0])}
          onSelect={onSelectVaccination}
          onAll={openAllVaccinations}
          onDismiss={() => dismiss('vaccine')}
        />
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
              {lastDiaper && (
                <span className={s['ov-card__alert']}>
                  {formatTime(lastDiaper.time)}
                  {sinceDiaperMs != null && sinceDiaperMs >= 0
                    ? ` · ${formatDuration(sinceDiaperMs)}${t('common.ago')}`
                    : ''}
                </span>
              )}
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
