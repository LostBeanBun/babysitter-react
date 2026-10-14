import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore, toast } from '@/stores/toast'

describe('toast store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('push 默认 type=info 并按顺序追加', () => {
    useToastStore.getState().push('第一条')
    useToastStore.getState().push('第二条', 'success')
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(2)
    expect(toasts[0].message).toBe('第一条')
    expect(toasts[0].type).toBe('info')
    expect(toasts[1].type).toBe('success')
    expect(toasts[0].duration).toBe(3000)
  })

  it('默认 duration 到期进入离场态，remove 后真正移除', () => {
    useToastStore.getState().push('自动关闭')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(3000)
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].exiting).toBe(true)
    useToastStore.getState().remove(toasts[0].id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('dismiss 进入离场态且幂等，不直接影响其他 toast', () => {
    useToastStore.getState().push('手动关闭', 'info', { duration: 0 })
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().dismiss(id)
    useToastStore.getState().dismiss(id)
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].exiting).toBe(true)
    useToastStore.getState().remove(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('duration:0 常驻不自动移除', () => {
    useToastStore.getState().push('常驻', 'info', { duration: 0 })
    vi.advanceTimersByTime(100_000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    useToastStore.getState().remove(useToastStore.getState().toasts[0].id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('自定义 duration 到期进入离场态', () => {
    useToastStore.getState().push('短 toast', 'error', { duration: 500 })
    vi.advanceTimersByTime(499)
    expect(useToastStore.getState().toasts[0].exiting).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(useToastStore.getState().toasts[0].exiting).toBe(true)
  })

  it('toast() 快捷 API 透传 type 与 opts', () => {
    const onAction = vi.fn()
    toast('有操作', 'success', { actionLabel: '撤销', onAction, duration: 0 })
    const item = useToastStore.getState().toasts[0]
    expect(item.type).toBe('success')
    expect(item.actionLabel).toBe('撤销')
    expect(item.onAction).toBe(onAction)
    expect(item.duration).toBe(0)
  })

  it('手动 remove 不影响其他 toast', () => {
    useToastStore.getState().push('a', 'info', { duration: 0 })
    useToastStore.getState().push('b', 'info', { duration: 0 })
    const [first] = useToastStore.getState().toasts
    useToastStore.getState().remove(first.id)
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['b'])
  })
})
