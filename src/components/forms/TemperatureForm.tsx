'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TemperatureMethod } from '@/types'
import { TEMP_METHOD_LIST } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import s from './TemperatureForm.module.css'

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

  async function submit() {
    err.clearAll()
    const v = Number(value)
    if (value === '' || isNaN(v) || v < 35 || v > 43) {
      err.set('value', t('temperature.invalidValue'))
      return
    }
    const ts = fromDateTimeLocal(time)
    if (ts == null || isNaN(ts)) {
      err.set('time', t('temperature.invalidTime'))
      return
    }
    if (editing) {
      await db.temperatures.update(editing.id, {
        time: ts,
        value: v,
        method: method || undefined,
        notes: notes || undefined,
        updatedAt: Date.now(),
      })
    } else {
      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      const id = await db.temperatures.add({
        babyId: activeBabyId,
        time: ts,
        value: v,
        method: method || undefined,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addRecordFail'))
    }
    onSaved?.()
  }

  return (
    <div className="temperature-form">
      <div className={`form-field${err.has('value') ? ' has-error' : ''}`}>
        <label className="form-label">{t('temperature.valueLabel')}</label>
        <div className={s['value-wrap']}>
          <input
            value={value}
            type="number"
            min={35}
            max={43}
            step={0.1}
            placeholder={t('temperature.valuePlaceholder')}
            className="form-input"
            inputMode="decimal"
            onChange={(e) => {
              setValue(e.target.value)
              err.clear('value')
            }}
          />
          <span className={s['value-unit']}>°C</span>
        </div>
        {err.get('value') && <p className="field-error">{err.get('value')}</p>}
      </div>

      <p className="form-label">{t('temperature.methodLabel')}</p>
      <div className={s['method-grid']}>
        {TEMP_METHOD_LIST.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={method === opt.value ? `${s['method-btn']} ${s.selected}` : s['method-btn']}
            onClick={() => setMethod(method === opt.value ? '' : opt.value)}
          >
            <span className={s['method-icon']}>{opt.icon}</span>
            <span className={s['method-label']}>{t(opt.label)}</span>
          </button>
        ))}
      </div>

      <div className={`form-field${err.has('time') ? ' has-error' : ''}`}>
        <label className="form-label">{t('temperature.timeLabel')}</label>
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

      <FormNotes
        value={notes}
        label={t('temperature.notesLabel')}
        placeholder={t('common.optional')}
        onChange={setNotes}
      />

      <FormActions editing={editing != null} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
