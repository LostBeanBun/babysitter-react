/**
 * 删除撤销链路：确认删除 → 3 秒待删除窗口（可撤销）→ 到期真实删除。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import { useDeleteUndo } from '@/hooks/useDeleteUndo'
import { useToastStore } from '@/stores/toast'
import { renderHook } from '@/test/render'

let seq = 0
/** 每个用例用独立 id：pending 集合是模块级单例，避免相互干扰 */
function target(kind = 'feeding') {
  return { kind, id: ++seq }
}

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  // 冲掉可能残留的待删除计时器，避免串到下一个用例
  vi.advanceTimersByTime(10_000)
  vi.useRealTimers()
  useToastStore.setState({ toasts: [] })
})

describe('useDeleteUndo', () => {
  it('确认后立即进入待删除态并弹出可撤销提示，但尚未真正删除', () => {
    const { result } = renderHook(() => useDeleteUndo())
    const item = target()
    const del = vi.fn(async () => {})

    act(() => result.current.scheduleDelete(item, del, '已删除记录', '撤销'))

    expect(result.current.isPending(item)).toBe(true)
    expect(del).not.toHaveBeenCalled()
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: '已删除记录', actionLabel: '撤销' })
  })

  it('3 秒内点「撤销」→ 取消删除并退出待删除态', async () => {
    const { result } = renderHook(() => useDeleteUndo())
    const item = target('diaper')
    const del = vi.fn(async () => {})

    act(() => result.current.scheduleDelete(item, del, '已删除记录', '撤销'))
    act(() => useToastStore.getState().toasts[0].onAction!())

    expect(result.current.isPending(item)).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(del).not.toHaveBeenCalled()
  })

  it('3 秒到期后执行真实删除并退出待删除态', async () => {
    const { result } = renderHook(() => useDeleteUndo())
    const item = target('sleep')
    const del = vi.fn(async () => {})

    act(() => result.current.scheduleDelete(item, del, '已删除记录', '撤销'))
    await vi.advanceTimersByTimeAsync(2999)
    expect(del).not.toHaveBeenCalled()
    expect(result.current.isPending(item)).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(del).toHaveBeenCalledTimes(1)
    expect(result.current.isPending(item)).toBe(false)
  })

  it('同一记录重复确认只调度一次（避免重复删除与重复 toast）', async () => {
    const { result } = renderHook(() => useDeleteUndo())
    const item = target('pumping')
    const del = vi.fn(async () => {})

    act(() => {
      result.current.scheduleDelete(item, del, '已删除记录', '撤销')
      result.current.scheduleDelete(item, del, '已删除记录', '撤销')
    })

    expect(useToastStore.getState().toasts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(3000)
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('不同记录各自独立：撤销一条不影响另一条', async () => {
    const { result } = renderHook(() => useDeleteUndo())
    const a = target('feeding')
    const b = target('feeding')
    const delA = vi.fn(async () => {})
    const delB = vi.fn(async () => {})

    act(() => {
      result.current.scheduleDelete(a, delA, '已删除记录', '撤销')
      result.current.scheduleDelete(b, delB, '已删除记录', '撤销')
    })
    expect(useToastStore.getState().toasts).toHaveLength(2)

    act(() => useToastStore.getState().toasts[1].onAction!())
    expect(result.current.isPending(a)).toBe(true)
    expect(result.current.isPending(b)).toBe(false)

    await vi.advanceTimersByTimeAsync(3000)
    expect(delA).toHaveBeenCalledTimes(1)
    expect(delB).not.toHaveBeenCalled()
  })

  it('undoDelete 可主动撤销（供需要立即恢复的场景使用）', async () => {
    const { result } = renderHook(() => useDeleteUndo())
    const item = target('temperature')
    const del = vi.fn(async () => {})

    act(() => result.current.scheduleDelete(item, del, '已删除记录', '撤销'))
    act(() => {
      result.current.undoDelete(item)
      result.current.undoDelete(item) // 幂等
    })

    expect(result.current.isPending(item)).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)
    expect(del).not.toHaveBeenCalled()
  })
})
