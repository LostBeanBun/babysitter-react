/**
 * CSV 导出：统一宽表格式（双语标签 + UTF-8 BOM），支持单宝宝与全部宝宝合并导出。
 * 实现与导入（importCsv.ts）共用 csvLabels.ts 的标签体系。
 */
import { db } from '@/db'
import { RECORD_TABLES } from '@/db/tables'
import { serviceT as t } from '@/i18n/service'
import type {
  Feeding,
  DiaperChange,
  Pumping,
  Sleep,
  Baby,
  GrowthRecord,
  SolidFood,
  Medication,
  Vaccination,
  Temperature,
  Milestone,
} from '@/types'
import { downloadBlob, formatDate, formatTime } from '@/utils/format'
import { bl, breastSideLabel, CSV_COLUMN_KEYS, BABY_COLUMN_KEYS } from './csvLabels'


/** CSV 转义：含逗号/引号/换行时包裹引号 */
export function csvEscape(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

type Row = (string | number | undefined | null)[]

/** CSV 表头（仅本地化展示） */
function csvHeader(withBaby: boolean): Row {
  const cols = [...CSV_COLUMN_KEYS, ...BABY_COLUMN_KEYS].map((k) => t(`exportCsv.${k}`))
  return withBaby ? [t('exportCsv.babyName'), ...cols] : cols
}

/** 宝宝信息行（每份导出文件头部写入一条，保留姓名/性别/出生信息/头像等资料） */
export function buildBabyInfoRow(baby: Baby, withBabyName = false): Row {
  const parts: string[] = []
  if (baby.birthWeight != null) parts.push(`${baby.birthWeight} kg`)
  if (baby.birthHeight != null) parts.push(`${baby.birthHeight} cm`)
  return [
    ...(withBabyName ? [baby.name] : []),
    bl('baby'),
    baby.birthDate ?? '',
    '',
    '',
    '',
    baby.name,
    parts.join(' · '),
    '',
    baby.gender ? bl(baby.gender) : '',
    '',
    baby.avatar ?? '',
    baby.avatarColor ?? '',
  ]
}

/** 开始时间两列：[date, time] */
function startCells(ts: number): [string, string] {
  return [formatDate(ts), formatTime(ts)]
}

/** 结束时间两列：无值时留空 */
function endCells(ts?: number): [string, string] {
  return ts ? [formatDate(ts), formatTime(ts)] : ['', '']
}

/** 时长列：ms → 分钟（无值留空） */
function minCell(ms?: number): number | string {
  return ms ? Math.round(ms / 60000) : ''
}

/** 一条记录行：宝宝名前列 + 固定 10 列（type..notes）+ 宝宝信息列占位 */
function makeRow(nameCol: Row, type: string, cells: [string, string, string, string, string, string, number | string, string, string]): Row {
  const [date, time, endDate, endTime, item, value, duration, status, notes] = cells
  return [...nameCol, bl(type), date, time, endDate, endTime, item, value, duration, status, notes, '', '']
}

/** 单个宝宝的全部记录数据（供 CSV 行生成使用） */
export interface BabyCsvData {
  feedings: Feeding[]
  diapers: DiaperChange[]
  pumpings: Pumping[]
  sleeps: Sleep[]
  growths: GrowthRecord[]
  solidFoods: SolidFood[]
  medications: Medication[]
  vaccinations: Vaccination[]
  temperatures: Temperature[]
  milestones: Milestone[]
}

/**
 * 生成单个宝宝的全部记录 CSV 数据行（不含表头）。
 * 列值使用当前 locale 的本地化标签；导入时经 zh/en 双语反查表还原为内部键值。
 * babyName 提供时每行首列插入宝宝名（用于多宝宝合并导出）。
 */
export function buildBabyCsvRows(data: BabyCsvData, babyName?: string): Row[] {
  const nameCol: Row = babyName !== undefined ? [babyName] : []
  const rows: Row[] = []

  // 喂养
  for (const f of data.feedings) {
    const typeLabel = f.type === 'breast' && f.side ? bl(f.type) + '·' + breastSideLabel(f.side) : bl(f.type)
    const [ed, et] = endCells(f.endTime)
    const [d, tm] = startCells(f.startTime)
    rows.push(makeRow(nameCol, 'feeding', [d, tm, ed, et, typeLabel, f.amount != null ? `${f.amount} ml` : '', minCell(f.duration), '', f.notes ?? '']))
  }

  // 纸尿裤
  for (const g of data.diapers) {
    const [d, tm] = startCells(g.time)
    const value = [g.color ? bl(g.color) : '', g.amount ? bl(g.amount) : ''].filter(Boolean).join(' · ')
    rows.push(makeRow(nameCol, 'diaper', [d, tm, '', '', bl(g.type), value, '', '', g.notes ?? '']))
  }

  // 吸奶
  for (const p of data.pumpings) {
    const [ed, et] = endCells(p.endTime)
    const [d, tm] = startCells(p.startTime)
    rows.push(
      makeRow(nameCol, 'pumping', [d, tm, ed, et, breastSideLabel(p.side), p.amount != null ? `${p.amount} ml` : '', minCell(p.duration), '', p.notes ?? '']),
    )
  }

  // 睡眠
  for (const s of data.sleeps) {
    const endTs = s.endTime ?? s.startTime
    const durMs = s.duration ?? endTs - s.startTime
    const [d, tm] = startCells(s.startTime)
    const [ed, et] = startCells(endTs)
    rows.push(makeRow(nameCol, 'sleep', [d, tm, ed, et, bl('nap'), '', minCell(durMs), '', s.notes ?? '']))
  }

  // 成长记录
  for (const g of data.growths) {
    const parts: string[] = []
    if (g.weight != null) parts.push(`${g.weight} kg`)
    if (g.height != null) parts.push(`${g.height} cm`)
    if (g.headCircumference != null) parts.push(`${g.headCircumference} cm`)
    rows.push(makeRow(nameCol, 'growth', [formatDate(g.date), '', '', '', '', parts.join(' · '), '', '', g.notes ?? '']))
  }

  // 辅食
  for (const sf of data.solidFoods) {
    const [d, tm] = startCells(sf.time)
    rows.push(makeRow(nameCol, 'solidFood', [d, tm, '', '', sf.food, sf.amount ?? '', '', '', sf.notes ?? '']))
  }

  // 用药
  for (const m of data.medications) {
    const [d, tm] = startCells(m.time)
    rows.push(makeRow(nameCol, 'medication', [d, tm, '', '', m.name, m.dose ?? '', '', '', m.notes ?? '']))
  }

  // 疫苗
  for (const v of data.vaccinations) {
    rows.push(makeRow(nameCol, 'vaccination', [formatDate(v.date), '', '', '', v.name, v.dose ?? '', '', bl(v.status), v.notes ?? '']))
  }

  // 体温
  for (const tmp of data.temperatures) {
    const [d, tm] = startCells(tmp.time)
    rows.push(
      makeRow(nameCol, 'temperature', [
        d,
        tm,
        '',
        '',
        tmp.method ? bl(tmp.method) : '',
        tmp.value != null && tmp.value !== 0 ? `${tmp.value} ℃` : '',
        '',
        '',
        tmp.notes ?? '',
      ]),
    )
  }

  // 里程碑
  for (const ms of data.milestones) {
    const [d, tm] = startCells(ms.time)
    rows.push(makeRow(nameCol, 'milestone', [d, tm, '', '', bl(ms.type), '', '', '', ms.notes ?? '']))
  }

  return rows
}

/** 读取单个宝宝的全部记录（按时间排序） */
async function fetchBabyData(babyId: number): Promise<BabyCsvData> {
  if (!Number.isFinite(babyId) || babyId <= 0) {
    throw new Error('Invalid babyId for export')
  }
  const entries = await Promise.all(
    RECORD_TABLES.map(async (r) => {
      const query = db[r.name].where('babyId').equals(babyId).sortBy(r.timeField) as Promise<unknown[]>
      // milestones 表在 v4 新增 babyId 索引，若数据库版本过旧可能抛错，做兼容处理
      const list = r.name === 'milestones' ? await query.catch(() => []) : await query
      return [r.name, list] as const
    }),
  )
  return Object.fromEntries(entries) as unknown as BabyCsvData
}

/** 下载 CSV（带 BOM） */
function downloadCsv(rows: Row[], filename: string): void {
  downloadBlob('\ufeff' + toCsv(rows), filename, 'text/csv;charset=utf-8')
}

/** 导出单个宝宝 CSV（十类记录合并为单个文件，统一宽表结构） */
export async function exportBabyCsvs(baby: Baby): Promise<void> {
  if (baby.id === undefined || baby.id === null || !Number.isFinite(baby.id) || baby.id <= 0) {
    throw new Error('Invalid baby id for export')
  }
  const data = await fetchBabyData(baby.id)
  const rows: Row[] = [csvHeader(false), buildBabyInfoRow(baby), ...buildBabyCsvRows(data)]
  downloadCsv(rows, t('exportCsv.allFileName', { name: baby.name, stamp: formatDate(Date.now()) }))
}

/** 一键导出全部宝宝的全部记录为单个合并 CSV（首列标识宝宝名） */
export async function exportAllBabiesCsv(): Promise<void> {
  const babies = await db.babies.toArray()
  const rows: Row[] = [csvHeader(true)]
  for (const baby of babies) {
    // 宝宝信息行始终写入（即使该宝宝没有任何记录，导入后也不丢失资料）
    rows.push(buildBabyInfoRow(baby, true))
    const data = await fetchBabyData(baby.id!)
    rows.push(...buildBabyCsvRows(data, baby.name))
  }
  downloadCsv(rows, t('exportCsv.allBabiesFileName', { stamp: formatDate(Date.now()) }))
}
