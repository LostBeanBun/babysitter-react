import Dexie, { type EntityTable, type Table } from 'dexie'
import { RECORD_TABLES, type RecordTableName } from '@/db/tables'
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

/** 应用内数据库版本（导出文件结构版本，升级时同步递增） */
export const DB_VERSION = 4

export interface BabySitterDB extends Dexie {
  babies: EntityTable<Baby, 'id'>
  feedings: EntityTable<Feeding, 'id'>
  diapers: EntityTable<DiaperChange, 'id'>
  pumpings: EntityTable<Pumping, 'id'>
  sleeps: EntityTable<Sleep, 'id'>
  growths: EntityTable<GrowthRecord, 'id'>
  solidFoods: EntityTable<SolidFood, 'id'>
  medications: EntityTable<Medication, 'id'>
  vaccinations: EntityTable<Vaccination, 'id'>
  temperatures: EntityTable<Temperature, 'id'>
  milestones: EntityTable<Milestone, 'id'>
}

export const db = new Dexie('babysitter') as BabySitterDB

db.version(1).stores({
  babies: '++id, createdAt',
  // 复合索引 [babyId+startTime] 支持按宝宝 + 时间段高效查询
  feedings: '++id, babyId, [babyId+startTime], startTime',
  diapers: '++id, babyId, [babyId+time], time',
  pumpings: '++id, babyId, [babyId+startTime], startTime',
  sleeps: '++id, babyId, [babyId+startTime], startTime',
})

// v2：新增成长记录表（自动升级保留原数据）
db.version(2).stores({
  growths: '++id, babyId, [babyId+date], date',
})

// v3：新增辅食/用药/疫苗/体温记录表
db.version(3).stores({
  solidFoods: '++id, babyId, [babyId+time], time',
  medications: '++id, babyId, [babyId+time], time',
  vaccinations: '++id, babyId, [babyId+date], date',
  temperatures: '++id, babyId, [babyId+time], time',
})

// v4：新增里程碑记录表
db.version(4).stores({
  milestones: '++id, babyId, [babyId+time], time',
})

/** 全部记录表（不含 babies），供清理/计数复用 */
function recordTables(): Table<unknown, unknown>[] {
  return RECORD_TABLES.map((r) => db[r.name] as Table<unknown, unknown>)
}

/** 清理某宝宝的全部数据 */
export async function clearBabyData(babyId: number): Promise<void> {
  const tables = recordTables()
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((tb) => tb.where('babyId').equals(babyId).delete()))
  })
}

/** 清空数据库全部数据（导入前调用） */
export async function clearAllData(): Promise<void> {
  const tables: Table<unknown, unknown>[] = [db.babies as Table<unknown, unknown>, ...recordTables()]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((tb) => tb.clear()))
  })
}

/** 记录计数（键为表名） */
export type RecordCounts = Record<RecordTableName, number>

/** 统计记录总数（设置页展示） */
export async function countAllRecords(): Promise<RecordCounts> {
  const entries = await Promise.all(RECORD_TABLES.map(async (r) => [r.name, await db[r.name].count()] as const))
  return Object.fromEntries(entries) as RecordCounts
}
