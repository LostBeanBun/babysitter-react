'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db } from '@/db'
import { useBabies } from '@/stores/baby'
import { useFormErrors } from '@/hooks/useFormErrors'
import { useTimedRecord } from '@/hooks/useTimedRecord'
import TextField from '@/components/common/TextField'
import FormNotes from '@/components/common/FormNotes'
import FormActions from '@/components/common/FormActions'
import { useFormSubmit } from '@/hooks/useFormSubmit'
import s from './SleepForm.module.css'

export interface SleepFormProps {
  editing?: { id: number; startTime: number; endTime: number; notes?: string }
  onSaved?: () => void
  onCancelled?: () => void
  onStartRecord?: () => void
}

interface Fields {
  notes?: string
}

export default function SleepForm({ editing, onSaved, onCancelled, onStartRecord }: SleepFormProps) {
  const { t } = useTranslation()
  const { activeBabyId } = useBabies()
  const err = useFormErrors()

  const [notes, setNotes] = useState(editing?.notes ?? '')

  const { startTime, setStartTime, endTime, setEndTime, isRecording, isEditing, durationText, submit } =
    useTimedRecord<Fields>({
      kind: 'sleep',
      editing,
      err,
      invalidStart: () => t('sleep.invalidStart'),
      invalidOrder: () => t('sleep.invalidOrder'),
      // 睡眠类型不再区分：统一按「小睡」保存（历史 night 记录编辑保存后也会归一到 nap）
      buildFields: () => ({ notes: notes || undefined }),
      loadRecord: (recordId) => db.sleeps.get(recordId),
      hydrate: (record) => {
        setNotes(record.notes ?? '')
      },
      add: async (fields, start) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.sleeps.add({
          babyId: activeBabyId,
          type: 'nap',
          startTime: start,
          endTime: undefined,
          duration: undefined,
          notes: fields.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addSleepFail'))
        return id
      },
      addRange: async (fields, start, end) => {
        if (activeBabyId == null) throw new Error(t('errors.noBaby'))
        const now = Date.now()
        const id = await db.sleeps.add({
          babyId: activeBabyId,
          type: 'nap',
          startTime: start,
          endTime: end,
          duration: end - start,
          notes: fields.notes,
          createdAt: now,
          updatedAt: now,
        })
        if (id == null) throw new Error(t('errors.addSleepFail'))
      },
      update: async (id, fields, start, end) => {
        await db.sleeps.update(id, {
          type: 'nap',
          startTime: start,
          endTime: end!,
          notes: fields.notes,
          updatedAt: Date.now(),
        })
      },
      // 编辑必须有完整区间
      validateEdit: (start, end) => {
        if (end == null) {
          err.set('endTime', t('sleep.invalidRange'))
          return false
        }
        if (end <= start) {
          err.set('endTime', t('sleep.invalidOrder'))
          return false
        }
        return true
      },
      finishRecording: async (recordId, endTs, _fields, start) => {
        await db.sleeps.update(recordId, {
          endTime: endTs,
          duration: endTs - start,
          updatedAt: Date.now(),
        })
      },
      onSaved,
      onStartRecord,
    })

  const submitLabel = isEditing ? t('common.saveEdit') : isRecording ? t('sleep.endRecord') : t('sleep.startRecord')

  const { formRef, onSubmit } = useFormSubmit(submit)

  return (
    <form ref={formRef} className="sleep-form" onSubmit={onSubmit}>
      <div className={s['time-row']}>
        <TextField
          value={startTime}
          onChange={setStartTime}
          type="datetime-local"
          step="1"
          label={t('sleep.startLabel')}
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
          label={t('sleep.endLabel')}
          errors={err}
          errorKey="endTime"
          placeholder={t('common.selectDateTime')}
        />
      </div>

      {durationText && <p className={s['duration-hint']}>{durationText}</p>}

      <FormNotes value={notes} label={t('sleep.notesLabel')} placeholder={t('common.optional')} onChange={setNotes} />

      <FormActions editing={isEditing} submitLabel={submitLabel} onCancelled={onCancelled} />
    </form>
  )
}
