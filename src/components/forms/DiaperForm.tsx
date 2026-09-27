'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DiaperType, DiaperColor, DiaperAmount } from '@/types'
import { DIAPER_TYPE_LIST, DIAPER_COLOR_LABELS, DIAPER_COLOR_DOTS, DIAPER_AMOUNT_LABELS } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
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

  async function submit() {
    err.clearAll()
    const ts = fromDateTimeLocal(time)
    if (ts == null) {
      err.set('time', t('diaper.invalidTime'))
      return
    }
    if (editing) {
      await db.diapers.update(editing.id, {
        type,
        time: ts,
        color: color || undefined,
        amount: amount || undefined,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.diapers.add({
        babyId: activeBabyId,
        type,
        time: ts,
        color: color || undefined,
        amount: amount || undefined,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addDiaperFail'))
    }
    onSaved?.()
  }

  return (
    <div className="diaper-form">
      <p className="form-label">{t('diaper.typeLabel')}</p>
      <div className={s['type-grid']}>
        {DIAPER_TYPE_LIST.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={type === opt.value ? `${s['type-btn']} ${s.selected}` : s['type-btn']}
            style={
              type === opt.value ? { background: opt.color + '22', borderColor: opt.color, color: opt.color } : undefined
            }
            onClick={() => setType(opt.value)}
          >
            <span className={s['type-icon']}>{opt.icon}</span>
            <span className={s['type-label']}>{t(opt.label)}</span>
          </button>
        ))}
      </div>

      <div className="form-field">
        <label className="form-label">{t('diaper.colorLabel')}</label>
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
      </div>

      <div className="form-field">
        <label className="form-label">{t('diaper.amountLabel')}</label>
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
      </div>

      <div className={`form-field${err.has('time') ? ' has-error' : ''}`}>
        <label className="form-label">{t('diaper.timeLabel')}</label>
        <input
          value={time}
          type="datetime-local"
          step="1"
          placeholder={t('common.selectDateTime')}
          className="form-input"
          onChange={(e) => {
            setTime(e.target.value)
            err.clear('time')
          }}
        />
        {err.get('time') && <p className="field-error">{err.get('time')}</p>}
      </div>

      <FormNotes value={notes} label={t('diaper.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
