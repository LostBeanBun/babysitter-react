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

  interface Payload {
    time: number
    food: string
    amount?: string
    notes?: string
  }

  const { submit } = useRecordForm<Payload>({
    err,
    editing,
    validate: () => {
      if (!food.trim()) {
        err.set('food', t('solidFood.invalidFood'))
        return null
      }
      const ts = fromDateTimeLocal(time)
      if (ts == null || isNaN(ts)) {
        err.set('time', t('solidFood.invalidTime'))
        return null
      }
      return { time: ts, food: food.trim(), amount: amount || undefined, notes: notes || undefined }
    },
    add: async (p) => {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.solidFoods.add({ babyId: activeBabyId, ...p, createdAt: now, updatedAt: now })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    },
    update: (id, p) => db.solidFoods.update(id, { ...p, updatedAt: Date.now() }),
    onSaved,
  })

  const { formRef, onSubmit } = useFormSubmit(submit)

  return (
    <form ref={formRef} className="solid-food-form" onSubmit={onSubmit}>
      <TextField
        value={food}
        onChange={setFood}
        label={t('solidFood.foodLabel')}
        errors={err}
        errorKey="food"
        placeholder={t('solidFood.foodPlaceholder')}
      />

      <TextField
        value={amount}
        onChange={setAmount}
        label={t('solidFood.amountLabel')}
        placeholder={t('solidFood.amountPlaceholder')}
      />

      <TextField
        value={time}
        onChange={setTime}
        type="datetime-local"
        step="1"
        label={t('solidFood.timeLabel')}
        errors={err}
        errorKey="time"
        placeholder={t('common.selectDateTime')}
      />

      <FormNotes value={notes} label={t('solidFood.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} />
    </form>
  )
}
