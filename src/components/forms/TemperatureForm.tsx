'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TemperatureMethod } from '@/types'
import { TEMP_METHOD_LIST } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useRecordForm } from '@/hooks/useRecordForm'
import ChoiceGrid from '@/components/common/ChoiceGrid'
import TextField from '@/components/common/TextField'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'

export interface TemperatureFormProps {
  editing?: { id: number; time: number; value: number; method?: TemperatureMethod; notes?: string }
  onSaved?: () => void
  onCancelled?: () => void
}

export default function TemperatureForm({ editing, onSaved, onCancelled }: TemperatureFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [value, setValue] = useState(editing?.value != null ? String(editing.value) : '')
  const [method, setMethod] = useState<TemperatureMethod | ''>(editing?.method ?? '')
  const [time, setTime] = useState(() => toDateTimeLocal(editing?.time ?? Date.now()))
  const [notes, setNotes] = useState(editing?.notes ?? '')

  interface Payload {
    time: number
    value: number
    method?: TemperatureMethod
    notes?: string
  }

  const { submit } = useRecordForm<Payload>({
    err,
    editing,
    validate: () => {
      const v = Number(value)
      if (value === '' || isNaN(v) || v < 35 || v > 43) {
        err.set('value', t('temperature.invalidValue'))
        return null
      }
      const ts = fromDateTimeLocal(time)
      if (ts == null || isNaN(ts)) {
        err.set('time', t('temperature.invalidTime'))
        return null
      }
      return { time: ts, value: v, method: method || undefined, notes: notes || undefined }
    },
    add: async (p) => {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.temperatures.add({ babyId: activeBabyId, ...p, createdAt: now, updatedAt: now })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    },
    update: (id, p) => db.temperatures.update(id, { ...p, updatedAt: Date.now() }),
    onSaved,
  })

  const { formRef, onSubmit } = useFormSubmit(submit)

  const methodOptions = TEMP_METHOD_LIST.map((opt) => ({ ...opt, label: t(opt.label) }))

  return (
    <form ref={formRef} className="temperature-form" onSubmit={onSubmit}>
      <TextField
        value={value}
        onChange={setValue}
        type="number"
        min={35}
        max={43}
        step={0.1}
        label={t('temperature.valueLabel')}
        errors={err}
        errorKey="value"
        placeholder={t('temperature.valuePlaceholder')}
        inputMode="decimal"
        suffix="°C"
      />

      <p className="form-label">{t('temperature.methodLabel')}</p>
      <ChoiceGrid
        options={methodOptions}
        value={method}
        onChange={(v) => setMethod(v as TemperatureMethod | '')}
        columns={4}
        clearable
      />

      <TextField
        value={time}
        onChange={setTime}
        type="datetime-local"
        step="1"
        label={t('temperature.timeLabel')}
        errors={err}
        errorKey="time"
        placeholder={t('common.selectDateTime')}
      />

      <FormNotes
        value={notes}
        label={t('temperature.notesLabel')}
        placeholder={t('common.optional')}
        onChange={setNotes}
      />

      <FormActions editing={editing != null} onCancelled={onCancelled} />
    </form>
  )
}
