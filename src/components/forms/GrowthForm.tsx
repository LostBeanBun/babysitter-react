'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'

export interface GrowthFormProps {
  editing?: {
    id: number
    date: number
    weight?: number
    height?: number
    headCircumference?: number
    notes?: string
  }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function GrowthForm({ editing, onSaved, onCancelled }: GrowthFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [date, setDate] = useState(() => toDateTimeLocal(editing?.date ?? Date.now()).slice(0, 10))
  const [weight, setWeight] = useState(editing?.weight != null ? String(editing.weight) : '')
  const [height, setHeight] = useState(editing?.height != null ? String(editing.height) : '')
  const [headCircumference, setHeadCircumference] = useState(
    editing?.headCircumference != null ? String(editing.headCircumference) : '',
  )
  const [notes, setNotes] = useState(editing?.notes ?? '')

  async function submit() {
    err.clearAll()
    const d = fromDateTimeLocal(date + 'T00:00:00')
    if (d == null || isNaN(d)) {
      err.set('date', t('growth.invalidDate'))
      return
    }
    const w = weight ? Number(weight) : undefined
    const h = height ? Number(height) : undefined
    const hc = headCircumference ? Number(headCircumference) : undefined
    if (w !== undefined && (isNaN(w) || w <= 0)) {
      err.set('weight', t('growth.invalidWeight'))
      return
    }
    if (h !== undefined && (isNaN(h) || h <= 0)) {
      err.set('height', t('growth.invalidHeight'))
      return
    }
    if (hc !== undefined && (isNaN(hc) || hc <= 0)) {
      err.set('head', t('growth.invalidHead'))
      return
    }
    if (w === undefined && h === undefined && hc === undefined) {
      err.setFormError(t('growth.invalidEmpty'))
      return
    }

    if (editing) {
      await db.growths.update(editing.id, {
        date: d,
        weight: w,
        height: h,
        headCircumference: hc,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.growths.add({
        babyId: activeBabyId,
        date: d,
        weight: w,
        height: h,
        headCircumference: hc,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addGrowthFail'))
    }
    onSaved?.()
  }

  return (
    <div className="growth-form">
      <div className={`form-field${err.has('date') ? ' has-error' : ''}`}>
        <label className="form-label">{t('growth.dateLabel')}</label>
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

      <div className={`form-field${err.has('weight') ? ' has-error' : ''}`}>
        <label className="form-label">{t('growth.weightLabel')}</label>
        <input
          value={weight}
          type="number"
          min={0}
          step={0.1}
          placeholder={t('growth.weightPlaceholder')}
          className="form-input"
          inputMode="decimal"
          onChange={(e) => {
            setWeight(e.target.value)
            err.clear('weight')
          }}
        />
        {err.get('weight') && <p className="field-error">{err.get('weight')}</p>}
      </div>

      <div className={`form-field${err.has('height') ? ' has-error' : ''}`}>
        <label className="form-label">{t('growth.heightLabel')}</label>
        <input
          value={height}
          type="number"
          min={0}
          step={0.5}
          placeholder={t('growth.heightPlaceholder')}
          className="form-input"
          inputMode="decimal"
          onChange={(e) => {
            setHeight(e.target.value)
            err.clear('height')
          }}
        />
        {err.get('height') && <p className="field-error">{err.get('height')}</p>}
      </div>

      <div className={`form-field${err.has('head') ? ' has-error' : ''}`}>
        <label className="form-label">{t('growth.headLabel')}</label>
        <input
          value={headCircumference}
          type="number"
          min={0}
          step={0.1}
          placeholder={t('growth.headPlaceholder')}
          className="form-input"
          inputMode="decimal"
          onChange={(e) => {
            setHeadCircumference(e.target.value)
            err.clear('head')
          }}
        />
        {err.get('head') && <p className="field-error">{err.get('head')}</p>}
      </div>

      {err.formError && <p className="form-error">{err.formError}</p>}

      <FormNotes value={notes} label={t('growth.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
