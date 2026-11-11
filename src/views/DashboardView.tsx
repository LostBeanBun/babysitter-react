'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import PageHeader from '@/components/common/PageHeader'
import BaseModal from '@/components/common/BaseModal'
import RecordFormModal from '@/components/common/RecordFormModal'
import OnboardingModal from '@/components/dashboard/OnboardingModal'
import TodayOverview from '@/components/dashboard/TodayOverview'
import CarePlanCard from '@/components/dashboard/CarePlanCard'
import AnomalyCard from '@/components/dashboard/AnomalyCard'
import { toDateTimeLocal, fromDateTimeLocal, formatDate } from '@/utils/format'
import { FEED_TYPE_LABELS } from '@/constants'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import { useRecordModal } from '@/hooks/useRecordModal'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import { KIND_COLORS } from '@/services/timeline'
import type { TimelineEntry } from '@/services/timeline'
import type { FeedType, RecordKind, Vaccination } from '@/types'
import s from './DashboardView.module.css'

const FEED_TYPE_CHOICES = Object.entries(FEED_TYPE_LABELS).map(([value, label]) => ({
  value: value as FeedType,
  label,
}))

export default function DashboardView() {
  const { t } = useTranslation()
  const { babies, activeBabyId } = useBabies()
  const activeTimer = useActiveTimer()

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

  // 记录弹窗（与 Vue 端一致：useRecordModal 统一管理新增/编辑/删除）
  const {
    modalState,
    openAdd,
    onEdit,
    onStartRecord,
    onSaved,
    onCancelled,
    closeForm,
  } = useRecordModal()

  /** 疫苗计划记录：点击提醒条时按 id 取最新记录，已删除则回退为新增 */
  const vaccinations = useRecordsLive('vaccinations', activeBabyId)

  function onEditVaccination(v: Vaccination) {
    const current = vaccinations?.find((x) => x.id === v.id)
    if (!current) {
      openAdd('vaccination')
      return
    }
    const entry: TimelineEntry = {
      id: current.id!,
      kind: 'vaccination',
      time: current.date,
      icon: '💉',
      color: current.status === 'done' ? '#6AB0D8' : '#D8A45A',
      kindColor: KIND_COLORS.vaccination,
      title: current.name,
      detail: current.dose ?? '',
      timeLabel: formatDate(current.date),
      raw: current,
    }
    onEdit(entry)
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
          {/* 今日概览（提醒条） */}
          <TodayOverview now={now} onEdit={onEditVaccination} onAdd={openAdd} />

          {/* 今日照护卡：今日汇总 + 下一步参考 + 交接摘要 */}
          <CarePlanCard now={now} onAdd={openAdd} />

          {/* 值得留意：近 3 天 vs 前 7 天的记录变化与体温提示（无异常时隐藏） */}
          <AnomalyCard now={now} />

          {/* 快捷记录（喂养 / 睡眠 / 换尿布已并入今日照护，不再重复展示） */}
          <p className="section-title">{t('dashboard.quickRecord')}</p>
          <div className={s['quick-actions']}>
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
          <RecordFormModal
            state={modalState}
            onClose={closeForm}
            onSaved={onSaved}
            onCancelled={onCancelled}
            onStartRecord={onStartRecord}
          />
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
