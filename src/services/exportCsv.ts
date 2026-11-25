/**
 * CSV 导出：统一宽表格式（双语标签 + UTF-8 BOM），支持单宝宝与全部宝宝合并导出。
 * 实现与导入（importCsv.ts）共用 csvLabels.ts 的标签体系。
 */
import { db } from '@/db'
import i18n from '@/i18n'
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

const t = (key: string, options?: Record<string, unknown>): string => String(i18n.t(key, options as never))

export function csvEscape(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

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

/**
 * 生成单个宝宝的全部记录 CSV 数据行（不含表头）。
 * 列值使用当前 locale 的本地化标签；导入时经 zh/en 双语反查表还原为内部键值。
 * babyName 提供时每行首列插入宝宝名（用于多宝宝合并导出）。
 */
export function buildBabyCsvRows(data: BabyCsvData, babyName?: string): Row[] {
  const withBaby = babyName !== undefined
  const rows: Row[] = []
  const nameCol = (): Row => (withBaby ? [babyName] : [])

  // 喂养
  for (const f of data.feedings) {
    const typeLabel = f.type === 'breast' && f.side ? bl(f.type) + '·' + breastSideLabel(f.side) : bl(f.type)
    rows.push([
      ...nameCol(),
      bl('feeding'),
      formatDate(f.startTime),
      formatTime(f.startTime),
      f.endTime ? formatDate(f.endTime) : '',
      f.endTime ? formatTime(f.endTime) : '',
      typeLabel,
      f.amount ? `${f.amount} ml` : '',
      f.duration ? Math.round(f.duration / 60000) : '',
      '',
      f.notes ?? '',
    ])
  }

  // 纸尿裤
  for (const d of data.diapers) {
    rows.push([
      ...nameCol(),
      bl('diaper'),
      formatDate(d.time),
      formatTime(d.time),
      '',
      '',
      bl(d.type),
      [d.color ? bl(d.color) : '', d.amount ? bl(d.amount) : ''].filter(Boolean).join(' · '),
      '',
      '',
      d.notes ?? '',
    ])
  }

  // 吸奶
  for (const p of data.pumpings) {
    rows.push([
      ...nameCol(),
      bl('pumping'),
      formatDate(p.startTime),
      formatTime(p.startTime),
      p.endTime ? formatDate(p.endTime) : '',
      p.endTime ? formatTime(p.endTime) : '',
      breastSideLabel(p.side),
      p.amount ? `${p.amount} ml` : '',
      p.duration ? Math.round(p.duration / 60000) : '',
      '',
      p.notes ?? '',
    ])
  }

  // 睡眠
  for (const s of data.sleeps) {
    rows.push([
      ...nameCol(),
      bl('sleep'),
      formatDate(s.startTime),
      formatTime(s.startTime),
      formatDate(s.endTime ?? s.startTime),
      formatTime(s.endTime ?? s.startTime),
      bl('nap'),
      '',
      s.duration ?? Math.round(((s.endTime ?? s.startTime) - s.startTime) / 60000),
      '',
      s.notes ?? '',
    ])
  }

  // 成长记录
  for (const g of data.growths) {
    const parts: string[] = []
    if (g.weight != null) parts.push(`${g.weight} kg`)
    if (g.height != null) parts.push(`${g.height} cm`)
    if (g.headCircumference != null) parts.push(`${g.headCircumference} cm`)
    rows.push([
      ...nameCol(),
      bl('growth'),
      formatDate(g.date),
      '',
      '',
      '',
      '',
      parts.join(' · '),
      '',
      '',
      g.notes ?? '',
    ])
  }

  // 辅食
  for (const sf of data.solidFoods) {
    rows.push([
      ...nameCol(),
      bl('solidFood'),
      formatDate(sf.time),
      formatTime(sf.time),
      '',
      '',
      sf.food,
      sf.amount ?? '',
      '',
      '',
      sf.notes ?? '',
    ])
  }

  // 用药
  for (const m of data.medications) {
    rows.push([
      ...nameCol(),
      bl('medication'),
      formatDate(m.time),
      formatTime(m.time),
      '',
      '',
      m.name,
      m.dose ?? '',
      '',
      '',
      m.notes ?? '',
    ])
  }

  // 疫苗
  for (const v of data.vaccinations) {
    rows.push([
      ...nameCol(),
      bl('vaccination'),
      formatDate(v.date),
      '',
      '',
      '',
      v.name,
      v.dose ?? '',
      '',
      bl(v.status),
      v.notes ?? '',
    ])
  }

  // 体温
  for (const tmp of data.temperatures) {
    rows.push([
      ...nameCol(),
      bl('temperature'),
      formatDate(tmp.time),
      formatTime(tmp.time),
      '',
      '',
      tmp.method ? bl(tmp.method) : '',
      tmp.value != null && tmp.value !== 0 ? `${tmp.value} ℃` : '',
      '',
      '',
      tmp.notes ?? '',
    ])
  }

  // 里程碑
  for (const ms of data.milestones) {
    rows.push([
      ...nameCol(),
      bl('milestone'),
      formatDate(ms.time),
      formatTime(ms.time),
      '',
      '',
      bl(ms.type),
      '',
      '',
      '',
      ms.notes ?? '',
    ])
  }

  // 记录行末尾补两列宝宝信息占位（avatar / avatarColor 仅宝宝信息行有值）
  return rows.map((row) => [...row, '', ''])
}

/** 读取单个宝宝的全部记录（按时间排序） */
async function fetchBabyData(babyId: number): Promise<BabyCsvData> {
  if (!Number.isFinite(babyId) || babyId <= 0) {
    throw new Error('Invalid babyId for export')
  }
  const [
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
    db.feedings.where('babyId').equals(babyId).sortBy('startTime'),
    db.diapers.where('babyId').equals(babyId).sortBy('time'),
    db.pumpings.where('babyId').equals(babyId).sortBy('startTime'),
    db.sleeps.where('babyId').equals(babyId).sortBy('startTime'),
    db.growths.where('babyId').equals(babyId).sortBy('date'),
    db.solidFoods.where('babyId').equals(babyId).sortBy('time'),
    db.medications.where('babyId').equals(babyId).sortBy('time'),
    db.vaccinations.where('babyId').equals(babyId).sortBy('date'),
    db.temperatures.where('babyId').equals(babyId).sortBy('time'),
    // milestones 表在 v4 新增 babyId 索引，若数据库版本过旧可能抛错，做兼容处理
    db.milestones
      .where('babyId')
      .equals(babyId)
      .sortBy('time')
      .catch(() => []),
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

/** 导出单个宝宝 CSV（十类记录合并为单个文件，统一宽表结构） */
export async function exportBabyCsvs(baby: Baby): Promise<void> {
  if (baby.id === undefined || baby.id === null || !Number.isFinite(baby.id) || baby.id <= 0) {
    throw new Error('Invalid baby id for export')
  }
  const data = await fetchBabyData(baby.id)
  const rows: Row[] = [csvHeader(false), buildBabyInfoRow(baby), ...buildBabyCsvRows(data)]
  const stamp = formatDate(Date.now())
  downloadBlob('\ufeff' + toCsv(rows), t('exportCsv.allFileName', { name: baby.name, stamp }), 'text/csv;charset=utf-8')
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
  const stamp = formatDate(Date.now())
  downloadBlob('\ufeff' + toCsv(rows), t('exportCsv.allBabiesFileName', { stamp }), 'text/csv;charset=utf-8')
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

type Row = (string | number | undefined | null)[]

/** 解析 CSV 文本（支持 BOM、引号转义、字段内逗号/换行） */
