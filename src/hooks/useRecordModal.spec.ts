/**
 * 记录弹窗状态分发：新增/编辑/删除确认、提示文案、按记录类型落到对应表、悬浮球显隐。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act } from 'react'
import i18n from '@/i18n'
import { useRecordModal } from '@/hooks/useRecordModal'
import { useSleepModalStore } from '@/hooks/useSleepModal'
import { useToastStore } from '@/stores/toast'
import { renderHook } from '@/test/render'
import type { RecordKind } from '@/types'
import type { TimelineEntry } from '@/services/timeline'

const { tables } = vi.hoisted(() => {
  const make = () => ({ delete: vi.fn(async () => {}) })
  return {
    tables: {
      feedings: make(),
      diapers: make(),
      pumpings: make(),
      sleeps: make(),
      growths: make(),
      solidFoods: make(),
      medications: make(),
      vaccinations: make(),
      temperatures: make(),
      milestones: make(),
    },
  }
})

vi.mock('@/db', () => ({ db: tables }))

/** 各记录类型 → Dexie 表名（与 useRecordModal 的分发保持一致） */
const TABLE: Record<RecordKind, keyof typeof tables> = {
  feeding: 'feedings',
  diaper: 'diapers',
  pumping: 'pumpings',
  sleep: 'sleeps',
  growth: 'growths',
  solidFood: 'solidFoods',
  medication: 'medications',
  vaccination: 'vaccinations',
  temperature: 'temperatures',
  milestone: 'milestones',
}

let seq = 0
function entry(kind: RecordKind): TimelineEntry {
  const id = ++seq
  return {
    id,
    kind,
    time: 1_700_000_000_000,
    icon: '🍼',
    color: '#000',
    kindColor: '#000',
    title: 't',
    detail: 'd',
    raw: { id, babyId: 1, createdAt: 0, updatedAt: 0 } as TimelineEntry['raw'],
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  for (const table of Object.values(tables)) table.delete.mockClear()
  useToastStore.setState({ toasts: [] })
  useSleepModalStore.setState({ open: false })
})

afterEach(() => {
  vi.advanceTimersByTime(10_000)
  vi.useRealTimers()
  useToastStore.setState({ toasts: [] })
})

describe('useRecordModal', () => {
  it('openAdd 打开对应表单并隐藏睡眠悬浮球；closeForm 关闭后恢复', () => {
    const { result } = renderHook(() => useRecordModal())

    act(() => result.current.openAdd('feeding'))
    expect(result.current.modalState).toEqual({ kind: 'feeding' })
    expect(useSleepModalStore.getState().open).toBe(true)

    act(() => result.current.closeForm())
    expect(result.current.modalState).toBeNull()
    expect(useSleepModalStore.getState().open).toBe(false)
  })

  it('onEdit 携带编辑条目打开表单', () => {
    const { result } = renderHook(() => useRecordModal())
    const item = entry('diaper')

    act(() => result.current.onEdit(item))
    expect(result.current.modalState).toEqual({ kind: 'diaper', editing: item })
  })

  it('onSaved / onStartRecord 关闭弹窗并提示，onCancelled 静默关闭', () => {
    const { result } = renderHook(() => useRecordModal())

    act(() => result.current.openAdd('sleep'))
    act(() => result.current.onSaved())
    expect(result.current.modalState).toBeNull()
    expect(useToastStore.getState().toasts[0].message).toBe(i18n.t('common.recordSaved'))

    act(() => result.current.openAdd('sleep'))
    act(() => result.current.onStartRecord())
    expect(result.current.modalState).toBeNull()
    expect(useToastStore.getState().toasts[1].message).toBe(i18n.t('common.recordStarted'))

    useToastStore.setState({ toasts: [] })
    act(() => result.current.openAdd('sleep'))
    act(() => result.current.onCancelled())
    expect(result.current.modalState).toBeNull()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('onDelete 打开删除确认；closeDelete 取消确认', () => {
    const { result } = renderHook(() => useRecordModal())
    const item = entry('feeding')

    act(() => result.current.onDelete(item))
    expect(result.current.confirmDelete).toEqual(item)

    act(() => result.current.closeDelete())
    expect(result.current.confirmDelete).toBeNull()
  })

  it('confirmDeleteAction 进入 3 秒撤销窗口，到期才真正删除', async () => {
    const { result } = renderHook(() => useRecordModal())
    const item = entry('feeding')

    act(() => result.current.onDelete(item))
    await act(async () => {
      await result.current.confirmDeleteAction()
    })

    expect(result.current.confirmDelete).toBeNull()
    const toast = useToastStore.getState().toasts[0]
    expect(toast).toMatchObject({
      message: i18n.t('common.deletedToast'),
      actionLabel: i18n.t('common.undo'),
    })
    expect(tables.feedings.delete).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(tables.feedings.delete).toHaveBeenCalledWith(item.id)
  })

  it('撤销窗口内点击撤销则不删除', async () => {
    const { result } = renderHook(() => useRecordModal())
    const item = entry('pumping')

    act(() => result.current.onDelete(item))
    await act(async () => {
      await result.current.confirmDeleteAction()
    })
    act(() => useToastStore.getState().toasts[0].onAction!())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(tables.pumpings.delete).not.toHaveBeenCalled()
  })

  it('每种记录类型删除时落到对应数据表', async () => {
    const kinds = Object.keys(TABLE) as RecordKind[]

    for (const kind of kinds) {
      const { result, unmount } = renderHook(() => useRecordModal())
      const item = entry(kind)

      act(() => result.current.onDelete(item))
      await act(async () => {
        await result.current.confirmDeleteAction()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(tables[TABLE[kind]].delete, kind).toHaveBeenCalledWith(item.id)
      unmount()
    }
  })
})
