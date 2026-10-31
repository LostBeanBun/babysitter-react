/**
 * 数据安全网：JSON 全量备份 / 恢复 + 备份新鲜度提醒 + 持久化存储申请。
 *
 * 本应用数据只存在浏览器 IndexedDB，一旦清理站点数据/驱逐存储即不可恢复，
 * 因此备份是唯一的兜底手段：
 * - 导出：把 babies 与 10 张记录表打包成 ExportFile（结构见 types/index.ts）
 * - 导入：先自动备份当前数据，再事务性清空并恢复，任何校验失败都不动现有数据
 * - 提醒：超过 7 天未备份时首页提示（关闭后静默 1 天，设置页可永久关闭）
 */
import { db, DB_VERSION } from '@/db'
import { downloadBlob, formatDate } from '@/utils/format'
import type { Baby, ExportFile } from '@/types'

const LAST_BACKUP_KEY = 'babysitter.lastBackupAt'
/** 关闭首页备份提醒后的静默截止时间（时间戳） */
const SNOOZE_KEY = 'babysitter.backupSnoozeUntil'
/** 首页备份提醒开关（'0' 表示永久关闭） */
const ENABLED_KEY = 'babysitter.backupRemindEnabled'

/** 超过该天数未备份即在首页提示 */
export const BACKUP_REMIND_DAYS = 7

/** 关闭提醒条后的静默天数：至少一天后才会再次提醒 */
export const BACKUP_SNOOZE_DAYS = 1

/** 读取上次备份时间（无记录返回 null） */
export function getLastBackupAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_BACKUP_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** 记录一次成功备份（导出 JSON 时调用）：备份后解除静默 */
export function markBackedUp(at = Date.now()): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(at))
    localStorage.removeItem(SNOOZE_KEY)
  } catch {
    /* 隐私模式/存储禁用时退化为本次会话不提示 */
  }
}

/** 首页备份提醒的静默截止时间（无记录返回 null） */
export function getBackupSnoozeUntil(): number | null {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

/** 关闭首页备份提醒：默认静默 BACKUP_SNOOZE_DAYS 天，刷新页面也不会立刻重现 */
export function snoozeBackupReminder(now = Date.now(), days = BACKUP_SNOOZE_DAYS): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + days * 86_400_000))
  } catch {
    /* 存储不可用时退化为本次会话不提示 */
  }
}

/** 是否开启首页备份提醒（默认开启，设置页可永久关闭） */
export function isBackupRemindEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

/** 设置首页备份提醒开关；重新开启时同时解除静默 */
export function setBackupRemindEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
    if (enabled) localStorage.removeItem(SNOOZE_KEY)
  } catch {
    /* 存储不可用时仅影响本次会话 */
  }
}

/**
 * 是否需要提醒备份：开关开启、不在静默期、有数据，且从未备份 / 距上次备份超过 BACKUP_REMIND_DAYS 天。
 * 纯函数，便于单测。
 */
export function shouldSuggestBackup(input: {
  lastBackupAt: number | null
  hasData: boolean
  now: number
  /** 关闭提醒后的静默截止时间（now 早于它时不提醒） */
  snoozeUntil?: number | null
  /** 设置页「首页备份提醒」开关，默认开启 */
  enabled?: boolean
}): boolean {
  if (input.enabled === false) return false
  if (input.snoozeUntil != null && input.now < input.snoozeUntil) return false
  if (!input.hasData) return false
  if (input.lastBackupAt == null) return true
  return input.now - input.lastBackupAt > BACKUP_REMIND_DAYS * 86_400_000
}

