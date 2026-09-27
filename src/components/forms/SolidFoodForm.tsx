'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'

export interface SolidFoodFormProps {
  editing?: { id: number; time: number; food: string; amount?: string; notes?: string }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function SolidFoodForm({ editing, onSaved, onCancelled }: SolidFoodFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [food, setFood] = useState(editing?.food ?? '')
  const [amount, setAmount] = useState(editing?.amount ?? '')
  const [time, setTime] = useState(() => toDateTimeLocal(editing?.time ?? Date.now()))
  const [notes, setNotes] = useState(editing?.notes ?? '')

  async function submit() {
    err.clearAll()
    if (!food.trim()) {
      err.set('food', t('solidFood.invalidFood'))
      return
    }
    const ts = fromDateTimeLocal(time)
    if (ts == null || isNaN(ts)) {
      err.set('time', t('solidFood.invalidTime'))
      return
    }
    if (editing) {
      await db.solidFoods.update(editing.id, {
        time: ts,
        food: food.trim(),
        amount: amount || undefined,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.solidFoods.add({
        babyId: activeBabyId,
        time: ts,
        food: food.trim(),
        amount: amount || undefined,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    }
    onSaved?.()
  }

  return (
    <div className="solid-food-form">
      <div className={`form-field${err.has('food') ? ' has-error' : ''}`}>
        <label className="form-label">{t('solidFood.foodLabel')}</label>
        <input
          value={food}
          type="text"
          placeholder={t('solidFood.foodPlaceholder')}
          className="form-input"
          onChange={(e) => {
            setFood(e.target.value)
            err.clear('food')
          }}
        />
        {err.get('food') && <p className="field-error">{err.get('food')}</p>}
      </div>

      <div className="form-field">
        <label className="form-label">{t('solidFood.amountLabel')}</label>
        <input
          value={amount}
          type="text"
          placeholder={t('solidFood.amountPlaceholder')}
          className="form-input"
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>

      <div className={`form-field${err.has('time') ? ' has-error' : ''}`}>
        <label className="form-label">{t('solidFood.timeLabel')}</label>
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

      <FormNotes value={notes} label={t('solidFood.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
