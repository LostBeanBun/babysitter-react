'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiaperType, DiaperColor, DiaperAmount } from '@/types'
import { DIAPER_TYPE_LIST, DIAPER_COLOR_LABELS, DIAPER_COLOR_DOTS, DIAPER_AMOUNT_LABELS } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useRecordForm } from '@/hooks/useRecordForm'
import ChoiceGrid from '@/components/common/ChoiceGrid'
import FormField from '@/components/common/FormField'
import TextField from '@/components/common/TextField'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import s from './DiaperForm.module.css'

export interface DiaperFormProps {
  editing?: {
    id: number
    type: DiaperType
    time: number
    color?: DiaperColor
    amount?: DiaperAmount
    notes?: string
  }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function DiaperForm({ editing, onSaved, onCancelled }: DiaperFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [type, setType] = useState<DiaperType>(editing?.type ?? 'wet')
  const [color, setColor] = useState<DiaperColor | ''>(editing?.color ?? '')
  const [amount, setAmount] = useState<DiaperAmount | ''>(editing?.amount ?? '')
  const [time, setTime] = useState(() => toDateTimeLocal(editing?.time ?? Date.now()))
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const colorEntries = Object.entries(DIAPER_COLOR_LABELS) as [DiaperColor, string][]
  const amountEntries = Object.entries(DIAPER_AMOUNT_LABELS) as [DiaperAmount, string][]

  interface Payload {
    type: DiaperType
    time: number
    color?: DiaperColor
    amount?: DiaperAmount
    notes?: string
  }

  const { submit } = useRecordForm<Payload>({
    err,
    editing,
    validate: () => {
      const ts = fromDateTimeLocal(time)
      if (ts == null) {
        err.set('time', t('diaper.invalidTime'))
        return null
      }
      return { type, time: ts, color: color || undefined, amount: amount || undefined, notes: notes || undefined }
    },
    add: async (p) => {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.diapers.add({ babyId: activeBabyId, ...p, createdAt: now, updatedAt: now })
      if (id == null) throw new Error(t('errors.addDiaperFail'))
    },
    update: (id, p) => db.diapers.update(id, { ...p, updatedAt: Date.now() }),
    onSaved,
  })

  const { formRef, onSubmit } = useFormSubmit(submit)

  const typeOptions = DIAPER_TYPE_LIST.map((opt) => ({ ...opt, label: t(opt.label) }))

  return (
    <form ref={formRef} className="diaper-form" onSubmit={onSubmit}>
      <p className="form-label">{t('diaper.typeLabel')}</p>
      <ChoiceGrid options={typeOptions} value={type} onChange={(v) => setType(v as DiaperType)} />

      <FormField label={t('diaper.colorLabel')} tag="p">
        <div className={s['color-row']}>
          {colorEntries.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={color === key ? `${s['color-dot-btn']} ${s.selected}` : s['color-dot-btn']}
              onClick={() => setColor(color === key ? '' : key)}
            >
              <span className={s['color-dot']} style={{ background: DIAPER_COLOR_DOTS[key] }} />
              <span className={s['color-label']}>{t(label)}</span>
            </button>
          ))}
        </div>
      </FormField>

      <FormField label={t('diaper.amountLabel')} tag="p">
        <div className={s['amount-row']}>
          {amountEntries.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={amount === key ? `${s['amount-btn']} ${s.selected}` : s['amount-btn']}
              onClick={() => setAmount(amount === key ? '' : key)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </FormField>

      <TextField
        value={time}
        onChange={setTime}
        type="datetime-local"
        step="1"
        label={t('diaper.timeLabel')}
        errors={err}
        errorKey="time"
        placeholder={t('common.selectDateTime')}
      />

      <FormNotes value={notes} label={t('diaper.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} />
    </form>
  )
}
