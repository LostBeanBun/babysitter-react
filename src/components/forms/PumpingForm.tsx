'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PumpSide } from '@/types'
import { PUMP_SIDE_LIST } from '@/constants'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useTimedRecord } from '@/hooks/useTimedRecord'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import s from './PumpingForm.module.css'

export interface PumpingFormProps {
  editing?: {
    id: number
    side: PumpSide
    startTime: number
    endTime?: number
    duration?: number
    amount?: number
    notes?: string
  }
  onSaved?: () => void
  onCancelled?: () => void
  onStartRecord?: () => void
}

interface Fields {
  side: PumpSide
  amount?: number
  notes?: string
}

export default function PumpingForm({ editing, onSaved, onCancelled, onStartRecord }: PumpingFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [side, setSide] = useState<PumpSide>(editing?.side ?? 'both')
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  /** 可选奶量：合法返回数值，非法标记字段错误返回 undefined */
  function parseAmount(): number | undefined {
    if (!amount) return undefined
    const amt = Number(amount)
    if (isNaN(amt) || amt <= 0) {
      err.set('amount', t('pump.invalidAmount'))
      return undefined
    }
    return amt
  }

  function buildFields(): Fields | null {
    const amt = parseAmount()
    if (amount && amt === undefined) return null
    return { side, amount: amt, notes: notes || undefined }
  }

  const { startTime, setStartTime, endTime, setEndTime, isRecording, isEditing, durationText, submit } =
    useTimedRecord<Fields>({
      kind: 'pumping',
      editing,
      err,
      invalidStart: () => t('pump.invalidStart'),
      invalidOrder: () => t('pump.invalidOrder'),
      buildFields,
      loadRecord: (recordId) => db.pumpings.get(recordId),
      hydrate: (record) => {
        setSide(record.side)
        setAmount(record.amount != null ? String(record.amount) : '')
        setNotes(record.notes ?? '')
      },
      add: async (f, start) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.pumpings.add({
          babyId: activeBabyId,
          side: f.side,
          startTime: start,
          endTime: undefined,
          duration: undefined,
          amount: f.amount,
          notes: f.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addPumpFail'))
        return id
      },
      addRange: async (f, start, end) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.pumpings.add({
          babyId: activeBabyId,
          side: f.side,
          startTime: start,
          endTime: end,
          duration: end - start,
          amount: f.amount,
          notes: f.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addPumpFail'))
      },
      update: async (id, f, start, end) => {
        await db.pumpings.update(id, {
          side: f.side,
          startTime: start,
          endTime: end,
          duration: end && end > start ? end - start : undefined,
          amount: f.amount,
          notes: f.notes,
          updatedAt: Date.now(),
        })
      },
      validateEdit: (start, end) => {
        if (end != null && end <= start) {
          err.set('endTime', t('pump.invalidOrder'))
          return false
        }
        return true
      },
      finishRecording: async (recordId, endTs, f, start) => {
        await db.pumpings.update(recordId, {
          endTime: endTs,
          duration: endTs - start,
          amount: f.amount,
          updatedAt: Date.now(),
        })
      },
      onSaved,
      onStartRecord,
    })

  const submitLabel = isEditing ? t('common.saveEdit') : isRecording ? t('pump.endRecord') : t('pump.startRecord')

  const { formRef, onSubmit } = useFormSubmit(submit)

  return (
    <form ref={formRef} className="pump-form" onSubmit={onSubmit}>
      <p className="form-label">{t('pump.sideLabel')}</p>
      <div className={s['type-grid']}>
        {PUMP_SIDE_LIST.map((sd) => (
          <button
            key={sd.value}
            type="button"
            className={side === sd.value ? `${s['type-btn']} ${s.selected}` : s['type-btn']}
            disabled={isRecording}
            onClick={() => setSide(sd.value)}
          >
            <span className={s['type-icon']}>{sd.icon}</span>
            <span className={s['type-label']}>{t(sd.label)}</span>
          </button>
        ))}
      </div>

      <div className={`form-field${err.has('amount') ? ' has-error' : ''}`}>
        <label className="form-label">{t('pump.amountLabel')}</label>
        <input
          value={amount}
          type="number"
          min={0}
          step={5}
          placeholder={t('pump.amountPlaceholder')}
          className="form-input"
          inputMode="decimal"
          onChange={(e) => {
            setAmount(e.target.value)
            err.clear('amount')
          }}
        />
        {err.get('amount') && <p className="field-error">{err.get('amount')}</p>}
      </div>

      <div className={s['time-row']}>
        <div className={`form-field${err.has('startTime') ? ' has-error' : ''}`}>
          <label className="form-label">{t('pump.startLabel')}</label>
          <input
            value={startTime}
            type="datetime-local"
            step="1"
            placeholder={t('common.selectDateTime')}
            className="form-input"
            disabled={isRecording}
            onChange={(e) => {
              setStartTime(e.target.value)
              err.clear('startTime')
            }}
          />
          {err.get('startTime') && <p className="field-error">{err.get('startTime')}</p>}
        </div>
        <div className={`form-field${err.has('endTime') ? ' has-error' : ''}`}>
          <label className="form-label">{t('pump.endLabel')}</label>
          <input
            value={endTime}
            type="datetime-local"
            step="1"
            placeholder={t('common.selectDateTime')}
            className="form-input"
            onChange={(e) => {
              setEndTime(e.target.value)
              err.clear('endTime')
            }}
          />
          {err.get('endTime') && <p className="field-error">{err.get('endTime')}</p>}
        </div>
      </div>

      {durationText && <p className={s['duration-hint']}>{durationText}</p>}

      <FormNotes value={notes} label={t('pump.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={isEditing} submitLabel={submitLabel} onCancelled={onCancelled} />
    </form>
  )
}
