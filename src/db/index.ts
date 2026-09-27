import Dexie, { type EntityTable, type Table } from 'dexie'
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

/** 清理某宝宝的全部数据 */
export async function clearBabyData(babyId: number): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.feedings,
      db.diapers,
      db.pumpings,
      db.sleeps,
      db.growths,
      db.solidFoods,
      db.medications,
      db.vaccinations,
      db.temperatures,
      db.milestones,
    ],
    async () => {
      await db.feedings.where('babyId').equals(babyId).delete()
      await db.diapers.where('babyId').equals(babyId).delete()
      await db.pumpings.where('babyId').equals(babyId).delete()
      await db.sleeps.where('babyId').equals(babyId).delete()
      await db.growths.where('babyId').equals(babyId).delete()
      await db.solidFoods.where('babyId').equals(babyId).delete()
      await db.medications.where('babyId').equals(babyId).delete()
      await db.vaccinations.where('babyId').equals(babyId).delete()
      await db.temperatures.where('babyId').equals(babyId).delete()
      await db.milestones.where('babyId').equals(babyId).delete()
    },
  )
}

/** 清空数据库全部数据（导入前调用） */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.babies,
      db.feedings,
      db.diapers,
      db.pumpings,
      db.sleeps,
      db.growths,
      db.solidFoods,
      db.medications,
      db.vaccinations,
      db.temperatures,
      db.milestones,
    ],
    async () => {
      await Promise.all([
        db.babies.clear(),
        db.feedings.clear(),
        db.diapers.clear(),
        db.pumpings.clear(),
        db.sleeps.clear(),
        db.growths.clear(),
        db.solidFoods.clear(),
        db.medications.clear(),
        db.vaccinations.clear(),
        db.temperatures.clear(),
        db.milestones.clear(),
      ])
    },
  )
}

/** 统计记录总数（设置页展示） */
export async function countAllRecords(): Promise<{
  feedings: number
  diapers: number
  pumpings: number
  sleeps: number
  growths: number
  solidFoods: number
  medications: number
  vaccinations: number
  temperatures: number
  milestones: number
}> {
  const [feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, vaccinations, temperatures, milestones] =
    await Promise.all([
      db.feedings.count(),
      db.diapers.count(),
      db.pumpings.count(),
      db.sleeps.count(),
      db.growths.count(),
      db.solidFoods.count(),
      db.medications.count(),
      db.vaccinations.count(),
      db.temperatures.count(),
      db.milestones.count(),
    ])
  return {
    feedings,
    diapers,
    pumpings,
    sleeps,
    growths,
    solidFoods,
    medications,
    vaccinations,
    temperatures,
    milestones,
  }
}

/** 便捷：按宝宝 + 时间范围查询（半开区间 [start, end)） */
export function queryByRange<T>(
  table: Table<T, unknown>,
  babyId: number,
  field: 'startTime' | 'time',
  start: number,
  end: number,
) {
  return table.where(`[babyId+${field}]`).between([babyId, start], [babyId, end], true, false).toArray() as Promise<T[]>
}
