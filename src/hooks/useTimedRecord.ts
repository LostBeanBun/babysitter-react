'use client'

/**
 * 带「开始/结束时间 + 活动计时」记录表单的公共状态与提交流程（对齐 Vue 同名 composable）：
 * - startTime / endTime / durationText / isRecording / isEditing 状态
 * - 计时中提交 → 结束记录；编辑 → update；新记录有结束区间 → add；否则 add + 启动计时
 * 分支判定由两端共用的 `services/timedRecord` 纯函数负责，本 hook 只负责落地副作用。
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toDateTimeLocal, fromDateTimeLocal, formatDuration } from '@/utils/format'
import { toast } from '@/stores/toast'
import { useActiveTimer, type TimerKind } from '@/hooks/useActiveTimer'
import type { FormErrors } from '@/hooks/useFormErrors'
import { planTimedSubmit } from '@/services/timedRecord'

export interface TimedRecordOptions<TFields> {
  /** 计时种类（feeding/pumping/sleep） */
  kind: TimerKind
  /** 编辑中的记录（editing prop） */
  editing?: { id: number; startTime: number; endTime?: number } | undefined
  err: FormErrors
  /** 开始时间非法时的错误文案 */
  invalidStart: () => string
  /** 结束时间不晚于开始时间时的错误文案 */
  invalidOrder: () => string
  /** 构建时间之外的字段；校验失败需先 err.set 并返回 null */
  buildFields: () => TFields | null
  /** 读取活动计时对应的记录（用于挂载时回填），无记录返回 undefined */
  loadRecord: (recordId: number) => Promise<(TFields & { startTime: number }) | undefined>
  /** 活动计时回填：填充时间之外的字段（时间由本 hook 回填） */
  hydrate?: (record: TFields & { startTime: number }) => void
  /** 新建（无结束时间）：返回记录 id */
  add: (fields: TFields, startTime: number) => Promise<number>
  /** 新建带结束时间 */
  addRange: (fields: TFields, startTime: number, endTime: number) => Promise<unknown>
  /** 编辑保存（endTime 可能为 undefined，由表单决定是否清除） */
  update: (id: number, fields: TFields, startTime: number, endTime: number | undefined) => Promise<unknown>
  /** 编辑前的区间校验（如睡眠编辑必须有完整区间）；失败需 err.set 并返回 false */
  validateEdit?: (startTime: number, endTime: number | undefined) => boolean
  /** 计时中结束（endTime 已校验晚于开始时间，startTime 供表单计算时长） */
  finishRecording: (recordId: number, endTime: number, fields: TFields, startTime: number) => Promise<unknown>
  /** 结束时间为空的新记录是否启动计时（瓶喂等单时间点记录返回 false） */
  startTimer?: () => boolean
  onSaved?: () => void
  onStartRecord?: () => void
}

export function useTimedRecord<TFields>(opts: TimedRecordOptions<TFields>) {
  const { t } = useTranslation()
  const { getByKind, start: startTimer, reset: resetTimer } = useActiveTimer()

  const [startTime, setStartTime] = useState(() => toDateTimeLocal(opts.editing?.startTime ?? Date.now()))
  const [endTime, setEndTime] = useState(() => (opts.editing?.endTime ? toDateTimeLocal(opts.editing.endTime) : ''))

  const activeEntry = getByKind(opts.kind)
  const isRecording = !!activeEntry
  const isEditing = !!opts.editing && !isRecording

  const startTs = fromDateTimeLocal(startTime)
  const endTs = endTime ? fromDateTimeLocal(endTime) : undefined
  const durationText = startTs && endTs && endTs > startTs ? formatDuration(endTs - startTs) : null

  // 回调随渲染重建，挂载回填只读最新一份（避免把内联箭头函数塞进依赖）
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })

  useEffect(() => {
    const entry = getByKind(opts.kind)
    if (!entry) return
    let stale = false
    void optsRef.current.loadRecord(entry.recordId).then((record) => {
      if (!record || stale) return
      setStartTime(toDateTimeLocal(record.startTime))
      setEndTime('')
      optsRef.current.hydrate?.(record)
    })
    return () => {
      stale = true
    }
  }, [getByKind, opts.kind])

  async function submit(): Promise<void> {
    opts.err.clearAll()
    try {
      const start = fromDateTimeLocal(startTime)
      const end = endTime ? fromDateTimeLocal(endTime) : undefined
      const plan = planTimedSubmit<TFields>({
        start,
        end,
        recording: isRecording,
        editing: isEditing && !!opts.editing,
        buildFields: opts.buildFields,
        validateEdit: opts.validateEdit,
        startTimer: opts.startTimer,
      })

      switch (plan.type) {
        case 'invalidStart':
          opts.err.set('startTime', opts.invalidStart())
          return
        case 'invalidFields':
        case 'editRejected':
          return
        case 'invalidOrder':
          opts.err.set('endTime', opts.invalidOrder())
          return
        case 'finishRecording':
          if (!activeEntry) return
          await opts.finishRecording(activeEntry.recordId, plan.end, plan.fields, start!)
          resetTimer(activeEntry.id)
          opts.onSaved?.()
          return
        case 'update':
          if (!opts.editing) return
          await opts.update(opts.editing.id, plan.fields, plan.start, plan.end)
          opts.onSaved?.()
          return
        case 'addRange':
          await opts.addRange(plan.fields, plan.start, plan.end)
          opts.onSaved?.()
          return
        case 'add': {
          const id = await opts.add(plan.fields, plan.start)
          if (plan.timer) {
            startTimer(opts.kind, id, plan.start)
            opts.onStartRecord?.()
          } else {
            opts.onSaved?.()
          }
          return
        }
      }
    } catch {
      toast(t('errors.generic'))
    }
  }

  return { startTime, setStartTime, endTime, setEndTime, activeEntry, isRecording, isEditing, durationText, submit }
}
