/**
 * 带「开始/结束时间 + 活动计时」记录表单的提交分支判定。
 *
 * 纯函数：只决定走哪条分支，不写库、不发事件，供两端 `useTimedRecord` 共用，
 * 保证「计时中 / 编辑 / 新建」三条链路与校验顺序在 Vue / React 两端逐字一致。
 * 需要 `err.set` 的分支通过返回值告知调用方（invalidStart / invalidOrder），
 * 字段级校验由 `buildFields` / `validateEdit` 自行标记错误。
 */
export interface TimedSubmitInput<TFields> {
  /** 解析后的开始时间戳；null/undefined 表示非法 */
  start: number | null | undefined
  /** 解析后的结束时间戳；undefined 表示未填 */
  end: number | undefined
  /** 是否处于活动计时中 */
  recording: boolean
  /** 是否编辑（且不在计时中） */
  editing: boolean
  /** 计时中未填结束时间时使用的时间戳，默认 Date.now() */
  now?: number
  /** 构建时间之外的字段；校验失败需先标记字段错误并返回 null */
  buildFields: () => TFields | null
  /** 编辑前的区间校验（如睡眠编辑必须有完整区间）；失败需先标记字段错误并返回 false */
  validateEdit?: (start: number, end: number | undefined) => boolean
  /** 新记录无结束时间时是否启动计时（瓶喂等单时间点记录返回 false），需为无副作用的读取 */
  startTimer?: () => boolean
}

export type TimedSubmitPlan<TFields> =
  | { type: 'invalidStart' }
  | { type: 'invalidFields' }
  | { type: 'invalidOrder' }
  | { type: 'editRejected' }
  | { type: 'finishRecording'; end: number; fields: TFields }
  | { type: 'update'; start: number; end: number | undefined; fields: TFields }
  | { type: 'addRange'; start: number; end: number; fields: TFields }
  | { type: 'add'; start: number; fields: TFields; timer: boolean }

export function planTimedSubmit<TFields>(input: TimedSubmitInput<TFields>): TimedSubmitPlan<TFields> {
  const start = input.start
  if (start == null) return { type: 'invalidStart' }
  const { end } = input

  // 计时中：结束记录，结束时间写回（空则取当前时间）
  if (input.recording) {
    const fields = input.buildFields()
    if (fields === null) return { type: 'invalidFields' }
    const endTs = end ?? input.now ?? Date.now()
    if (endTs <= start) return { type: 'invalidOrder' }
    return { type: 'finishRecording', end: endTs, fields }
  }

  // 编辑：先构建字段，再做区间校验
  if (input.editing) {
    const fields = input.buildFields()
    if (fields === null) return { type: 'invalidFields' }
    if (input.validateEdit && !input.validateEdit(start, end)) return { type: 'editRejected' }
    return { type: 'update', start, end, fields }
  }

  // 新记录：结束时间已填 → 直接保存；空 → 按表单决定是否启动计时
  const fields = input.buildFields()
  if (fields === null) return { type: 'invalidFields' }
  if (end != null) {
    if (end <= start) return { type: 'invalidOrder' }
    return { type: 'addRange', start, end, fields }
  }
  return { type: 'add', start, fields, timer: input.startTimer?.() ?? true }
}
