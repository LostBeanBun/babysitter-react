'use client'

/**
 * 全局记录状态（数组模式）：支持多个未完成记录同时存在。
 * - start(kind, recordId, ts) 开始记录，返回唯一 id
 * - reset(id?) 按 id 清除，不传则清除全部
 * - records 活跃记录列表（最多 MAX_RECORDS 条）
 * - 持久化到 localStorage，刷新页面后悬浮球自动恢复
 */
import { create } from 'zustand'

export type TimerKind = 'feeding' | 'sleep' | 'pumping'

export interface ActiveRecord {
  id: string
  kind: TimerKind
  recordId: number
  startTime: number
}

const STORAGE_KEY = 'active_records'
const MAX_RECORDS = 3

let nextId = 1

function restore(): ActiveRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr: ActiveRecord[] = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    const valid = arr.filter((r) => r.kind && r.recordId != null && r.startTime > 0)
    for (const r of valid) {
      const num = Number(r.id)
      if (!isNaN(num) && num >= nextId) nextId = num + 1
    }
    return valid
  } catch {
    return []
  }
}

function save(records: ActiveRecord[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

interface ActiveTimerState {
  records: ActiveRecord[]
  hasKind: (k: TimerKind) => boolean
  start: (k: TimerKind, recordId: number, ts?: number) => string | null
  reset: (id?: string) => void
  getById: (id: string) => ActiveRecord | undefined
  getByKind: (k: TimerKind) => ActiveRecord | undefined
}

export const useActiveTimerStore = create<ActiveTimerState>((set, get) => ({
  // SSR/首帧必须为空，与服务端 HTML 一致；localStorage 在 hydrateActiveTimer 中恢复
  records: [],
  hasKind: (k) => get().records.some((r) => r.kind === k),
  start: (k, recordId, ts = Date.now()) => {
    const records = get().records
    if (records.length >= MAX_RECORDS) return null
    if (records.some((r) => r.kind === k)) return null
    const id = String(nextId++)
    const next = [...records, { id, kind: k, recordId, startTime: ts }]
    save(next)
    set({ records: next })
    return id
  },
  reset: (id) => {
    const next = id ? get().records.filter((r) => r.id !== id) : []
    save(next)
    set({ records: next })
  },
  getById: (id) => get().records.find((r) => r.id === id),
  getByKind: (k) => get().records.find((r) => r.kind === k),
}))

/** 挂载后从 localStorage 恢复活跃记录（勿在渲染/模块加载期调用） */
export function hydrateActiveTimer() {
  useActiveTimerStore.setState({ records: restore() })
}

/** 兼容旧 hook 用法 */
export function useActiveTimer() {
  return useActiveTimerStore()
}