/** 汇总全库数据为可下载的备份对象 */
export async function buildBackup(now = Date.now()): Promise<ExportFile> {
  const [
    babies,
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
  ] = await Promise.all([
    db.babies.toArray(),
    db.feedings.toArray(),
    db.diapers.toArray(),
    db.pumpings.toArray(),
    db.sleeps.toArray(),
    db.growths.toArray(),
    db.solidFoods.toArray(),
    db.medications.toArray(),
    db.vaccinations.toArray(),
    db.temperatures.toArray(),
    db.milestones.toArray(),
  ])

  return {
    meta: { app: 'babysitter', version: DB_VERSION, exportedAt: new Date(now).toISOString() },
    babies: babies as Baby[],
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

/** 导出 JSON 全量备份并记录备份时间 */
export async function exportJsonBackup(now = Date.now()): Promise<void> {
  const data = await buildBackup(now)
  const filename = `babysitter-backup-${formatDate(now)}.json`
  downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json;charset=utf-8')
  markBackedUp(now)
}

/** 备份文件校验错误码（由界面映射成文案） */
export type BackupParseError = 'invalidJson' | 'notBackup' | 'tooNew'

/**
 * 解析并校验备份文件；失败时抛出 BackupParseError 字符串，
 * 调用方负责提示（校验失败绝不会清空现有数据）。
 */
export function parseBackup(text: string): ExportFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw 'invalidJson' satisfies BackupParseError
  }
  const file = parsed as Partial<ExportFile> | null
  if (!file || typeof file !== 'object' || file.meta?.app !== 'babysitter') {
    throw 'notBackup' satisfies BackupParseError
  }
  const version = Number(file.meta.version)
  if (!Number.isFinite(version) || version > DB_VERSION) {
    throw 'tooNew' satisfies BackupParseError
  }
  if (!Array.isArray(file.babies)) throw 'notBackup' satisfies BackupParseError

  return {
    meta: {
      app: 'babysitter',
      version,
      exportedAt: String(file.meta.exportedAt ?? ''),
    },
    babies: file.babies,
    feedings: Array.isArray(file.feedings) ? file.feedings : [],
    diapers: Array.isArray(file.diapers) ? file.diapers : [],
    pumpings: Array.isArray(file.pumpings) ? file.pumpings : [],
    sleeps: Array.isArray(file.sleeps) ? file.sleeps : [],
    growths: Array.isArray(file.growths) ? file.growths : [],
    solidFoods: Array.isArray(file.solidFoods) ? file.solidFoods : [],
    medications: Array.isArray(file.medications) ? file.medications : [],
    vaccinations: Array.isArray(file.vaccinations) ? file.vaccinations : [],
    temperatures: Array.isArray(file.temperatures) ? file.temperatures : [],
    milestones: Array.isArray(file.milestones) ? file.milestones : [],
  }
}

const RECORD_KEYS = [
  'feedings',
  'diapers',
  'pumpings',
  'sleeps',
  'growths',
  'solidFoods',
  'medications',
  'vaccinations',
  'temperatures',
  'milestones',
] as const

/** 导入结果计数（与记录表名一致） */
export type ImportJsonResult = { babies: number } & Record<(typeof RECORD_KEYS)[number], number>

/**
 * 从 JSON 备份恢复数据。
 * - 校验失败直接抛出，不改动现有数据
 * - 成功时先自动导出当前数据（避免误覆盖无退路），再事务性覆盖
 */
export async function importJsonBackup(file: File, now = Date.now()): Promise<ImportJsonResult> {
  const data = parseBackup(await file.text())

  // 覆盖前自动留一份当前数据的备份（用户可在下载目录找回）
  await exportJsonBackup(now)

  const tables = [
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
  ]
  const babyIds = new Set(data.babies.map((b) => b.id).filter((id): id is number => typeof id === 'number'))

  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    if (data.babies.length) await db.babies.bulkAdd(data.babies)
    for (const key of RECORD_KEYS) {
      const rows = (data[key] ?? []).filter((row) => {
        const babyId = (row as { babyId?: number }).babyId
        return babyId == null || babyIds.size === 0 || babyIds.has(babyId)
      })
      if (rows.length) await db.table(key).bulkAdd(rows)
    }
  })

  markBackedUp(now)

  return {
    babies: data.babies.length,
    ...Object.fromEntries(RECORD_KEYS.map((key) => [key, (data[key] ?? []).length])),
  } as ImportJsonResult
}

/** 申请持久化存储，降低浏览器在空间紧张时逐出 IndexedDB 的概率 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
