'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { toast } from '@/stores/toast'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import PageHeader from '@/components/common/PageHeader'
import BaseModal from '@/components/common/BaseModal'
import OnboardingModal from '@/components/dashboard/OnboardingModal'
import TodayOverview from '@/components/dashboard/TodayOverview'
import FeedingForm from '@/components/forms/FeedingForm'
import DiaperForm from '@/components/forms/DiaperForm'
import PumpingForm from '@/components/forms/PumpingForm'
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
import type { FeedType, SleepType } from '@/types'
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
  const [sfSleepType, setSfSleepType] = useState<SleepType>('nap')
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
      type: sfSleepType,
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
    setSfSleepType('nap')
    setSfSleepEnd(toDateTimeLocal(Date.now() + 2 * 3600_000))
    setSfNotes('')
  }

  // 记录弹窗状态
  const [modalKind, setModalKind] = useState<EntryKind | null>(null)

  // 表单弹窗打开时隐藏悬浮球
  useEffect(() => {
    if (modalKind !== null) sleepModal.openModal()
    else sleepModal.closeModal()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalKind])

  function openAdd(kind: EntryKind) {
    setModalKind(kind)
  }

  /** 开始记录：保存开始时间，关闭弹窗，悬浮球出现 */
  function onStartRecord() {
    setModalKind(null)
    toast(t('common.recordStarted'))
  }

  /** 结束记录 / 编辑保存：关闭弹窗 */
  function onSaved() {
    setModalKind(null)
    toast(t('common.recordSaved'))
  }

  function onCancelled() {
    setModalKind(null)
  }

  const modalTitle = t('log.addTitle')

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
          <TodayOverview now={now} onAdd={() => openAdd('vaccination')} />

          {/* 快捷记录 */}
          <p className="section-title">{t('dashboard.quickRecord')}</p>
          <div className={s['quick-actions']}>
            <button className={`${s['quick-btn']} ${s.feed}`} onClick={() => openAdd('feeding')}>
              <span className={s['quick-icon']}>🍼</span>
              <span className={s['quick-label']}>{t('log.filters.feeding')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.diaper}`} onClick={() => openAdd('diaper')}>
              <span className={s['quick-icon']}>🧷</span>
              <span className={s['quick-label']}>{t('log.filters.diaper')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.sleep}`} onClick={() => openAdd('sleep')}>
              <span className={s['quick-icon']}>😴</span>
              <span className={s['quick-label']}>{t('log.filters.sleep')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.pump}`} onClick={() => openAdd('pumping')}>
              <span className={s['quick-icon']}>🎀</span>
              <span className={s['quick-label']}>{t('log.filters.pumping')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.growth}`} onClick={() => openAdd('growth')}>
              <span className={s['quick-icon']}>📏</span>
              <span className={s['quick-label']}>{t('log.filters.growth')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.solidFood}`} onClick={() => openAdd('solidFood')}>
              <span className={s['quick-icon']}>🍎</span>
              <span className={s['quick-label']}>{t('log.filters.solidFood')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.medication}`} onClick={() => openAdd('medication')}>
              <span className={s['quick-icon']}>💊</span>
              <span className={s['quick-label']}>{t('log.filters.medication')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.vaccination}`} onClick={() => openAdd('vaccination')}>
              <span className={s['quick-icon']}>💉</span>
              <span className={s['quick-label']}>{t('log.filters.vaccination')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.temperature}`} onClick={() => openAdd('temperature')}>
              <span className={s['quick-icon']}>🌡️</span>
              <span className={s['quick-label']}>{t('log.filters.temperature')}</span>
            </button>
            <button className={`${s['quick-btn']} ${s.milestone}`} onClick={() => openAdd('milestone')}>
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
          <BaseModal show={modalKind !== null} title={modalTitle} onClose={() => setModalKind(null)}>
            {modalKind === 'feeding' && (
              <FeedingForm onStartRecord={onStartRecord} onSaved={onSaved} onCancelled={onCancelled} />
            )}
            {modalKind === 'diaper' && <DiaperForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'pumping' && (
              <PumpingForm onStartRecord={onStartRecord} onSaved={onSaved} onCancelled={onCancelled} />
            )}
            {modalKind === 'sleep' && (
              <SleepForm onStartRecord={onStartRecord} onSaved={onSaved} onCancelled={onCancelled} />
            )}
            {modalKind === 'growth' && <GrowthForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'solidFood' && <SolidFoodForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'medication' && <MedicationForm onSaved={onSaved} onCancelled={onCancelled} />}
            {modalKind === 'vaccination' && <VaccinationForm onSaved={onSaved} onCancelled={onCancelled} />}
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
        <div className="form-field">
          <label className="form-label">{t('sleep.typeLabel')}</label>
          <select
            value={sfSleepType}
            className="form-input"
            onChange={(e) => setSfSleepType(e.target.value as SleepType)}
          >
            <option value="nap">{t('sleep.types.nap')}</option>
            <option value="night">{t('sleep.types.night')}</option>
          </select>
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
            className="btn btn-outline"
            onClick={() => {
              activeTimer.reset()
              setSleepFeedOpen(false)
            }}
          >
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={saveSleepFeed}>
            {t('dashboard.oneTapRecord')}
          </button>
        </div>
      </BaseModal>

      {/* 首次引导添加宝宝弹窗 */}
      <OnboardingModal show={onboardingOpen} onClose={() => setOnboardingOpen(false)} />
    </div>
  )
}
