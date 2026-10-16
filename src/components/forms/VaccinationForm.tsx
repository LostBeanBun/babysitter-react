'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordsLive } from '@/hooks/useRecordsLive'
import type { VaccinationStatus, Vaccination } from '@/types'
import { toDateTimeLocal, fromDateTimeLocal, formatDate, startOfDay } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import {
  VACCINE_PLAN,
  SELF_PAID_VACCINE_PLAN,
  planDateFromBirth,
  type VaccinePlanItem,
  type VaccinePlanCategory,
} from '@/constants/vaccinePlan'
import BaseModal from '@/components/common/BaseModal'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import { buildIcs, deliverIcs, googleCalendarUrl, type CalendarEvent } from '@/services/calendar'
import s from './VaccinationForm.module.css'

export interface VaccinationFormProps {
  editing?: {
    id: number
    date: number
    name: string
    dose?: string
    status: VaccinationStatus
    notes?: string
  }
  onSaved?: () => void
  onCancelled?: () => void
}

const STATUS_OPTIONS: { value: VaccinationStatus; label: string; icon: string; color: string }[] = [
  { value: 'planned', label: 'vaccination.statusPlanned', icon: '⏰', color: '#D8A45A' },
  { value: 'done', label: 'vaccination.statusDone', icon: '✅', color: '#6AB86A' },
]

