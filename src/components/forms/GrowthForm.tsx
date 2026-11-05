'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useRecordForm } from '@/hooks/useRecordForm'
import TextField from '@/components/common/TextField'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'

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

  interface Payload {
    date: number
    weight?: number
    height?: number
    headCircumference?: number
    notes?: string
  }

  const { submit } = useRecordForm<Payload>({
    err,
    editing,
    validate: () => {
      const d = fromDateTimeLocal(date + 'T00:00:00')
      if (d == null || isNaN(d)) {
        err.set('date', t('growth.invalidDate'))
        return null
      }
      const w = weight ? Number(weight) : undefined
      const h = height ? Number(height) : undefined
      const hc = headCircumference ? Number(headCircumference) : undefined
      if (w !== undefined && (isNaN(w) || w <= 0)) {
        err.set('weight', t('growth.invalidWeight'))
        return null
      }
      if (h !== undefined && (isNaN(h) || h <= 0)) {
        err.set('height', t('growth.invalidHeight'))
        return null
      }
      if (hc !== undefined && (isNaN(hc) || hc <= 0)) {
        err.set('head', t('growth.invalidHead'))
        return null
      }
      if (w === undefined && h === undefined && hc === undefined) {
        err.setFormError(t('growth.invalidEmpty'))
        return null
      }
      return { date: d, weight: w, height: h, headCircumference: hc, notes: notes || undefined }
    },
    add: async (p) => {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.growths.add({ babyId: activeBabyId, ...p, createdAt: now, updatedAt: now })
      if (id == null) throw new Error(t('errors.addGrowthFail'))
    },
    update: (id, p) => db.growths.update(id, { ...p, updatedAt: Date.now() }),
    onSaved,
  })

  const { formRef, onSubmit } = useFormSubmit(submit)

  return (
    <form ref={formRef} className="growth-form" onSubmit={onSubmit}>
      <TextField
        value={date}
        onChange={setDate}
        type="date"
        label={t('growth.dateLabel')}
        errors={err}
        errorKey="date"
        placeholder={t('common.selectDate')}
      />

      <TextField
        value={weight}
        onChange={setWeight}
        type="number"
        min={0}
        step={0.1}
        label={t('growth.weightLabel')}
        errors={err}
        errorKey="weight"
        placeholder={t('growth.weightPlaceholder')}
        inputMode="decimal"
      />

      <TextField
        value={height}
        onChange={setHeight}
        type="number"
        min={0}
        step={0.5}
        label={t('growth.heightLabel')}
        errors={err}
        errorKey="height"
        placeholder={t('growth.heightPlaceholder')}
        inputMode="decimal"
      />

      <TextField
        value={headCircumference}
        onChange={setHeadCircumference}
        type="number"
        min={0}
        step={0.1}
        label={t('growth.headLabel')}
        errors={err}
        errorKey="head"
        placeholder={t('growth.headPlaceholder')}
        inputMode="decimal"
      />

      {err.formError && <p className="form-error">{err.formError}</p>}

      <FormNotes value={notes} label={t('growth.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} />
    </form>
  )
}
