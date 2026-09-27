'use client'

/**
 * 删除撤销：确认删除后先将记录从视图隐藏并进入 3 秒待删除期，
 * 期间可通过 Toast「撤销」按钮恢复；超时后执行真实删除。
 */
import { useCallback, useRef } from 'react'
import { create } from 'zustand'
import { toast } from '@/stores/toast'

export interface DeleteTarget {
  kind: string
  id: number
}

function keyOf(e: DeleteTarget): string {
  return e.kind + '-' + e.id
}

interface PendingState {
  keys: Set<string>
  add: (k: string) => void
  remove: (k: string) => void
}

const usePendingStore = create<PendingState>((set) => ({
  keys: new Set(),
  add: (k) =>
    set((s) => {
      const next = new Set(s.keys)
      next.add(k)
      return { keys: next }
    }),
  remove: (k) =>
    set((s) => {
      const next = new Set(s.keys)
      next.delete(k)
      return { keys: next }
    }),
}))

export function useDeleteUndo() {
  const keys = usePendingStore((s) => s.keys)
  const addKey = usePendingStore((s) => s.add)
  const removeKey = usePendingStore((s) => s.remove)
  const timers = useRef(new Map<string, number>())

  const isPending = useCallback((e: DeleteTarget) => keys.has(keyOf(e)), [keys])

  const undoDelete = useCallback(
    (e: DeleteTarget) => {
      const k = keyOf(e)
      const timer = timers.current.get(k)
      if (timer != null) window.clearTimeout(timer)
      timers.current.delete(k)
      removeKey(k)
    },
    [removeKey],
  )

  const scheduleDelete = useCallback(
    (e: DeleteTarget, doDelete: () => Promise<void>, message: string, undoLabel: string) => {
      const k = keyOf(e)
      if (usePendingStore.getState().keys.has(k)) return
      addKey(k)
      const timer = window.setTimeout(async () => {
        timers.current.delete(k)
        removeKey(k)
        await doDelete()
      }, 3000)
      timers.current.set(k, timer)
      toast(message, 'info', { actionLabel: undoLabel, onAction: () => undoDelete(e) })
    },
    [addKey, removeKey, undoDelete],
  )

  return { isPending, scheduleDelete, undoDelete }
}
