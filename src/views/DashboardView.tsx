'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { toast } from '@/stores/toast'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import PageHeader from '@/components/common/PageHeader'
import BaseModal from '@/components/common/BaseModal'
import OnboardingModal from '@/components/dashboard/OnboardingModal'
import TodayOverview from '@/components/dashboard/TodayOverview'
import FeedingForm, { type FeedingFormProps } from '@/components/forms/FeedingForm'
import DiaperForm, { type DiaperFormProps } from '@/components/forms/DiaperForm'
import PumpingForm, { type PumpingFormProps } from '@/components/forms/PumpingForm'
import SleepForm from '@/components/forms/SleepForm'
import GrowthForm from '@/components/forms/GrowthForm'
import SolidFoodForm from '@/components/forms/SolidFoodForm'
import MedicationForm from '@/components/forms/MedicationForm'
import VaccinationForm from '@/components/forms/VaccinationForm'
import TemperatureForm from '@/components/forms/TemperatureForm'
import MilestoneForm from '@/components/forms/MilestoneForm'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { FEED_TYPE_LABELS } from '@/constants'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useSleepModal } from '@/hooks/useSleepModal'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import { recordQuickUse, sortQuickKinds } from '@/utils/quickOrder'
import type { FeedType, Vaccination, RecordKind } from '@/types'
import s from './DashboardView.module.css'

type EntryKind =
  | 'feeding'
  | 'diaper'
  | 'pumping'
  | 'sleep'
  | 'growth'
  | 'solidFood'
  | 'medication'
  | 'vaccination'
  | 'temperature'
  | 'milestone'

const FEED_TYPE_CHOICES = Object.entries(FEED_TYPE_LABELS).map(([value, label]) => ({
  value: value as FeedType,
  label,
}))

