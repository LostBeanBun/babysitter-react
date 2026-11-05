'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedType, BreastSide } from '@/types'
import { FEED_TYPE_LIST, BREAST_SIDE_LIST } from '@/constants'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useTimedRecord } from '@/hooks/useTimedRecord'
import ChoiceGrid from '@/components/common/ChoiceGrid'
import TextField from '@/components/common/TextField'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import s from './FeedingForm.module.css'

export interface FeedingFormProps {
  editing?: {
    id: number
    type: FeedType
    side?: BreastSide
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
  type: FeedType
  side?: BreastSide
  amount?: number
  notes?: string
}

export default function FeedingForm({ editing, onSaved, onCancelled, onStartRecord }: FeedingFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [type, setType] = useState<FeedType>(editing?.type ?? 'breast')
  const [side, setSide] = useState<BreastSide>(editing?.side ?? 'left')
  const [amount, setAmount] = useState(editing?.amount != null ? String(editing.amount) : '')
  const [notes, setNotes] = useState(editing?.notes ?? '')

  const isBreast = type === 'breast'

  /** 瓶喂奶量必填；合法返回数值，非法标记字段错误返回 null */
  function parseAmount(): number | null {
    const amt = amount ? Number(amount) : NaN
    if (!amount || isNaN(amt) || amt <= 0) {
      err.set('amount', t('feed.invalidAmount'))
      return null
    }
    return amt
  }

  function buildFields(): Fields | null {
    if (isBreast) {
      return { type, side, amount: undefined, notes: notes || undefined }
    }
    const amt = parseAmount()
    if (amt == null) return null
    return { type, side: undefined, amount: amt, notes: notes || undefined }
  }

  const { startTime, setStartTime, endTime, setEndTime, isRecording, isEditing, durationText, submit } =
    useTimedRecord<Fields>({
      kind: 'feeding',
      editing,
      err,
      invalidStart: () => t('feed.invalidStart'),
      invalidOrder: () => t('feed.invalidOrder'),
      buildFields,
      loadRecord: (recordId) => db.feedings.get(recordId),
      hydrate: (record) => {
        setType(record.type)
        setSide(record.side ?? 'left')
        setAmount(record.amount != null ? String(record.amount) : '')
        setNotes(record.notes ?? '')
      },
      add: async (f, start) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.feedings.add({
          babyId: activeBabyId,
          type: f.type,
          side: f.side,
          startTime: start,
          endTime: undefined,
          duration: undefined,
          amount: f.amount,
          notes: f.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addFeedFail'))
        return id
      },
      addRange: async (f, start, end) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.feedings.add({
          babyId: activeBabyId,
          type: f.type,
          side: f.side,
          startTime: start,
          endTime: end,
          duration: end - start,
          amount: undefined,
          notes: f.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addFeedFail'))
      },
      update: async (id, f, start, end) => {
        if (f.type === 'breast') {
          await db.feedings.update(id, {
            type: f.type,
            side: f.side,
            startTime: start,
            endTime: end,
            duration: end && end > start ? end - start : undefined,
            amount: undefined,
            notes: f.notes,
            updatedAt: Date.now(),
          })
          return
        }
        await db.feedings.update(id, {
          type: f.type,
          side: undefined,
          startTime: start,
          endTime: undefined,
          duration: undefined,
          amount: f.amount,
          notes: f.notes,
          updatedAt: Date.now(),
        })
      },
      validateEdit: (start, end) => {
        if (isBreast && end != null && end <= start) {
          err.set('endTime', t('feed.invalidOrder'))
          return false
        }
        return true
      },
      finishRecording: async (recordId, endTs, _fields, start) => {
        await db.feedings.update(recordId, {
          endTime: endTs,
          duration: endTs - start,
          updatedAt: Date.now(),
        })
      },
      // 瓶喂为单时间点，不启动计时
      startTimer: () => isBreast,
      onSaved,
      onStartRecord,
    })

  /** 瓶喂用单时间点；亲喂或计时中用开始/结束区间 */
  const showTimePair = isBreast || isRecording

  const submitLabel = isRecording
    ? t('feed.endRecord')
    : isEditing
      ? t('common.saveEdit')
      : isBreast
        ? t('feed.startRecord')
        : t('common.save')

  const { formRef, onSubmit } = useFormSubmit(submit)

  const typeOptions = FEED_TYPE_LIST.map((opt) => ({ ...opt, label: t(opt.label) }))

  return (
    <form ref={formRef} className="feeding-form" onSubmit={onSubmit}>
      <p className="form-label">{t('feed.typeLabel')}</p>
      <ChoiceGrid options={typeOptions} value={type} onChange={(v) => setType(v as FeedType)} disabled={isRecording} />

      {isBreast && (
        <div className={s['side-row']}>
          {BREAST_SIDE_LIST.map((sd) => (
            <button
              key={sd.value}
              type="button"
              className={side === sd.value ? `${s['side-btn']} ${s.selected}` : s['side-btn']}
              disabled={isRecording}
              onClick={() => setSide(sd.value)}
            >
              <span>{sd.icon}</span>
              <span>{t(sd.label)}</span>
            </button>
          ))}
        </div>
      )}

      {!isBreast && (
        <TextField
          value={amount}
          onChange={setAmount}
          type="number"
          min={0}
          step={5}
          label={t('feed.amountLabel')}
          errors={err}
          errorKey="amount"
          placeholder={t('feed.amountPlaceholder')}
          inputMode="decimal"
          disabled={isRecording}
        />
      )}

      {showTimePair ? (
        <div className={s['time-row']}>
          <TextField
            value={startTime}
            onChange={setStartTime}
            type="datetime-local"
            step="1"
            label={t('feed.startLabel')}
            errors={err}
            errorKey="startTime"
            placeholder={t('common.selectDateTime')}
            disabled={isRecording}
          />
          <TextField
            value={endTime}
            onChange={setEndTime}
            type="datetime-local"
            step="1"
            label={t('feed.endLabel')}
            errors={err}
            errorKey="endTime"
            placeholder={t('common.selectDateTime')}
          />
        </div>
      ) : (
        <TextField
          value={startTime}
          onChange={setStartTime}
          type="datetime-local"
          step="1"
          label={t('feed.timeLabel')}
          errors={err}
          errorKey="startTime"
          placeholder={t('common.selectDateTime')}
        />
      )}

      {showTimePair && durationText && <p className={s['duration-hint']}>{durationText}</p>}

      <FormNotes value={notes} label={t('feed.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={isEditing} submitLabel={submitLabel} onCancelled={onCancelled} />
    </form>
  )
}
