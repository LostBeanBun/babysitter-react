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

export interface MedicationFormProps {
  editing?: { id: number; time: number; name: string; dose?: string; notes?: string }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function MedicationForm({ editing, onSaved, onCancelled }: MedicationFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [name, setName] = useState(editing?.name ?? '')
  const [dose, setDose] = useState(editing?.dose ?? '')
  const [time, setTime] = useState(() => toDateTimeLocal(editing?.time ?? Date.now()))
  const [notes, setNotes] = useState(editing?.notes ?? '')

  interface Payload {
    time: number
    name: string
    dose?: string
    notes?: string
  }

  const { submit } = useRecordForm<Payload>({
    err,
    editing,
    validate: () => {
      if (!name.trim()) {
        err.set('name', t('medication.invalidName'))
        return null
      }
      const ts = fromDateTimeLocal(time)
      if (ts == null || isNaN(ts)) {
        err.set('time', t('medication.invalidTime'))
        return null
      }
      return { time: ts, name: name.trim(), dose: dose || undefined, notes: notes || undefined }
    },
    add: async (p) => {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.medications.add({ babyId: activeBabyId, ...p, createdAt: now, updatedAt: now })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    },
    update: (id, p) => db.medications.update(id, { ...p, updatedAt: Date.now() }),
    onSaved,
  })

  const { formRef, onSubmit } = useFormSubmit(submit)

  return (
    <form ref={formRef} className="medication-form" onSubmit={onSubmit}>
      <TextField
        value={name}
        onChange={setName}
        label={t('medication.nameLabel')}
        errors={err}
        errorKey="name"
        placeholder={t('medication.namePlaceholder')}
      />

      <TextField
        value={dose}
        onChange={setDose}
        label={t('medication.doseLabel')}
        placeholder={t('medication.dosePlaceholder')}
      />

      <TextField
        value={time}
        onChange={setTime}
        type="datetime-local"
        step="1"
        label={t('medication.timeLabel')}
        errors={err}
        errorKey="time"
        placeholder={t('common.selectDateTime')}
      />

      <FormNotes value={notes} label={t('medication.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} />
    </form>
  )
}
