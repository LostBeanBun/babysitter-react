'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/common/PageHeader'
import BaseModal from '@/components/common/BaseModal'
import ReminderParam from '@/components/settings/ReminderParam'
import { countAllRecords, clearAllData, clearBabyData, db } from '@/db'
import { exportBabyCsvs, exportAllBabiesCsv, importAllCsv } from '@/services/export'
import { exportJsonBackup, getLastBackupAt, importJsonBackup } from '@/services/backup'
import { BABY_AVATARS, MS_PER_HOUR } from '@/constants'
import { APP_VERSION } from '@/constants/version'
import {
  clampIntervalHours,
  loadReminders,
  saveReminders,
  type ReminderConfig,
  type ReminderType,
} from '@/utils/reminderScheduler'
import { recommendedIntervalMs } from '@/utils/feedingGuide'
import { useBabies } from '@/stores/baby'
import { toast } from '@/stores/toast'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import { formatDate } from '@/utils/format'
import type { Baby, BabyGender } from '@/types'
import s from './SettingsView.module.css'

export default function SettingsView() {
  const { t } = useTranslation()
  const { babies, activeBaby, activeBabyId, setActiveBabyId, addBaby } = useBabies()
  const err = useFormErrors()

  useEffect(() => {
    document.title = `${t('nav.settings')} · ${t('app.name')}`
  }, [t])

  const [recordCounts, setRecordCounts] = useState({
    feedings: 0,
    diapers: 0,
    pumpings: 0,
    sleeps: 0,
    growths: 0,
    solidFoods: 0,
    medications: 0,
    vaccinations: 0,
    temperatures: 0,
    milestones: 0,
  })
  const [babyModal, setBabyModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null)
  const [babyName, setBabyName] = useState('')
  const [babyGender, setBabyGender] = useState<BabyGender | ''>('')
  const [babyBirthDate, setBabyBirthDate] = useState('')
  const [babyAvatar, setBabyAvatar] = useState('')
  const [deleteBabyConfirm, setDeleteBabyConfirm] = useState<Baby | null>(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const [clearAllConfirm, setClearAllConfirm] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)

  // —— JSON 全量备份 / 恢复 ——
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端 localStorage 初始化
    setLastBackupAt(getLastBackupAt())
  }, [])
  const [jsonBusy, setJsonBusy] = useState(false)
  const [jsonImportPending, setJsonImportPending] = useState<File | null>(null)
  const jsonFileRef = useRef<HTMLInputElement | null>(null)

  const [shareFeedback, setShareFeedback] = useState<string | null>(null)

  // —— 提醒配置（loadReminders 访问 localStorage，须在客户端 effect 中加载）——
  const [reminders, setReminders] = useState<ReminderConfig | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 客户端 localStorage 初始化
    setReminders(loadReminders())
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      const counts = await countAllRecords()
      if (!cancelled) setRecordCounts(counts)
    }
    loadCounts()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleShare() {
    setShareFeedback(null)
    const { origin, pathname } = window.location
    const url = `${origin}${pathname}`
    const text = `${t('settings.shareText')} ${url}`
    if (navigator.share) {
      try {
        await navigator.share({ title: t('settings.shareTitle'), text, url })
        return
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareFeedback(t('common.copied'))
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setShareFeedback(t('common.copied'))
      } catch {
        setShareFeedback(`${t('settings.shareFallback')} ${url}`)
      }
    }
    window.setTimeout(() => setShareFeedback(null), 3000)
  }

  async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    if (Notification.permission === 'default') {
      try {
        const p = await Notification.requestPermission()
        return p === 'granted'
      } catch {
        return false
      }
    }
    return false
  }

  async function toggleReminder(type: ReminderType) {
    if (!reminders) return
    const next: ReminderConfig = {
      ...reminders,
      [type]: { ...reminders[type], enabled: !reminders[type].enabled },
    }
    setReminders(next)
    if (next[type].enabled) await requestNotificationPermission()
    saveReminders(next)
  }

  /** 间隔提交：组件已钳制边界，此处合并写状态与持久化（React 状态异步，分两步会存旧值） */
  function commitInterval(type: 'feed' | 'medication' | 'diaper' | 'sleep', v: number | string) {
    if (!reminders) return
    const hours = typeof v === 'number' ? v : Number(v)
    const next = { ...reminders, [type]: { ...reminders[type], intervalHours: hours } }
    setReminders(next)
    saveReminders(next)
  }

  /** 时间提交：同样合并写状态与持久化 */
  function commitSleepTime(v: number | string) {
    if (!reminders) return
    const next = { ...reminders, sleep: { ...reminders.sleep, time: String(v) } }
    setReminders(next)
    saveReminders(next)
  }

  /** 免打扰开关：开启后时间段内不发系统通知 */
  function toggleQuiet() {
    if (!reminders) return
    const next: ReminderConfig = {
      ...reminders,
      quiet: { ...reminders.quiet, enabled: !reminders.quiet.enabled },
    }
    setReminders(next)
    saveReminders(next)
  }

  /** 免打扰起止时间提交 */
  function commitQuietTime(which: 'start' | 'end', v: number | string) {
    if (!reminders) return
    const next: ReminderConfig = {
      ...reminders,
      quiet: { ...reminders.quiet, [which]: String(v) },
    }
    setReminders(next)
    saveReminders(next)
  }

  /** 按月龄推荐喂奶间隔（点击后写入喂奶提醒配置） */
  const recommendedHours = useMemo(() => recommendedIntervalMs(activeBaby) / MS_PER_HOUR, [activeBaby])

  function applyAgeRecommendation() {
    if (!reminders) return
    const hours = recommendedHours
    const next: ReminderConfig = {
      ...reminders,
      feed: { ...reminders.feed, intervalHours: clampIntervalHours(hours, 0) },
    }
    setReminders(next)
    saveReminders(next)
    toast(t('settings.recommendApplied', { hours }))
  }

  const reminderRows = useMemo(
    () => [
      { type: 'feed' as const, title: t('reminders.feed.title'), sub: t('reminders.feed.sub') },
      { type: 'sleep' as const, title: t('reminders.sleep.title'), sub: t('reminders.sleep.sub') },
      { type: 'medication' as const, title: t('reminders.medication.title'), sub: t('reminders.medication.sub') },
      { type: 'vaccination' as const, title: t('reminders.vaccination.title'), sub: t('reminders.vaccination.sub') },
      { type: 'diaper' as const, title: t('reminders.diaper.title'), sub: t('reminders.diaper.sub') },
    ],
    [t],
  )

  function openAddBaby() {
    err.clearAll()
    setBabyName('')
    setBabyGender('')
    setBabyBirthDate('')
    setBabyAvatar('')
    setBabyModal({ mode: 'add' })
  }

  function openEditBaby(b: Baby) {
    err.clearAll()
    setBabyName(b.name)
    setBabyGender(b.gender ?? '')
    setBabyBirthDate(b.birthDate ?? '')
    setBabyAvatar(b.avatar ?? '')
    setBabyModal({ mode: 'edit', id: b.id })
  }

  async function saveBaby() {
    err.clearAll()
    const name = babyName.trim()
    // 宝宝名称/出生日期必填，新增时性别必填（出生日期用于月龄换算与生长曲线参考线）
    if (!name) {
      err.set('name', t('settings.needName'))
      return
    }
    if (!babyBirthDate) {
      err.set('birthDate', t('settings.needBirthDate'))
      return
    }
    if (babyModal?.mode === 'add' && !babyGender) {
      err.set('gender', t('settings.needGender'))
      return
    }
    if (babyModal?.mode === 'edit' && babyModal.id != null) {
      await db.babies.update(babyModal.id, {
        name,
        gender: babyGender || undefined,
        birthDate: babyBirthDate,
        avatar: babyAvatar || undefined,
      })
    } else {
      await addBaby(name, babyGender || undefined, babyBirthDate, undefined, undefined, babyAvatar || undefined)
    }
    setBabyModal(null)
  }

  const { formRef, onSubmit: onBabySubmit } = useFormSubmit(saveBaby)

  async function confirmDeleteBaby() {
    const id = deleteBabyConfirm?.id
    if (id == null) return
    await clearBabyData(id)
    await db.babies.delete(id)
    if (activeBabyId === id) setActiveBabyId(null)
    setDeleteBabyConfirm(null)
  }

  function babyAge(b: Baby): string {
    if (!b.birthDate) return t('settings.noBirthDate')
    // eslint-disable-next-line react-hooks/purity -- 年龄计算依赖当前时刻，渲染时读取即可
    const diff = Date.now() - new Date(b.birthDate + 'T00:00:00').getTime()
    if (diff < 0) return t('settings.birthdayUpcoming')
    const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30.44))
    if (months < 1) {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      return t('settings.ageDays', { n: days })
    }
    if (months < 12) return t('settings.ageMonths', { n: months })
    const years = Math.floor(months / 12)
    return t('settings.ageYears', { years, months: months % 12 })
  }

  async function handleExportBabyCsv() {
    if (!activeBaby) return
    await exportBabyCsvs(activeBaby)
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 3000)
  }

  async function handleExportAllCsv() {
    await exportAllBabiesCsv()
    setExportSuccess(true)
    setTimeout(() => setExportSuccess(false), 3000)
  }

  // —— JSON 全量备份 / 恢复 ——

  async function handleExportJson() {
    try {
      await exportJsonBackup()
      setLastBackupAt(getLastBackupAt())
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch {
      toast(t('settings.backupFailed'))
    }
  }

  function handleJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setJsonImportPending(file)
    e.target.value = ''
  }

  /** 备份文件校验错误码 → 文案（服务层抛出的是错误码字符串） */
  function restoreErrorMessage(e: unknown): string {
    if (e === 'invalidJson') return t('settings.restoreInvalid')
    if (e === 'notBackup') return t('settings.restoreNotBackup')
    if (e === 'tooNew') return t('settings.restoreTooNew')
    return t('settings.restoreFailed')
  }

  async function confirmJsonImport() {
    const file = jsonImportPending
    if (!file) return
    setJsonBusy(true)
    try {
      const result = await importJsonBackup(file)
      setLastBackupAt(getLastBackupAt())
      setRecordCounts(await countAllRecords())
      setJsonImportPending(null)
      toast(t('settings.restoreSuccess', { babies: result.babies }), 'success', { duration: 5000 })
    } catch (e) {
      toast(restoreErrorMessage(e), 'error', { duration: 5000 })
    } finally {
      setJsonBusy(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportBusy(true)
    // 覆盖式导入前先自动导出一份当前数据，避免误导入后无法回头
    try {
      await exportJsonBackup()
      setLastBackupAt(getLastBackupAt())
    } catch {
      toast(t('settings.autoBackupFailed'))
      setImportBusy(false)
      e.target.value = ''
      return
    }
    try {
      const result = await importAllCsv(file)
      toast(
        t('settings.importSuccess', {
          babies: result.babies,
          feedings: result.feedings,
          diapers: result.diapers,
          pumpings: result.pumpings,
          sleeps: result.sleeps,
          growths: result.growths,
          solidFoods: result.solidFoods,
          medications: result.medications,
          vaccinations: result.vaccinations,
          temperatures: result.temperatures,
          milestones: result.milestones,
        }),
        'success',
        { duration: 5000 },
      )
      setRecordCounts(await countAllRecords())
    } catch {
      toast(t('settings.importFailed'), 'error')
    } finally {
      setImportBusy(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  async function confirmClearAll() {
    setClearBusy(true)
    try {
      await clearAllData()
      setActiveBabyId(null)
      localStorage.removeItem('babysitter.activeBabyId')
      setRecordCounts({
        feedings: 0,
        diapers: 0,
        pumpings: 0,
        sleeps: 0,
        growths: 0,
        solidFoods: 0,
        medications: 0,
        vaccinations: 0,
        temperatures: 0,
        milestones: 0,
      })
      setClearAllConfirm(false)
    } finally {
      setClearBusy(false)
    }
  }

  return (
    <div className={`page ${s['settings-page']}`}>
      <PageHeader />

      {/* 宝宝管理 */}
      <p className="section-title">{t('settings.babyManage')}</p>
      <div className="card">
        <div className={s['baby-list']}>
          {babies.map((b) => (
            <div
              key={b.id}
              className={`${s['baby-item']} ${b.id === activeBabyId ? s.active : ''}`}
              onClick={() => b.id != null && setActiveBabyId(b.id)}
            >
              <div className={s['baby-avatar']} style={{ background: b.avatarColor }}>
                {b.avatar ?? b.name[0]}
              </div>
              <div className={s['baby-info']}>
                <p className={s['baby-name']}>
                  {b.name}
                  {b.id === activeBabyId ? t('common.current') : ''}
                </p>
                <p className={s['baby-meta']}>
                  {b.gender
                    ? t(b.gender === 'boy' ? 'settings.genderBoy' : 'settings.genderGirl')
                    : t('settings.genderUnknown')}
                  · {babyAge(b)}
                </p>
              </div>
              <div className={s['baby-actions']}>
                <button
                  className={s['icon-btn']}
                  title={t('common.edit')}
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditBaby(b)
                  }}
                >
                  ✏️
                </button>
                <button
                  className={s['icon-btn']}
                  title={t('common.delete')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteBabyConfirm(b)
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-outline btn-block" onClick={openAddBaby}>
          + {t('settings.addBaby')}
        </button>
      </div>

      {/* 提醒设置 */}
      <p className="section-title">{t('settings.reminderSectionTitle')}</p>
      <div className="card">
        <p className={s['data-tip']}>{t('settings.reminderTip')}</p>
        {reminders &&
          reminderRows.map((r) => (
            <div key={r.type} className={s['reminder-block']}>
              <div className={s['reminder-row']}>
                <div className={s['reminder-info']}>
                  <p className={s['reminder-title']}>{r.title}</p>
                  <p className={s['reminder-sub']}>{r.sub}</p>
                </div>
                <button
                  className={`${s.switch} ${reminders[r.type].enabled ? s.on : ''}`}
                  role="switch"
                  aria-checked={reminders[r.type].enabled}
                  onClick={() => toggleReminder(r.type)}
                >
                  <span className={s['switch-knob']} />
                </button>
              </div>
              {reminders[r.type].enabled && r.type !== 'vaccination' && (
                <div className={s['reminder-param']}>
                  {r.type === 'feed' && (
                    <ReminderParam
                      mode="interval"
                      label={t('reminders.intervalLabel')}
                      value={reminders.feed.intervalHours}
                      min={0}
                      step={0.5}
                      placeholder={t('reminders.intervalPh', { n: '2.5' })}
                      hint={t('reminders.feed.hint')}
                      onCommit={(v) => commitInterval('feed', v)}
                    />
                  )}
                  {r.type === 'sleep' && (
                    <ReminderParam
                      mode="time"
                      label={t('reminders.sleepTimeLabel')}
                      value={reminders.sleep.time}
                      placeholder={t('common.selectTime')}
                      onCommit={commitSleepTime}
                    />
                  )}
                  {r.type === 'sleep' && reminders.sleep.enabled && (
                    <ReminderParam
                      mode="interval"
                      label={t('reminders.intervalLabel')}
                      value={reminders.sleep.intervalHours}
                      min={0}
                      step={1}
                      placeholder={t('reminders.intervalPh', { n: '4' })}
                      hint={t('reminders.sleep.hint')}
                      onCommit={(v) => commitInterval('sleep', v)}
                    />
                  )}
                  {r.type === 'medication' && (
                    <ReminderParam
                      mode="interval"
                      label={t('reminders.intervalLabel')}
                      value={reminders.medication.intervalHours}
                      min={1}
                      step={1}
                      placeholder={t('reminders.intervalPh', { n: '6' })}
                      hint={t('reminders.medication.hint')}
                      onCommit={(v) => commitInterval('medication', v)}
                    />
                  )}
                  {r.type === 'diaper' && (
                    <ReminderParam
                      mode="interval"
                      label={t('reminders.intervalLabel')}
                      value={reminders.diaper.intervalHours}
                      min={1}
                      step={1}
                      placeholder={t('reminders.intervalPh', { n: '6' })}
                      hint={t('reminders.diaper.hint')}
                      onCommit={(v) => commitInterval('diaper', v)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}

        {/* 免打扰时段：区间内不发系统通知，页面内提醒条保留 */}
        {reminders && (
          <div className={s['reminder-block']}>
            <div className={s['reminder-row']}>
              <div className={s['reminder-info']}>
                <p className={s['reminder-title']}>{t('reminders.quietTitle')}</p>
                <p className={s['reminder-sub']}>{t('reminders.quietSub')}</p>
              </div>
              <button
                className={`${s.switch} ${reminders.quiet.enabled ? s.on : ''}`}
                role="switch"
                aria-checked={reminders.quiet.enabled}
                onClick={toggleQuiet}
              >
                <span className={s['switch-knob']} />
              </button>
            </div>
            {reminders.quiet.enabled && (
              <div className={s['reminder-param']}>
                <ReminderParam
                  mode="time"
                  label={t('reminders.quietStart')}
                  value={reminders.quiet.start}
                  placeholder={t('common.selectTime')}
                  onCommit={(v) => commitQuietTime('start', v)}
                />
                <ReminderParam
                  mode="time"
                  label={t('reminders.quietEnd')}
                  value={reminders.quiet.end}
                  placeholder={t('common.selectTime')}
                  onCommit={(v) => commitQuietTime('end', v)}
                />
              </div>
            )}
          </div>
        )}

        {/* 按月龄推荐喂奶间隔 */}
        {reminders && (
          <button className="btn btn-outline btn-block" onClick={applyAgeRecommendation}>
            {t('settings.recommendInterval', { hours: recommendedHours })}
          </button>
        )}
      </div>

      {/* 分享给朋友 */}
      <p className="section-title">{t('settings.shareSection')}</p>
      <div className="card">
        <p className={s['data-tip']}>{t('settings.shareTip')}</p>
        <button className="btn btn-primary btn-block" onClick={handleShare}>
          {t('settings.shareBtn')}
        </button>
        {shareFeedback && <p className={s['export-ok']}>{shareFeedback}</p>}
      </div>

      {/* 数据管理 */}
      <p className="section-title">{t('settings.dataManage')}</p>
      <div className="card">
        <p className={s['data-tip']}>{t('settings.dataTip')}</p>
        <div className={s['data-counts']}>
          <span>
            {t('log.filters.feeding')} {t('common.records', { n: recordCounts.feedings })}
          </span>
          <span>
            {t('log.filters.diaper')} {t('common.records', { n: recordCounts.diapers })}
          </span>
          <span>
            {t('log.filters.pumping')} {t('common.records', { n: recordCounts.pumpings })}
          </span>
          <span>
            {t('log.filters.sleep')} {t('common.records', { n: recordCounts.sleeps })}
          </span>
          <span>
            {t('log.filters.growth')} {t('common.records', { n: recordCounts.growths })}
          </span>
          <span>
            {t('log.filters.solidFood')} {t('common.records', { n: recordCounts.solidFoods })}
          </span>
          <span>
            {t('log.filters.medication')} {t('common.records', { n: recordCounts.medications })}
          </span>
          <span>
            {t('log.filters.vaccination')} {t('common.records', { n: recordCounts.vaccinations })}
          </span>
          <span>
            {t('log.filters.temperature')} {t('common.records', { n: recordCounts.temperatures })}
          </span>
          <span>
            {t('log.filters.milestone')} {t('common.records', { n: recordCounts.milestones })}
          </span>
        </div>
        <div className={s['data-actions']}>
          <p className={s['data-tip']}>{t('settings.jsonTip')}</p>
          <p className={s['data-tip']}>
            {lastBackupAt
              ? t('settings.lastBackup', { date: formatDate(lastBackupAt) })
              : t('settings.neverBackup')}
          </p>
          <button className="btn btn-primary btn-block" onClick={handleExportJson}>
            {t('settings.exportJson')}
          </button>
          <button
            className="btn btn-outline btn-block"
            disabled={jsonBusy}
            onClick={() => jsonFileRef.current?.click()}
          >
            {t('settings.importJson')}
          </button>
          <input
            ref={jsonFileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={handleJsonFile}
          />
          <button className="btn btn-primary btn-block" disabled={!activeBaby} onClick={handleExportBabyCsv}>
            <span className={s['btn-label']}>
              {activeBaby ? t('settings.exportBabyCsv', { name: activeBaby.name }) : t('common.noBaby')}
            </span>
          </button>
          <button className="btn btn-outline btn-block" onClick={handleExportAllCsv}>
            {t('settings.exportAllCsv')}
          </button>
          <button className="btn btn-outline btn-block" disabled={importBusy} onClick={() => importFileRef.current?.click()}>
            {importBusy ? t('common.importing') : t('common.importCsv')}
          </button>
          <input ref={importFileRef} type="file" accept=".csv,text/csv" hidden onChange={handleImportFile} />
          {exportSuccess && <p className={s['export-ok']}>{t('settings.exportOk')}</p>}
          <button className="btn btn-danger-soft btn-block" onClick={() => setClearAllConfirm(true)}>
            {t('settings.clearAll')}
          </button>
        </div>
      </div>

      {/* 关于 */}
      <p className="section-title">{t('settings.about')}</p>
      <div className="card">
        <p className={s['about-text']}>{t('settings.aboutText1')}</p>
        <p className={s['about-text']}>{t('settings.aboutText2')}</p>
        <p className={s['about-text']}>{t('settings.aboutText3')}</p>
        <p className={`${s['about-text']} ${s.muted}`}>{t('settings.aboutMuted', { version: APP_VERSION })}</p>
        <a
          className={s['about-github']}
          href="https://github.com/LostBeanBun/babysitter-react"
          target="_blank"
          rel="noopener noreferrer"
          title={t('settings.github')}
          aria-label={t('settings.github')}
        >
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>{t('settings.github')}</span>
        </a>
      </div>

      {/* 宝宝编辑弹窗 */}
      <BaseModal
        show={babyModal !== null}
        title={babyModal?.mode === 'edit' ? t('settings.editBaby') : t('settings.addBaby')}
        onClose={() => setBabyModal(null)}
      >
        <form ref={formRef} onSubmit={onBabySubmit}>
        <div className={`form-field${err.has('name') ? ' has-error' : ''}`}>
          <label className="form-label">{t('settings.babyName')} *</label>
          <input
            value={babyName}
            type="text"
            placeholder={t('settings.babyNamePh')}
            className="form-input"
            onChange={(e) => {
              setBabyName(e.target.value)
              err.clear('name')
            }}
          />
          {err.get('name') && <p className="field-error">{err.get('name')}</p>}
        </div>
        <div className={`form-field${err.has('gender') ? ' has-error' : ''}`}>
          <label className="form-label">
            {t('settings.genderLabel')} {babyModal?.mode === 'add' ? '*' : ''}
          </label>
          <div className={s['gender-picker']} role="radiogroup">
            <button
              type="button"
              className={`${s['gender-option']} ${babyGender === 'boy' ? s.selected : ''}`}
              aria-checked={babyGender === 'boy'}
              role="radio"
              onClick={() => {
                setBabyGender('boy')
                err.clear('gender')
              }}
            >
              <span className={s['gender-emoji']}>👦</span>
              {t('settings.genderBoy')}
            </button>
            <button
              type="button"
              className={`${s['gender-option']} ${babyGender === 'girl' ? s.selected : ''}`}
              aria-checked={babyGender === 'girl'}
              role="radio"
              onClick={() => {
                setBabyGender('girl')
                err.clear('gender')
              }}
            >
              <span className={s['gender-emoji']}>👧</span>
              {t('settings.genderGirl')}
            </button>
          </div>
          {err.get('gender') && <p className="field-error">{err.get('gender')}</p>}
        </div>
        <div className={`form-field${err.has('birthDate') ? ' has-error' : ''}`}>
          <label className="form-label">{t('settings.birthDate')} *</label>
          <input
            value={babyBirthDate}
            type="date"
            placeholder={t('common.selectDate')}
            className="form-input"
            onChange={(e) => {
              setBabyBirthDate(e.target.value)
              err.clear('birthDate')
            }}
          />
          {err.get('birthDate') && <p className="field-error">{err.get('birthDate')}</p>}
        </div>
        <div className="form-field">
          <label className="form-label">{t('settings.avatarLabel')}</label>
          <div className="avatar-picker">
            {BABY_AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                className={`${s['avatar-option']} ${babyAvatar === a ? s.selected : ''}`}
                onClick={() => setBabyAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={() => setBabyModal(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('settings.saveBaby')}
          </button>
        </div>
        </form>
      </BaseModal>

      {/* 删除宝宝确认 */}
      <BaseModal
        show={deleteBabyConfirm !== null}
        title={t('settings.deleteBabyTitle')}
        onClose={() => setDeleteBabyConfirm(null)}
      >
        <p className={s['confirm-text']}>{t('settings.deleteBabyText', { name: deleteBabyConfirm?.name ?? '' })}</p>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setDeleteBabyConfirm(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger-soft" onClick={confirmDeleteBaby}>
            {t('log.confirmDelete')}
          </button>
        </div>
      </BaseModal>

      {/* 从 JSON 备份恢复确认 */}
      <BaseModal
        show={jsonImportPending !== null}
        title={t('settings.restoreConfirmTitle')}
        onClose={() => setJsonImportPending(null)}
      >
        <p className={s['confirm-text']}>{t('settings.restoreConfirmText')}</p>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setJsonImportPending(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger-soft" disabled={jsonBusy} onClick={confirmJsonImport}>
            {t('settings.confirmRestore')}
          </button>
        </div>
      </BaseModal>

      {/* 清空数据确认 */}
      <BaseModal show={clearAllConfirm} title={t('settings.clearConfirmTitle')} onClose={() => setClearAllConfirm(false)}>
        <p className={s['confirm-text']}>{t('settings.clearConfirmText')}</p>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={() => setClearAllConfirm(false)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger-soft" disabled={clearBusy} onClick={confirmClearAll}>
            {t('settings.confirmClear')}
          </button>
        </div>
      </BaseModal>
    </div>
  )
}
