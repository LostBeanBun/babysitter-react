'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import type { VaccinationStatus, Vaccination } from '@/types'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
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

  const vaccinationsResult = useLiveQuery(
    async () => {
      if (activeBabyId == null) return [] as Vaccination[]
      return db.vaccinations
        .where('[babyId+date]')
        .between([activeBabyId, 0], [activeBabyId, Number.MAX_SAFE_INTEGER])
        .toArray()
    },
    [activeBabyId],
    [] as Vaccination[],
  )
  const vaccinations = useMemo(() => vaccinationsResult ?? [], [vaccinationsResult])

  const planItems = planTab === 'free' ? VACCINE_PLAN : SELF_PAID_VACCINE_PLAN

  const existingKeys = useMemo(
    () => new Set(vaccinations.map((v) => `${v.name}|${v.dose ?? ''}`)),
    [vaccinations],
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
    } else {
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
    }
    onSaved?.()
  }

  return (
    <div className="vaccination-form">
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

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />

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
            const dup = existingKeys.has(`${item.name}|${item.dose}`)
            return (
              <button
                key={i}
                type="button"
                className={dup ? `${s['plan-item']} ${s.disabled}` : s['plan-item']}
                disabled={dup}
                onClick={() => pickFromPlan(item)}
              >
                <span className={s['plan-item-name']}>{item.name}</span>
                <span className={s['plan-item-meta']}>
                  {item.dose} · {t('vaccination.planMonth', { n: item.months })}
                  {item.note && <span className={s['plan-item-note']}>{item.note}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </BaseModal>
    </div>
  )
}
