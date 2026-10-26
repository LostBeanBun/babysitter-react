'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { useBabies } from '@/stores/baby'
import { useDismissedReminders } from '@/hooks/useDismissedReminders'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import ReminderBanner from '@/components/common/ReminderBanner'
import { startOfDay, formatDuration } from '@/utils/format'
import { MS_PER_DAY, MS_PER_HOUR } from '@/constants'
import { upcomingVaccinations, vaccineDaysLeft } from '@/services/reminders'
import { recommendedIntervalMs, recommendedIntervalLabel } from '@/utils/feedingGuide'
import { exportJsonBackup, getLastBackupAt, shouldSuggestBackup } from '@/services/backup'
import { isSnoozed, snoozeReminder, loadReminders } from '@/utils/reminderScheduler'
import type { RecordKind, Vaccination } from '@/types'

export interface TodayOverviewProps {
  now: number
  /** 点击疫苗提醒条/芯片：编辑对应计划记录 */
  onEdit?: (v: Vaccination) => void
  /** 点击喂奶/睡眠/尿布提醒条：打开对应记录表单 */
  onAdd?: (kind: RecordKind) => void
}

/** 今日概览：喂奶 / 备份 / 疫苗 / 睡眠 / 尿布提醒条（数据按 now 实时重算） */
export default function TodayOverview({ now, onEdit, onAdd }: TodayOverviewProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { activeBaby, activeBabyId } = useBabies()
  const { dismissed, dismiss } = useDismissedReminders()
  const activeTimer = useActiveTimer()

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

  // —— 喂奶提醒 ——
  const lastFeeding = useMemo(() => [...feedings].sort((a, b) => b.startTime - a.startTime)[0], [feedings])
  const sinceMs = lastFeeding ? now - (lastFeeding.endTime ?? lastFeeding.startTime) : null
  const recommendedMs = useMemo(() => recommendedIntervalMs(activeBaby), [activeBaby])
  const overdue = sinceMs != null && sinceMs > recommendedMs

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
  function snoozeSleep() {
    snoozeReminder('sleep', 15, now)
    setSnoozeTick((n) => n + 1)
  }
  function snoozeDiaper() {
    snoozeReminder('diaper', 15, now)
    setSnoozeTick((n) => n + 1)
  }

  // —— 睡眠提醒条 ——（仅当睡眠提醒开启：就寝时间前 1 小时窗口内 / 距上次睡眠超过设定间隔；正在进行睡眠时不显示）
  const sleepReminders = loadReminders().sleep
  const lastSleepStart = useMemo(
    () => [...sleeps].sort((a, b) => b.startTime - a.startTime)[0]?.startTime ?? null,
    [sleeps],
  )
  const sleepSinceMs = lastSleepStart == null ? null : now - lastSleepStart
  const sleepTimeDueMs = useMemo(() => {
    if (!sleepReminders.time) return -1
    const [h, m] = sleepReminders.time.split(':').map(Number)
    const target = new Date(now)
    target.setHours(h, m, 0, 0)
    const delta = now - target.getTime()
    return delta >= 0 && delta <= MS_PER_HOUR ? delta : -1
  }, [now, sleepReminders.time])
  const sleepIntervalDue =
    sleepReminders.intervalHours > 0 &&
    sleepSinceMs != null &&
    sleepSinceMs > sleepReminders.intervalHours * MS_PER_HOUR
  const sleepSnoozed = useMemo(() => {
    void snoozeTick
    return isSnoozed('sleep', now)
  }, [now, snoozeTick])
  const sleepBannerActive =
    sleepReminders.enabled &&
    !activeTimer.hasKind('sleep') &&
    !sleepSnoozed &&
    !dismissed.sleep &&
    (sleepTimeDueMs >= 0 || sleepIntervalDue)

  // —— 尿布提醒条 ——（阈值与今日照护共用：距上次换尿布超过提醒设置间隔，默认 3 小时，常显）
  const diaperReminders = loadReminders().diaper
  const lastDiaperTime = useMemo(
    () => [...diapers].sort((a, b) => b.time - a.time)[0]?.time ?? null,
    [diapers],
  )
  const diaperSinceMs = lastDiaperTime == null ? null : now - lastDiaperTime
  const diaperThresholdHours = diaperReminders.intervalHours > 0 ? diaperReminders.intervalHours : 3
  const diaperDue = diaperSinceMs != null && diaperSinceMs > diaperThresholdHours * MS_PER_HOUR
  const diaperSnoozed = useMemo(() => {
    void snoozeTick
    return isSnoozed('diaper', now)
  }, [now, snoozeTick])
  const diaperBannerActive = diaperDue && !diaperSnoozed && !dismissed.diaper

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
      {/* 喂奶提醒条：点击整条直达喂养记录表单 */}
      {overdue && !dismissed.feed && !feedSnoozed && (
        <ReminderBanner
          icon="🍼"
          variant="feed"
          title={t('feed.sinceLast', { duration: formatDuration(sinceMs ?? 0) })}
          sub={t('feed.reminderSub', { label: recommendedIntervalLabel(activeBaby) })}
          actionLabel={t('dashboard.snooze15')}
          dismissLabel={t('common.close')}
          onClick={() => onAdd?.('feeding')}
          onAction={snoozeFeed}
          onDismiss={() => dismiss('feed')}
        />
      )}

      {/* 睡眠提醒条（开启提醒时）：到达就寝时间或距上次睡眠超过间隔，点击直达睡眠表单 */}
      {sleepBannerActive && (
        <ReminderBanner
          icon="😴"
          variant="sleep"
          title={t('dashboard.sleepReminderTitle')}
          sub={
            sleepTimeDueMs >= 0
              ? t('reminders.sleep.bodyTime', { time: sleepReminders.time })
              : t('reminders.sleep.body', { duration: formatDuration(sleepSinceMs ?? 0) })
          }
          actionLabel={t('dashboard.snooze15')}
          dismissLabel={t('common.close')}
          onClick={() => onAdd?.('sleep')}
          onAction={snoozeSleep}
          onDismiss={() => dismiss('sleep')}
        />
      )}

      {/* 尿布提醒条：距上次换尿布超过提醒间隔（默认 3 小时），点击直达纸尿裤表单 */}
      {diaperBannerActive && (
        <ReminderBanner
          icon="🧷"
          variant="diaper"
          title={t('dashboard.diaperReminderTitle')}
          sub={t('reminders.diaper.body', { hours: diaperThresholdHours })}
          actionLabel={t('dashboard.snooze15')}
          dismissLabel={t('common.close')}
          onClick={() => onAdd?.('diaper')}
          onAction={snoozeDiaper}
          onDismiss={() => dismiss('diaper')}
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

    </div>
  )
}