export default function DashboardView() {
  const { t } = useTranslation()
  const { babies, activeBabyId } = useBabies()
  const activeTimer = useActiveTimer()
  const sleepModal = useSleepModal()

  const hasBaby = babies.length > 0

  // 页面标题
  useEffect(() => {
    document.title = `${t('nav.dashboard')} · ${t('app.name')}`
  }, [t])

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const nowTimer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(nowTimer)
  }, [])

  const [onboardingOpen, setOnboardingOpen] = useState(false)

  // —— 奶睡一键（组合记录喂养 + 睡眠）——
  const [sleepFeedOpen, setSleepFeedOpen] = useState(false)
  const [sfType, setSfType] = useState<FeedType>('breast')
  const [sfAmount, setSfAmount] = useState('')
  const [sfStart, setSfStart] = useState(() => toDateTimeLocal(Date.now()))
  const [sfSleepEnd, setSfSleepEnd] = useState(() => toDateTimeLocal(Date.now() + 2 * 3600_000))
  const [sfNotes, setSfNotes] = useState('')
  const sfErr = useFormErrors()

  function openSleepFeed() {
    sfErr.clearAll()
    setSleepFeedOpen(true)
  }

  async function saveSleepFeed() {
    sfErr.clearAll()
    const start = fromDateTimeLocal(sfStart)
    const end = fromDateTimeLocal(sfSleepEnd)
    if (start == null || isNaN(start)) {
      sfErr.set('start', t('dashboard.selectStart'))
      return
    }
    if (end == null || isNaN(end) || end <= start) {
      sfErr.set('sleepEnd', t('dashboard.sleepEndAfter'))
      return
    }
    let amount: number | undefined
    if (sfType === 'bottle_formula' || sfType === 'bottle_breastmilk') {
      amount = sfAmount ? Number(sfAmount) : undefined
      if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        sfErr.set('amount', t('dashboard.invalidAmount'))
        return
      }
    }
    if (activeBabyId == null) return
    const ts = Date.now()
    await db.feedings.add({
      babyId: activeBabyId,
      type: sfType,
      side: sfType === 'breast' ? 'both' : undefined,
      startTime: start,
      amount,
      createdAt: ts,
      updatedAt: ts,
    })
    await db.sleeps.add({
      babyId: activeBabyId,
      type: 'nap',
      startTime: start,
      endTime: end,
      duration: end - start,
      notes: sfNotes || undefined,
      createdAt: ts,
      updatedAt: ts,
    })
    activeTimer.reset()
    setSleepFeedOpen(false)
    setSfType('breast')
    setSfAmount('')
    setSfStart(toDateTimeLocal(Date.now()))
    setSfSleepEnd(toDateTimeLocal(Date.now() + 2 * 3600_000))
    setSfNotes('')
  }

  const { formRef, onSubmit: onSleepFeedSubmit } = useFormSubmit(saveSleepFeed)

  // 记录弹窗状态
  const [modalKind, setModalKind] = useState<EntryKind | null>(null)
  /** 「重复上次」参数预填（不含 id/时间） */
  const [prefill, setPrefill] = useState<Record<string, unknown> | null>(null)
  /** 疫苗提醒直接编辑：打开对应计划记录的编辑弹窗 */
  const [editingVaccination, setEditingVaccination] = useState<Vaccination | null>(null)

  // 表单弹窗打开时隐藏悬浮球
  useEffect(() => {
    if (modalKind !== null) sleepModal.openModal()
    else sleepModal.closeModal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalKind])

  function openAdd(kind: EntryKind, nextPrefill: Record<string, unknown> | null = null) {
    setEditingVaccination(null)
    setPrefill(nextPrefill)
    setModalKind(kind)
  }

  /** 重复上次：只复用参数，时间由表单取当前 */
  function onRepeat(kind: RecordKind, nextPrefill: Record<string, unknown>) {
    openAdd(kind as EntryKind, nextPrefill)
  }

  /** 点击疫苗提醒：打开对应计划记录编辑 */
  function onEditVaccination(v: Vaccination) {
    setEditingVaccination(v)
    setModalKind('vaccination')
  }

  /** 开始记录：保存开始时间，关闭弹窗，悬浮球出现 */
  function onStartRecord() {
    setModalKind(null)
    toast(t('common.recordStarted'))
  }

  /** 结束记录 / 编辑保存：关闭弹窗 */
  function onSaved() {
    setModalKind(null)
    setEditingVaccination(null)
    setPrefill(null)
    toast(t('common.recordSaved'))
  }

  function onCancelled() {
    setModalKind(null)
    setEditingVaccination(null)
    setPrefill(null)
  }

  const modalTitle = editingVaccination ? t('log.editTitle') : t('log.addTitle')

  // —— 快捷记录按使用频率排序（下次打开时常用类型置前）——
  const QUICK_KINDS: EntryKind[] = [
    'feeding',
    'diaper',
    'sleep',
    'pumping',
    'growth',
    'solidFood',
    'medication',
    'vaccination',
    'temperature',
    'milestone',
  ]
  const [quickKinds] = useState<EntryKind[]>(() => sortQuickKinds(QUICK_KINDS))
  const quickOrder = useMemo(() => {
    const map = new Map<EntryKind, number>()
    quickKinds.forEach((k, i) => map.set(k, i))
    return map
  }, [quickKinds])

  function handleQuick(kind: EntryKind) {
    recordQuickUse(kind)
    openAdd(kind)
  }

  return (
    <div className="page dashboard">
      <PageHeader />

      {/* 首次使用引导 */}
      {!hasBaby && (
        <div className={s.welcome}>
          <div className={s['welcome-icon']}>👶</div>
          <h2 className={s['welcome-title']}>{t('dashboard.welcomeTitle')}</h2>
          <p className={s['welcome-text']}>
            {t('dashboard.welcomeText1')}
            <br />
            {t('dashboard.welcomeText2')}
          </p>
          <button className={`btn btn-primary btn-lg ${s['welcome-btn']}`} onClick={() => setOnboardingOpen(true)}>
            {t('dashboard.startBtn')}
          </button>
          <Link href="/settings" className={`btn btn-outline ${s['welcome-btn']}`}>
            {t('dashboard.importHint')}
          </Link>
        </div>
      )}

      {hasBaby && (
        <>
          {/* 今日概览（提醒条 + 统计卡 + 小结按钮） */}
          <TodayOverview now={now} onEdit={onEditVaccination} onRepeat={onRepeat} />

          {/* 快捷记录 */}
          <p className="section-title">{t('dashboard.quickRecord')}</p>
          <div className={s['quick-actions']}>
            <button className={`${s['quick-btn']} ${s.feed}`} style={{ order: quickOrder.get('feeding') }} onClick={() => handleQuick('feeding')}>
              <span className={s['quick-icon']}>🍼</span>
              <span className={s['quick-label']}>{t('log.filters.feeding')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.diaper}`} style={{ order: quickOrder.get('diaper') }} onClick={() => handleQuick('diaper')}>
              <span className={s['quick-icon']}>🧷</span>
              <span className={s['quick-label']}>{t('log.filters.diaper')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.sleep}`} style={{ order: quickOrder.get('sleep') }} onClick={() => handleQuick('sleep')}>
              <span className={s['quick-icon']}>😴</span>
              <span className={s['quick-label']}>{t('log.filters.sleep')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.pump}`} style={{ order: quickOrder.get('pumping') }} onClick={() => handleQuick('pumping')}>
              <span className={s['quick-icon']}>🎀</span>
              <span className={s['quick-label']}>{t('log.filters.pumping')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.growth}`} style={{ order: quickOrder.get('growth') }} onClick={() => handleQuick('growth')}>
              <span className={s['quick-icon']}>📏</span>
              <span className={s['quick-label']}>{t('log.filters.growth')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.solidFood}`} style={{ order: quickOrder.get('solidFood') }} onClick={() => handleQuick('solidFood')}>
              <span className={s['quick-icon']}>🍎</span>
              <span className={s['quick-label']}>{t('log.filters.solidFood')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.medication}`} style={{ order: quickOrder.get('medication') }} onClick={() => handleQuick('medication')}>
              <span className={s['quick-icon']}>💊</span>
              <span className={s['quick-label']}>{t('log.filters.medication')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.vaccination}`} style={{ order: quickOrder.get('vaccination') }} onClick={() => handleQuick('vaccination')}>
              <span className={s['quick-icon']}>💉</span>
              <span className={s['quick-label']}>{t('log.filters.vaccination')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.temperature}`} style={{ order: quickOrder.get('temperature') }} onClick={() => handleQuick('temperature')}>
              <span className={s['quick-icon']}>🌡️</span>
              <span className={s['quick-label']}>{t('log.filters.temperature')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.milestone}`} style={{ order: quickOrder.get('milestone') }} onClick={() => handleQuick('milestone')}>
              <span className={s['quick-icon']}>🌟</span>
              <span className={s['quick-label']}>{t('log.filters.milestone')}</span>
            </button>
          </div>

          {/* 奶睡一键（与快捷记录同组） */}
          <button className={`btn btn-outline ${s['sleep-feed-btn']}`} onClick={openSleepFeed}>
            <span className={s['sf-btn-icon']}>🍼😴</span>
            <span>{t('dashboard.sleepFeedButton')}</span>
          </button>

          {/* 记录弹窗 */}
          <BaseModal
            show={modalKind !== null}
            title={modalTitle}
            onClose={() => {
              setModalKind(null)
              setEditingVaccination(null)
              setPrefill(null)
            }}
          >
            {modalKind === 'feeding' && (
              <FeedingForm
                prefill={prefill as FeedingFormProps['prefill']}
                onStartRecord={onStartRecord}
                onSaved={onSaved}
                onCancelled={onCancelled}
              />
            )}
            {modalKind === 'diaper' && (
              <DiaperForm prefill={prefill as DiaperFormProps['prefill']} onSaved={onSaved} onCancelled={onCancelled} />
            )}
            {modalKind === 'pumping' && (
              <PumpingForm
                prefill={prefill as PumpingFormProps['prefill']}
                onStartRecord={onStartRecord}
                onSaved={onSaved}
                onCancelled={onCancelled}
              />
            )}
            {modalKind === 'sleep' && (
              <SleepForm onStartRecord={onStartRecord} onSaved={onSaved} onCancelled={onCancelled} />
            )}
            {modalKind === 'growth' && <GrowthForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'solidFood' && <SolidFoodForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'medication' && <MedicationForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'vaccination' && (
              <VaccinationForm
                editing={editingVaccination?.id != null ? { ...editingVaccination, id: editingVaccination.id } : undefined}
                onSaved={onSaved}
                onCancelled={onCancelled}
              />
            )}
            {modalKind === 'temperature' && <TemperatureForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'milestone' && <MilestoneForm onSaved={onSaved} onCancelled={onCancelled} />}
          </BaseModal>
        </>
      )}

      {/* 奶睡组合弹窗 */}
      <BaseModal
        show={sleepFeedOpen}
        title={t('dashboard.sleepFeedTitle')}
        onClose={() => {
          activeTimer.reset()
          setSleepFeedOpen(false)
        }}
      >
        <form ref={formRef} onSubmit={onSleepFeedSubmit}>
        <div className="form-field">
          <label className="form-label">{t('feed.typeLabel')}</label>
          <select value={sfType} className="form-input" onChange={(e) => setSfType(e.target.value as FeedType)}>
            {FEED_TYPE_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.label)}
              </option>
            ))}
          </select>
        </div>
        {(sfType === 'bottle_formula' || sfType === 'bottle_breastmilk') && (
          <div className={`form-field${sfErr.has('amount') ? ' has-error' : ''}`}>
            <label className="form-label">{t('dashboard.sleepFeedAmount')}</label>
            <input
              value={sfAmount}
              type="number"
              min={0}
              step={5}
              placeholder={t('dashboard.sleepFeedAmountPh')}
              className="form-input"
              inputMode="numeric"
              onChange={(e) => {
                setSfAmount(e.target.value)
                sfErr.clear('amount')
              }}
            />
            {sfErr.get('amount') && <p className="field-error">{sfErr.get('amount')}</p>}
          </div>
        )}
        <div className={`form-field${sfErr.has('start') ? ' has-error' : ''}`}>
          <label className="form-label">{t('feed.startLabel')}</label>
          <input
            value={sfStart}
            type="datetime-local"
            step="1"
            placeholder={t('common.selectDateTime')}
            className="form-input"
            onChange={(e) => {
              setSfStart(e.target.value)
              sfErr.clear('start')
            }}
          />
          {sfErr.get('start') && <p className="field-error">{sfErr.get('start')}</p>}
        </div>
        <div className={`form-field${sfErr.has('sleepEnd') ? ' has-error' : ''}`}>
          <label className="form-label">{t('sleep.endLabel')}</label>
          <input
            value={sfSleepEnd}
            type="datetime-local"
            step="1"
            placeholder={t('common.selectDateTime')}
            className="form-input"
            onChange={(e) => {
              setSfSleepEnd(e.target.value)
              sfErr.clear('sleepEnd')
            }}
          />
          {sfErr.get('sleepEnd') && <p className="field-error">{sfErr.get('sleepEnd')}</p>}
        </div>
        <div className="form-field">
          <label className="form-label">
            {t('sleep.notesLabel')}（{t('common.optional')}）
          </label>
          <input
            value={sfNotes}
            type="text"
            placeholder={t('dashboard.sleepFeedNotesPh')}
            className="form-input"
            onChange={(e) => setSfNotes(e.target.value)}
          />
        </div>
        <div className={s['form-actions']}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              activeTimer.reset()
              setSleepFeedOpen(false)
            }}
          >
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('dashboard.oneTapRecord')}
          </button>
        </div>
        </form>
      </BaseModal>

      {/* 首次引导添加宝宝弹窗 */}
      <OnboardingModal show={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