export default function VaccinationForm({ editing, onSaved, onCancelled }: VaccinationFormProps) {
  const { t } = useTranslation()
  const { activeBaby, activeBabyId } = useBabies()
  const err = useFormErrors()

  const [name, setName] = useState(editing?.name ?? '')
  const [dose, setDose] = useState(editing?.dose ?? '')
  const [date, setDate] = useState(() => toDateTimeLocal(editing?.date ?? Date.now()).slice(0, 10))
  const [status, setStatus] = useState<VaccinationStatus>(editing?.status ?? 'planned')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const [planOpen, setPlanOpen] = useState(false)
  const [planTab, setPlanTab] = useState<VaccinePlanCategory>('free')

  // 计划接种（新增或编辑）保存后保留弹窗，提供「添加到系统日历」
  const [savedPlan, setSavedPlan] = useState<{
    id: number
    name: string
    dose?: string
    date: number
    editing: boolean
  } | null>(null)
  const [calBusy, setCalBusy] = useState(false)
  const [calFeedback, setCalFeedback] = useState<string | null>(null)

  const vaccinationsResult = useRecordsLive('vaccinations', activeBabyId)
  const vaccinations = useMemo(() => vaccinationsResult ?? [], [vaccinationsResult])

  const planItems = planTab === 'free' ? VACCINE_PLAN : SELF_PAID_VACCINE_PLAN

  const existingKeys = useMemo(
    // 编辑中的记录自身不算占用，允许重选以刷新名称/日期
    () => new Set(vaccinations.filter((v) => v.id !== editing?.id).map((v) => `${v.name}|${v.dose ?? ''}`)),
    [vaccinations, editing?.id],
  )

  function pickFromPlan(item: VaccinePlanItem) {
    if (!activeBaby?.birthDate) {
      alert(t('vaccination.needBirthDate'))
      return
    }
    setName(item.name)
    setDose(item.dose)
    setDate(planDateFromBirth(activeBaby.birthDate, item.months))
    setPlanOpen(false)
  }

  async function submit() {
    err.clearAll()
    if (!name.trim()) {
      err.set('name', t('vaccination.invalidName'))
      return
    }
    const d = fromDateTimeLocal(date + 'T00:00:00')
    if (d == null || isNaN(d)) {
      err.set('date', t('vaccination.invalidDate'))
      return
    }
    if (editing) {
      await db.vaccinations.update(editing.id, {
        date: d,
        name: name.trim(),
        dose: dose || undefined,
        status,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
      // 计划接种（编辑）同样保留弹窗提供添加到日历；已接种直接关闭
      if (status === 'planned') {
        setSavedPlan({ id: editing.id, name: name.trim(), dose: dose || undefined, date: d, editing: true })
        return
      }
      onSaved?.()
      return
    }
    if (activeBabyId == null) throw new Error(t('errors.noBaby'))
    const now = Date.now()
    const id = await db.vaccinations.add({
      babyId: activeBabyId,
      date: d,
      name: name.trim(),
      dose: dose || undefined,
      status,
      notes: notes || undefined,
      createdAt: now,
      updatedAt: now,
    })
    if (id == null) throw new Error(t('errors.addRecordFail'))
    if (status === 'planned') {
      setSavedPlan({ id, name: name.trim(), dose: dose || undefined, date: d, editing: false })
      return
    }
    onSaved?.()
  }

  const { formRef, onSubmit } = useFormSubmit(submit)

  /** 记录 → 日历事件（同一条记录 UID 稳定：再次添加视为更新同一条事件） */
  function calEventOf(record: { id?: number; name: string; dose?: string; date: number }): CalendarEvent {
    const label = record.dose ? `${record.name} · ${record.dose}` : record.name
    return {
      uid: `vaccination-${record.id}@babysitter`,
      title: t('vaccination.calEventTitle', { label }),
      date: record.date,
      description: t('vaccination.calEventDesc', { app: t('app.name') }),
    }
  }

  /** 同一天的其它计划接种（批量为这一天的全部记录各建一条独立事件，可单独修改） */
  const sameDateOthers = useMemo(() => {
    if (!savedPlan) return []
    const day = startOfDay(savedPlan.date)
    return vaccinations.filter((v) => v.status === 'planned' && v.id !== savedPlan.id && startOfDay(v.date) === day)
  }, [vaccinations, savedPlan])

  /** Google 日历网页链接（单条，无需下载文件） */
  const googleUrl = savedPlan ? googleCalendarUrl(calEventOf(savedPlan)) : ''

  /** 交付 .ics 并给出结果反馈 */
  async function deliver(events: CalendarEvent[], filename: string, title: string) {
    setCalFeedback(null)
    const result = await deliverIcs(buildIcs(events), filename, title)
    setCalFeedback(
      result === 'shared'
        ? t('vaccination.calShared')
        : result === 'downloaded'
          ? t('vaccination.calDownloaded')
          : result === 'failed'
            ? t('vaccination.calFailed')
            : null,
    )
  }

  /** 添加本条到系统日历（含「提前 1 天」与「当天」两条提醒） */
  async function addToCalendar() {
    if (!savedPlan || calBusy) return
    setCalBusy(true)
    const event = calEventOf(savedPlan)
    await deliver([event], `vaccine-${savedPlan.id}.ics`, event.title)
    setCalBusy(false)
  }

  /** 一次添加这一天的全部计划接种（含本条），逐条独立事件 */
  async function addSameDateToCalendar() {
    if (!savedPlan || calBusy) return
    setCalBusy(true)
    const day = formatDate(savedPlan.date)
    await deliver([savedPlan, ...sameDateOthers].map(calEventOf), `vaccines-${day}.ics`, day)
    setCalBusy(false)
  }

  /** 完成：关闭弹窗（由父级收尾） */
  function finishSavedPlan() {
    setSavedPlan(null)
    onSaved?.()
  }

  return (
    <form ref={formRef} className="vaccination-form" onSubmit={onSubmit}>
      {/* 计划接种保存后：保持弹窗，提供「添加到系统日历」 */}
      {savedPlan ? (
        <div className={s['cal-saved']}>
          <p className={s['cal-saved-title']}>
            ✅ {t(savedPlan.editing ? 'vaccination.calUpdatedTitle' : 'vaccination.calSavedTitle')}
          </p>
          <p className={s['cal-saved-meta']}>
            {savedPlan.dose ? `${savedPlan.name} · ${savedPlan.dose}` : savedPlan.name} · {formatDate(savedPlan.date)}
          </p>
          <p className={s['cal-hint']}>{t(savedPlan.editing ? 'vaccination.calUpdateHint' : 'vaccination.calHint')}</p>
          <button type="button" className="btn btn-primary btn-block" disabled={calBusy} onClick={addToCalendar}>
            📅 {t('vaccination.calAdd')}
          </button>
          {sameDateOthers.length > 0 && (
            <button
              type="button"
              className="btn btn-outline btn-block"
              disabled={calBusy}
              onClick={addSameDateToCalendar}
            >
              💉 {t('vaccination.calBatchAdd', { n: sameDateOthers.length + 1 })}
            </button>
          )}
          <a className={s['cal-google']} href={googleUrl} target="_blank" rel="noopener noreferrer">
            🔗 {t('vaccination.calGoogle')}
          </a>
          {calFeedback && <p className={s['cal-feedback']}>{calFeedback}</p>}
          <button type="button" className="btn btn-outline btn-block" onClick={finishSavedPlan}>
            {t('vaccination.calDone')}
          </button>
        </div>
      ) : (
        <>
      <div className={`form-field${err.has('name') ? ' has-error' : ''}`}>
        <label className="form-label">{t('vaccination.nameLabel')}</label>
        <div className={s['name-row']}>
          <input
            value={name}
            type="text"
            placeholder={t('vaccination.namePlaceholder')}
            className="form-input"
            onChange={(e) => {
              setName(e.target.value)
              err.clear('name')
            }}
          />
          <button type="button" className={`btn btn-outline ${s['plan-btn']}`} onClick={() => setPlanOpen(true)}>
            📋 {t('vaccination.planPicker')}
          </button>
        </div>
        {err.get('name') && <p className="field-error">{err.get('name')}</p>}
      </div>

      <div className="form-field">
        <label className="form-label">{t('vaccination.doseLabel')}</label>
        <input
          value={dose}
          type="text"
          placeholder={t('vaccination.dosePlaceholder')}
          className="form-input"
          onChange={(e) => setDose(e.target.value)}
        />
      </div>

      <div className={`form-field${err.has('date') ? ' has-error' : ''}`}>
        <label className="form-label">{t('vaccination.dateLabel')}</label>
        <input
          value={date}
          type="date"
          placeholder={t('common.selectDate')}
          className="form-input"
          onChange={(e) => {
            setDate(e.target.value)
            err.clear('date')
          }}
        />
        {err.get('date') && <p className="field-error">{err.get('date')}</p>}
      </div>

      <p className="form-label">{t('vaccination.statusLabel')}</p>
      <div className={s['status-grid']}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={status === opt.value ? `${s['status-btn']} ${s.selected}` : s['status-btn']}
            style={
              status === opt.value
                ? { background: opt.color + '22', borderColor: opt.color, color: opt.color }
                : undefined
            }
            onClick={() => setStatus(opt.value)}
          >
            <span className={s['status-icon']}>{opt.icon}</span>
            <span className={s['status-label']}>{t(opt.label)}</span>
          </button>
        ))}
      </div>

      <FormNotes value={notes} label={t('vaccination.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} />

      <BaseModal show={planOpen} title={t('vaccination.planTitle')} onClose={() => setPlanOpen(false)}>
        <p className={s['plan-tip']}>{t('vaccination.planTip', { name: activeBaby?.name ?? '' })}</p>
        <div className={s['plan-tabs']} role="tablist">
          <button
            type="button"
            className={planTab === 'free' ? `${s['plan-tab']} ${s.active}` : s['plan-tab']}
            role="tab"
            aria-selected={planTab === 'free'}
            onClick={() => setPlanTab('free')}
          >
            🆓 {t('vaccination.planTabFree')}
          </button>
          <button
            type="button"
            className={planTab === 'self' ? `${s['plan-tab']} ${s.active}` : s['plan-tab']}
            role="tab"
            aria-selected={planTab === 'self'}
            onClick={() => setPlanTab('self')}
          >
            💉 {t('vaccination.planTabSelf')}
          </button>
        </div>
        <div className={s['plan-list']}>
          {planItems.map((item, i) => {
            const added = existingKeys.has(`${item.name}|${item.dose}`)
            return (
              <button
                key={i}
                type="button"
                className={added ? `${s['plan-item']} ${s.disabled}` : s['plan-item']}
                disabled={added}
                onClick={() => pickFromPlan(item)}
              >
                <span className={s['plan-item-name']}>{item.name}</span>
                <span className={s['plan-item-meta']}>
                  {item.dose} · {t('vaccination.planMonth', { n: item.months })}
                  {added && <span className={s['plan-item-added']}>✓ {t('vaccination.planAdded')}</span>}
                  {item.note && <span className={s['plan-item-note']}>{item.note}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </BaseModal>
        </>
      )}
    </form>
  )
}
