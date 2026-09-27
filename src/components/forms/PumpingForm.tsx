'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PumpSide } from '@/types'
import { PUMP_SIDE_LIST } from '@/constants'
import { toDateTimeLocal, fromDateTimeLocal, formatDuration } from '@/utils/format'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { toast } from '@/stores/toast'
import { useActiveTimer } from '@/hooks/useActiveTimer'
import { useFormErrors } from '@/hooks/useFormErrors'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
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

export default function PumpingForm({ editing, onSaved, onCancelled, onStartRecord }: PumpingFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const { getByKind, start: startTimer, reset: resetTimer } = useActiveTimer()
  const err = useFormErrors()

  const [side, setSide] = useState<PumpSide>(editing?.side ?? 'both')
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [startTime, setStartTime] = useState(() => toDateTimeLocal(editing?.startTime ?? Date.now()))
  const [endTime, setEndTime] = useState(editing?.endTime ? toDateTimeLocal(editing.endTime) : '')

  const activeEntry = getByKind('pumping')
  const isRecording = !!activeEntry
  const isEditing = !!editing && !isRecording

  const durStart = fromDateTimeLocal(startTime)
  const durEnd = endTime ? fromDateTimeLocal(endTime) : undefined
  const durationText = durStart && durEnd && durEnd > durStart ? formatDuration(durEnd - durStart) : null

  const submitLabel = isEditing ? t('common.saveEdit') : isRecording ? t('pump.endRecord') : t('pump.startRecord')

  useEffect(() => {
    const entry = getByKind('pumping')
    if (!entry) return
    let stale = false
    void db.pumpings.get(entry.recordId).then((record) => {
      if (!record || stale) return
      setSide(record.side)
      setAmount(record.amount != null ? String(record.amount) : '')
      setNotes(record.notes ?? '')
      setStartTime(toDateTimeLocal(record.startTime))
      setEndTime('')
    })
    return () => {
      stale = true
    }
  }, [getByKind])

  async function submit() {
    err.clearAll()
    try {
      const start = fromDateTimeLocal(startTime)
      if (start == null) {
        err.set('startTime', t('pump.invalidStart'))
        return
      }
      const end = endTime ? fromDateTimeLocal(endTime) : undefined
      const amt = amount ? Number(amount) : undefined
      if (amount && (isNaN(amt as number) || (amt as number) <= 0)) {
        err.set('amount', t('pump.invalidAmount'))
        return
      }

      // 计时中：结束记录，结束时间写回（空则取当前时间）
      if (isRecording && activeEntry) {
        const endTs = end ?? Date.now()
        if (endTs <= start) {
          err.set('endTime', t('pump.invalidOrder'))
          return
        }
        await db.pumpings.update(activeEntry.recordId, {
          endTime: endTs,
          duration: endTs - start,
          amount: amt,
          updatedAt: Date.now(),
        })
        resetTimer(activeEntry.id)
        onSaved?.()
        return
      }

      if (isEditing && editing) {
        if (end != null && end <= start) {
          err.set('endTime', t('pump.invalidOrder'))
          return
        }
        await db.pumpings.update(editing.id, {
          side,
          startTime: start,
          endTime: end,
          duration: end && end > start ? end - start : undefined,
          amount: amt,
          notes: notes || undefined,
          updatedAt: Date.now(),
        })
        onSaved?.()
        return
      }

      if (activeBabyId == null) throw new Error(t('errors.noBaby'))
      const now = Date.now()
      // 新记录：结束时间已填 → 直接保存；空 → 从输入开始时间启动计时
      if (end != null) {
        if (end <= start) {
          err.set('endTime', t('pump.invalidOrder'))
          return
        }
        const savedId = await db.pumpings.add({
          babyId: activeBabyId,
          side,
          startTime: start,
          endTime: end,
          duration: end - start,
          amount: amt,
          notes: notes || undefined,
          createdAt: now,
          updatedAt: now,
        })
        if (savedId == null) throw new Error(t('errors.addPumpFail'))
        onSaved?.()
        return
      }
      const id = await db.pumpings.add({
        babyId: activeBabyId,
        side,
        startTime: start,
        endTime: undefined,
        duration: undefined,
        amount: amt,
        notes: notes || undefined,
        createdAt: now,
        updatedAt: now,
      })
      if (id == null) throw new Error(t('errors.addPumpFail'))
      startTimer('pumping', id, start)
      onStartRecord?.()
    } catch {
      toast(t('errors.generic'))
    }
  }

  return (
    <div className="pump-form">
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

      <FormActions editing={isEditing} submitLabel={submitLabel} onCancelled={onCancelled} onSave={submit} />
    </div>
  )
}
