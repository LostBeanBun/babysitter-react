'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'

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

  async function submit() {
    err.clearAll()
    if (!name.trim()) {
      err.set('name', t('medication.invalidName'))
      return
    }
    const ts = fromDateTimeLocal(time)
    if (ts == null || isNaN(ts)) {
      err.set('time', t('medication.invalidTime'))
      return
    }
    if (editing) {
      await db.medications.update(editing.id, {
        time: ts,
        name: name.trim(),
        dose: dose || undefined,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.medications.add({
        babyId: activeBabyId,
        time: ts,
        name: name.trim(),
        dose: dose || undefined,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    }
    onSaved?.()
  }

  return (
    <div className="medication-form">
      <div className={`form-field${err.has('name') ? ' has-error' : ''}`}>
        <label className="form-label">{t('medication.nameLabel')}</label>
        <input
          value={name}
          type="text"
          placeholder={t('medication.namePlaceholder')}
          className="form-input"
          onChange={(e) => {
            setName(e.target.value)
            err.clear('name')
          }}
        />
        {err.get('name') && <p className="field-error">{err.get('name')}</p>}
      </div>

      <div className="form-field">
        <label className="form-label">{t('medication.doseLabel')}</label>
        <input
          value={dose}
          type="text"
          placeholder={t('medication.dosePlaceholder')}
          className="form-input"
          onChange={(e) => setDose(e.target.value)}
        />
      </div>

      <div className={`form-field${err.has('time') ? ' has-error' : ''}`}>
        <label className="form-label">{t('medication.timeLabel')}</label>
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

      <FormNotes value={notes} label={t('medication.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
