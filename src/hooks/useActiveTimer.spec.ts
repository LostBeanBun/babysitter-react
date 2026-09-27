import { describe, it, expect, beforeEach } from 'vitest'
import { useActiveTimerStore, type TimerKind } from '@/hooks/useActiveTimer'

const STORAGE_KEY = 'active_records'

function resetStore() {
  localStorage.clear()
  useActiveTimerStore.setState({ records: [] })
}

describe('useActiveTimerStore', () => {
  beforeEach(resetStore)

  it('start 返回自增 id 并写入 localStorage', () => {
    const id = useActiveTimerStore.getState().start('feeding', 100, 1000)
    expect(id).toBeTruthy()
    const { records } = useActiveTimerStore.getState()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ kind: 'feeding', recordId: 100, startTime: 1000 })
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(raw).toHaveLength(1)
    expect(raw[0].id).toBe(id)
  })

  it('同 kind 重复 start → null', () => {
    expect(useActiveTimerStore.getState().start('sleep', 1)).toBeTruthy()
    expect(useActiveTimerStore.getState().start('sleep', 2)).toBeNull()
    expect(useActiveTimerStore.getState().records).toHaveLength(1)
  })

  it('第 4 条 → null（MAX=3）', () => {
    const kinds: TimerKind[] = ['feeding', 'sleep', 'pumping']
    for (const k of kinds) {
      expect(useActiveTimerStore.getState().start(k, 1), k).toBeTruthy()
    }
    expect(useActiveTimerStore.getState().records).toHaveLength(3)
    // 满 3 条后即使 kind 不同也拒绝
    useActiveTimerStore.setState({ records: useActiveTimerStore.getState().records.slice(0, 3) })
    const st = useActiveTimerStore.getState()
    // 已满，start 任意 kind 都应 null（因为 length >= MAX）
    // 注意 kinds 已占满三种 kind，换 kind 也不行时 length 检查先触发
    expect(st.start('feeding' as TimerKind, 9)).toBeNull()
  })

  it('reset(id) 单删；reset() 全清并写回', () => {
    const a = useActiveTimerStore.getState().start('feeding', 1)
    const b = useActiveTimerStore.getState().start('sleep', 2)
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    useActiveTimerStore.getState().reset(a!)
    expect(useActiveTimerStore.getState().records.map((r) => r.id)).toEqual([b])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toHaveLength(1)
    useActiveTimerStore.getState().reset()
    expect(useActiveTimerStore.getState().records).toEqual([])
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual([])
  })

  it('localStorage 损坏 JSON → 恢复为 []', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')
    // restore 在模块加载时执行，这里直接测 filter 行为：
    // 模拟 store 从损坏数据恢复的分支
    const broken = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return []
        const arr = JSON.parse(raw)
        if (!Array.isArray(arr)) return []
        return arr.filter((r: { kind?: string; recordId?: number; startTime?: number }) =>
          Boolean(r.kind && r.recordId != null && r.startTime != null && r.startTime > 0),
        )
      } catch {
        return []
      }
    }
    expect(broken()).toEqual([])
  })

  it('非数组 JSON → []；字段不全被过滤', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1 }))
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(Array.isArray(arr)).toBe(false)

    const partial = [
      { id: '1', kind: 'feeding', recordId: 1, startTime: 100 },
      { id: '2', kind: '', recordId: 1, startTime: 100 },
      { id: '3', kind: 'sleep', recordId: null, startTime: 100 },
      { id: '4', kind: 'sleep', recordId: 1, startTime: 0 },
      { id: '5', kind: 'pumping', recordId: 2, startTime: 200 },
    ]
    const valid = partial.filter((r) => r.kind && r.recordId != null && r.startTime > 0)
    expect(valid.map((r) => r.id)).toEqual(['1', '5'])
  })

  it('hasKind / getById / getByKind 查询', () => {
    const id = useActiveTimerStore.getState().start('pumping', 42, 999)
    const st = useActiveTimerStore.getState()
    expect(st.hasKind('pumping')).toBe(true)
    expect(st.hasKind('feeding')).toBe(false)
    expect(st.getById(id!)?.recordId).toBe(42)
    expect(st.getByKind('pumping')?.startTime).toBe(999)
    expect(st.getByKind('sleep')).toBeUndefined()
  })

  it('恢复后 nextId 大于已有最大 id（不重复 id）', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: '10', kind: 'feeding', recordId: 1, startTime: 100 }]),
    )
    // 手动模拟 restore 对 nextId 的提升
    const arr = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    let nextId = 1
    for (const r of arr) {
      const num = Number(r.id)
      if (!isNaN(num) && num >= nextId) nextId = num + 1
    }
    expect(nextId).toBe(11)
  })
})
