'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '@/components/common/PageHeader'
import BaseModal from '@/components/common/BaseModal'
import ReminderParam from '@/components/settings/ReminderParam'
import { countAllRecords, clearAllData, clearBabyData, db } from '@/db'
import { exportBabyCsvs, exportAllBabiesCsv, importAllCsv } from '@/services/export'
import { BABY_AVATARS } from '@/constants'
import { loadReminders, saveReminders, type ReminderConfig, type ReminderType } from '@/utils/reminderScheduler'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
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

  function persistReminders() {
    if (reminders) saveReminders(reminders)
  }

  function setIntervalReminder(type: 'feed' | 'medication' | 'diaper' | 'sleep', v: number | string) {
    if (!reminders) return
    const hours = typeof v === 'number' ? v : Number(v)
    setReminders({ ...reminders, [type]: { ...reminders[type], intervalHours: hours } })
  }

  function setSleepTime(v: number | string) {
    if (!reminders) return
    setReminders({ ...reminders, sleep: { ...reminders.sleep, time: String(v) } })
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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportBusy(true)
    try {
      const result = await importAllCsv(file)
      alert(
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
      )
      setRecordCounts(await countAllRecords())
    } catch {
      alert(t('settings.importFailed'))
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
                      onValueChange={(v) => setIntervalReminder('feed', v)}
                      onChange={persistReminders}
                    />
                  )}
                  {r.type === 'sleep' && (
                    <ReminderParam
                      mode="time"
                      label={t('reminders.sleepTimeLabel')}
                      value={reminders.sleep.time}
                      placeholder={t('common.selectTime')}
                      onValueChange={setSleepTime}
                      onChange={persistReminders}
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
                      onValueChange={(v) => setIntervalReminder('sleep', v)}
                      onChange={persistReminders}
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
                      onValueChange={(v) => setIntervalReminder('medication', v)}
                      onChange={persistReminders}
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
                      onValueChange={(v) => setIntervalReminder('diaper', v)}
                      onChange={persistReminders}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
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
        <p className={`${s['about-text']} ${s.muted}`}>{t('settings.aboutMuted')}</p>
      </div>

      {/* 宝宝编辑弹窗 */}
      <BaseModal
        show={babyModal !== null}
        title={babyModal?.mode === 'edit' ? t('settings.editBaby') : t('settings.addBaby')}
        onClose={() => setBabyModal(null)}
      >
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
          <button className="btn btn-outline" onClick={() => setBabyModal(null)}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={saveBaby}>
            {t('settings.saveBaby')}
          </button>
        </div>
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
