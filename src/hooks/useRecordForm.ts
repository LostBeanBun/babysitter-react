'use client'

/**
 * 单时间点记录表单的公共提交流程（对齐 Vue 同名 composable）：
 * clearAll → validate（失败即停） → 按编辑态 update/add → onSaved。
 */
import type { FormErrors } from '@/hooks/useFormErrors'

export interface RecordFormOptions<TPayload> {
  err: FormErrors
  editing?: { id: number } | undefined
  /** 校验并构建提交数据；失败时返回 null（内部需先 err.set 标记错误） */
  validate: () => TPayload | null
  add: (payload: TPayload) => Promise<unknown>
  update: (id: number, payload: TPayload) => Promise<unknown>
  onSaved?: () => void
}

export function useRecordForm<TPayload>(opts: RecordFormOptions<TPayload>) {
  async function submit(): Promise<void> {
    opts.err.clearAll()
    const payload = opts.validate()
    if (payload === null) return
    if (opts.editing) {
      await opts.update(opts.editing.id, payload)
    } else {
      await opts.add(payload)
    }
    opts.onSaved?.()
  }

  return { submit }
}
