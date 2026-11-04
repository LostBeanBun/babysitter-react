import { describe, it, expect, vi } from 'vitest'
import { planTimedSubmit, type TimedSubmitInput } from '@/services/timedRecord'

interface Fields {
  amount?: number
  notes?: string
}

/** 默认输入：新建、时间合法、字段合法 */
function input(overrides: Partial<TimedSubmitInput<Fields>> = {}): TimedSubmitInput<Fields> {
  return {
    start: 1_000,
    end: undefined,
    recording: false,
    editing: false,
    buildFields: () => ({ notes: 'ok' }),
    ...overrides,
  }
}

describe('planTimedSubmit', () => {
  it('开始时间非法 → invalidStart，且不构建字段', () => {
    const buildFields = vi.fn(() => ({ notes: 'ok' }))
    expect(planTimedSubmit(input({ start: undefined, buildFields }))).toEqual({ type: 'invalidStart' })
    expect(planTimedSubmit(input({ start: null, buildFields }))).toEqual({ type: 'invalidStart' })
    expect(buildFields).not.toHaveBeenCalled()
  })

  it('计时中：字段校验失败 → invalidFields', () => {
    const plan = planTimedSubmit(input({ recording: true, buildFields: () => null }))
    expect(plan).toEqual({ type: 'invalidFields' })
  })

  it('计时中：结束时间晚于开始 → finishRecording（透传结束时间与字段）', () => {
    const plan = planTimedSubmit(input({ recording: true, end: 2_000 }))
    expect(plan).toEqual({ type: 'finishRecording', end: 2_000, fields: { notes: 'ok' } })
  })

  it('计时中：未填结束时间 → 取当前时间', () => {
    const plan = planTimedSubmit(input({ recording: true, end: undefined, now: 5_000 }))
    expect(plan).toEqual({ type: 'finishRecording', end: 5_000, fields: { notes: 'ok' } })
  })

  it('计时中：结束时间不晚于开始 → invalidOrder', () => {
    expect(planTimedSubmit(input({ recording: true, end: 1_000 }))).toEqual({ type: 'invalidOrder' })
    expect(planTimedSubmit(input({ recording: true, end: 500 }))).toEqual({ type: 'invalidOrder' })
    expect(planTimedSubmit(input({ recording: true, now: 999 }))).toEqual({ type: 'invalidOrder' })
  })

  it('计时中：先构建字段再校验区间（字段错误优先）', () => {
    const calls: string[] = []
    const plan = planTimedSubmit(
      input({
        recording: true,
        end: 500,
        buildFields: () => {
          calls.push('buildFields')
          return { notes: 'ok' }
        },
      }),
    )
    expect(plan).toEqual({ type: 'invalidOrder' })
    expect(calls).toEqual(['buildFields'])
  })

  it('编辑：字段校验失败 → invalidFields，不再做区间校验', () => {
    const validateEdit = vi.fn(() => true)
    const plan = planTimedSubmit(input({ editing: true, buildFields: () => null, validateEdit }))
    expect(plan).toEqual({ type: 'invalidFields' })
    expect(validateEdit).not.toHaveBeenCalled()
  })

  it('编辑：区间校验拒绝 → editRejected', () => {
    const plan = planTimedSubmit(input({ editing: true, end: 2_000, validateEdit: () => false }))
    expect(plan).toEqual({ type: 'editRejected' })
  })

  it('编辑：校验通过 → update（开始/结束时间原样透传）', () => {
    const plan = planTimedSubmit(input({ editing: true, end: undefined }))
    expect(plan).toEqual({ type: 'update', start: 1_000, end: undefined, fields: { notes: 'ok' } })
    expect(planTimedSubmit(input({ editing: true, end: 2_000 }))).toEqual({
      type: 'update',
      start: 1_000,
      end: 2_000,
      fields: { notes: 'ok' },
    })
  })

  it('新建带结束时间 → addRange', () => {
    expect(planTimedSubmit(input({ end: 2_000 }))).toEqual({
      type: 'addRange',
      start: 1_000,
      end: 2_000,
      fields: { notes: 'ok' },
    })
  })

  it('新建：结束时间不晚于开始 → invalidOrder', () => {
    expect(planTimedSubmit(input({ end: 1_000 }))).toEqual({ type: 'invalidOrder' })
    expect(planTimedSubmit(input({ end: 200 }))).toEqual({ type: 'invalidOrder' })
  })

  it('新建无结束时间 → add，默认启动计时', () => {
    expect(planTimedSubmit(input())).toEqual({ type: 'add', start: 1_000, fields: { notes: 'ok' }, timer: true })
  })

  it('新建无结束时间：startTimer 返回 false → add 不启动计时（瓶喂等单时间点记录）', () => {
    expect(planTimedSubmit(input({ startTimer: () => false }))).toEqual({
      type: 'add',
      start: 1_000,
      fields: { notes: 'ok' },
      timer: false,
    })
  })

  it('字段错误优先于区间错误（新建）', () => {
    const plan = planTimedSubmit(input({ end: 500, buildFields: () => null }))
    expect(plan).toEqual({ type: 'invalidFields' })
  })
})
