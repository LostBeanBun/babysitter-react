import type { RecordKind } from '@/types'

/**
 * 记录表注册表：表名、复合索引时间字段、记录种类的单一来源。
 * Dexie schema、按宝宝查询、清理/计数、Store 工厂均由此派生。
 */
export const RECORD_TABLES = [
  { name: 'feedings', timeField: 'startTime', kind: 'feeding' },
  { name: 'diapers', timeField: 'time', kind: 'diaper' },
  { name: 'pumpings', timeField: 'startTime', kind: 'pumping' },
  { name: 'sleeps', timeField: 'startTime', kind: 'sleep' },
  { name: 'growths', timeField: 'date', kind: 'growth' },
  { name: 'solidFoods', timeField: 'time', kind: 'solidFood' },
  { name: 'medications', timeField: 'time', kind: 'medication' },
  { name: 'vaccinations', timeField: 'date', kind: 'vaccination' },
  { name: 'temperatures', timeField: 'time', kind: 'temperature' },
  { name: 'milestones', timeField: 'time', kind: 'milestone' },
] as const satisfies readonly { name: string; timeField: 'startTime' | 'time' | 'date'; kind: RecordKind }[]

export type RecordTableName = (typeof RECORD_TABLES)[number]['name']
