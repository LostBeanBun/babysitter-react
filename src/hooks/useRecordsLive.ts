import { useCallback, useSyncExternalStore } from 'react'
import { liveQuery } from 'dexie'
import { db } from '@/db'
import type { EntityTable } from 'dexie'
import type {
  Baby,
  Feeding,
  DiaperChange,
  Pumping,
  Sleep,
  GrowthRecord,
  SolidFood,
  Medication,
  Vaccination,
  Temperature,
  Milestone,
} from '@/types'

/** 每张记录表的行类型 */
export interface TableRowMap {
  feedings: Feeding
  diapers: DiaperChange
  pumpings: Pumping
  sleeps: Sleep
  growths: GrowthRecord
  solidFoods: SolidFood
  medications: Medication
  vaccinations: Vaccination
  temperatures: Temperature
  milestones: Milestone
}

export type RecordTable = keyof TableRowMap

/** 各表 [babyId+时间字段] 复合索引（与建表 schema 一致） */
const INDEX: { [K in RecordTable]: string } = {
  feedings: '[babyId+startTime]',
  diapers: '[babyId+time]',
  pumpings: '[babyId+startTime]',
  sleeps: '[babyId+startTime]',
  growths: '[babyId+date]',
  solidFoods: '[babyId+time]',
  medications: '[babyId+time]',
  vaccinations: '[babyId+date]',
  temperatures: '[babyId+time]',
  milestones: '[babyId+time]',
}

const TABLES: { [K in RecordTable]: EntityTable<TableRowMap[K], 'id'> } = {
  feedings: db.feedings,
  diapers: db.diapers,
  pumpings: db.pumpings,
  sleeps: db.sleeps,
  growths: db.growths,
  solidFoods: db.solidFoods,
  medications: db.medications,
  vaccinations: db.vaccinations,
  temperatures: db.temperatures,
  milestones: db.milestones,
}

interface CacheEntry {
  data: unknown[] | undefined
  readonly listeners: Set<() => void>
  stop: (() => void) | undefined
}

/**
 * 全局表缓存：每 (表, 宝宝) 一条 liveQuery 订阅，常驻不释放——
 * 跨视图/路由/重复挂载共享同一份数据（对齐 Vue 侧 pinia store 行为），
 * 避免各组件各自重复发起同构查询。
 */
const cache = new Map<string, CacheEntry>()

async function loadRows<K extends RecordTable>(table: K, babyId: number): Promise<TableRowMap[K][]> {
  const rows = await TABLES[table]
    .where(INDEX[table])
    .between([babyId, 0], [babyId, Number.MAX_SAFE_INTEGER])
    .toArray()
  return rows.filter(Boolean)
}

function getEntry<K extends RecordTable>(table: K, babyId: number): CacheEntry {
  const key = `${table}:${babyId}`
  const existing = cache.get(key)
  if (existing) return existing
  const entry: CacheEntry = { data: undefined, listeners: new Set(), stop: undefined }
  cache.set(key, entry)
  const subscription = liveQuery(() => loadRows(table, babyId)).subscribe({
    next: (rows) => {
      entry.data = rows as unknown[]
      entry.listeners.forEach((notify) => notify())
    },
    error: (cause) => {
      console.error('useRecordsLive query failed:', table, cause)
    },
  })
  entry.stop = () => subscription.unsubscribe()
  return entry
}

/**
 * 全局记录表订阅（替代 dexie-react-hooks 的 useLiveQuery）：
 * - 返回该宝宝整表数据；undefined = 首次加载中；babyId 为空返回 undefined
 * - 相同 (表, 宝宝) 的多个组件共享同一订阅与缓存快照
 */
export function useRecordsLive<K extends RecordTable>(
  table: K,
  babyId: number | null | undefined,
): TableRowMap[K][] | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (babyId == null) return () => {}
      const entry = getEntry(table, babyId)
      entry.listeners.add(onChange)
      return () => {
        entry.listeners.delete(onChange)
      }
    },
    [table, babyId],
  )
  const getSnapshot = useCallback((): TableRowMap[K][] | undefined => {
    if (babyId == null) return undefined
    return cache.get(`${table}:${babyId}`)?.data as TableRowMap[K][] | undefined
  }, [table, babyId])
  // getServerSnapshot：静态导出预渲染时缓存为空 → undefined，与客户端首帧一致
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** babies 表全局单例缓存（不按宝宝分片） */
const babiesEntry: CacheEntry = { data: undefined, listeners: new Set(), stop: undefined }
let babiesStarted = false

function ensureBabies(): void {
  if (babiesStarted) return
  babiesStarted = true
  const subscription = liveQuery(() => db.babies.orderBy('createdAt').toArray()).subscribe({
    next: (rows) => {
      babiesEntry.data = rows as unknown[]
      babiesEntry.listeners.forEach((notify) => notify())
    },
    error: (cause) => {
      console.error('useBabiesLive query failed:', cause)
    },
  })
  babiesEntry.stop = () => subscription.unsubscribe()
}

/** 宝宝列表全局订阅：任意组件共享同一份 babies 快照；undefined = 首次加载中 */
export function useBabiesLive(): Baby[] | undefined {
  const subscribe = useCallback((onChange: () => void) => {
    ensureBabies()
    babiesEntry.listeners.add(onChange)
    return () => {
      babiesEntry.listeners.delete(onChange)
    }
  }, [])
  const getSnapshot = useCallback(() => babiesEntry.data as Baby[] | undefined, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
