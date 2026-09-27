import { db, type BabySitterDB } from '@/db'
import i18n from '@/i18n'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'
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
import { downloadBlob, formatDate, formatTime, parseDate, startOfDay } from '@/utils/format'

const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never))

/** 表头别名（导入用）：zh/en 两语言列名 + 内部键值，兼容任意语言导出的文件 */
const HEADER_ALIASES: Record<string, string[]> = {
  babyName: [zhCN.exportCsv.babyName, enUS.exportCsv.babyName, 'babyName'],
  recordType: [zhCN.exportCsv.recordType, enUS.exportCsv.recordType, 'recordType'],
  date: [zhCN.exportCsv.date, enUS.exportCsv.date, 'date'],
  time: [zhCN.exportCsv.time, enUS.exportCsv.time, 'time'],
  endDate: [zhCN.exportCsv.endDate, enUS.exportCsv.endDate, 'endDate'],
  endTime: [zhCN.exportCsv.endTime, enUS.exportCsv.endTime, 'endTime'],
  item: [zhCN.exportCsv.item, enUS.exportCsv.item, 'item'],
  value: [zhCN.exportCsv.value, enUS.exportCsv.value, 'value'],
  duration: [zhCN.exportCsv.duration, enUS.exportCsv.duration, 'duration'],
  status: [zhCN.exportCsv.status, enUS.exportCsv.status, 'status'],
  notes: [zhCN.exportCsv.notes, enUS.exportCsv.notes, 'notes'],
}

/** 按表头取单元格：当前 locale 列名 -> zh -> en -> 内部键值，未命中返回 '' */
function headerCell(obj: Record<string, string>, key: string): string {
  for (const alias of [t(`exportCsv.${key}`), ...HEADER_ALIASES[key]]) {
    const v = obj[alias]
    if (v !== undefined) return v
  }
  return ''
}

/** 按语言的标签映射：内部键值 -> 对应语言的显示文本 */
const LABELS_ZH: Record<string, string> = {
  // 记录类型
  feeding: '喂养',
  diaper: '纸尿裤',
  pumping: '吸奶',
  sleep: '睡眠',
  growth: '成长记录',
  solidFood: '辅食',
  medication: '用药',
  vaccination: '疫苗',
  temperature: '体温',
  milestone: '里程碑',
  // 喂养类型
  breast: '亲喂',
  bottle_breastmilk: '瓶喂母乳',
  bottle_formula: '配方奶',
  // 纸尿裤类型
  wet: '尿湿',
  dirty: '便便',
  both: '尿+便',
  // 纸尿裤颜色
  yellow: '黄色',
  brown: '褐色',
  green: '绿色',
  black: '黑色',
  red: '红色',
  other: '其他',
  // 纸尿裤量
  small: '少量',
  medium: '中等',
  large: '大量',
  // 吸奶侧
  left: '左侧',
  right: '右侧',
  // 睡眠类型
  nap: '小睡',
  night: '夜间睡眠',
  // 疫苗状态
  planned: '待接种',
  done: '已接种',
  // 体温方式
  armpit: '腋下',
  ear: '耳温',
  forehead: '额头',
  rectal: '肛温',
}

const LABELS_EN: Record<string, string> = {
  // 记录类型
  feeding: 'Feeding',
  diaper: 'Diaper',
  pumping: 'Pumping',
  sleep: 'Sleep',
  growth: 'Growth record',
  solidFood: 'Solid food',
  medication: 'Medication',
  vaccination: 'Vaccination',
  temperature: 'Temperature',
  milestone: 'Milestone',
  // 喂养类型
  breast: 'Breastfeed',
  bottle_breastmilk: 'Bottle breastmilk',
  bottle_formula: 'Bottle formula',
  // 纸尿裤类型
  wet: 'Wet',
  dirty: 'Dirty',
  both: 'Both',
  // 纸尿裤颜色
  yellow: 'Yellow',
  brown: 'Brown',
  green: 'Green',
  black: 'Black',
  red: 'Red',
  other: 'Other',
  // 纸尿裤量
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  // 吸奶侧
  left: 'Left',
  right: 'Right',
  // 睡眠类型
  nap: 'Nap',
  night: 'Night sleep',
  // 疫苗状态
  planned: 'Planned',
  done: 'Done',
  // 体温方式
  armpit: 'Armpit',
  ear: 'Ear',
  forehead: 'Forehead',
  rectal: 'Rectal',
}

/** 获取当前语言标签，未找到返回原键值 */
function bl(key: string): string {
  const locale = i18n.language || 'zh-CN'
  const map = locale === 'en-US' ? LABELS_EN : LABELS_ZH
  return map[key] ?? key
}

/** 亲喂侧边标签（避免与 diaper 的 both 键冲突） */
const BREAST_SIDE_LABELS_MAP: Record<string, Record<string, string>> = {
  'zh-CN': { left: '左侧', right: '右侧', both: '双侧' },
  'en-US': { left: 'Left', right: 'Right', both: 'Both' },
}
function breastSideLabel(side: string): string {
  const locale = i18n.language || 'zh-CN'
  return BREAST_SIDE_LABELS_MAP[locale]?.[side] ?? side
}

/** 显示文本 -> 内部键值反查表（导入用：zh/en 标签、亲喂侧标签、内部键值自身） */
const LABEL_REV: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const k of Object.keys(LABELS_ZH)) m.set(k, k)
  for (const map of [LABELS_ZH, LABELS_EN]) {
    for (const [k, v] of Object.entries(map)) if (!m.has(v)) m.set(v, k)
  }
  for (const byLocale of Object.values(BREAST_SIDE_LABELS_MAP)) {
    for (const [k, v] of Object.entries(byLocale)) if (!m.has(v)) m.set(v, k)
  }
  return m
})()

function toInternal(label: string): string {
  return LABEL_REV.get(label) ?? label
}

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

/** CSV 表头（仅本地化展示） */
function csvHeader(withBaby: boolean): Row {
  const cols = [
    t('exportCsv.recordType'),
    t('exportCsv.date'),
    t('exportCsv.time'),
    t('exportCsv.endDate'),
    t('exportCsv.endTime'),
    t('exportCsv.item'),
    t('exportCsv.value'),
    t('exportCsv.duration'),
    t('exportCsv.status'),
    t('exportCsv.notes'),
  ]
  return withBaby ? [t('exportCsv.babyName'), ...cols] : cols
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
      bl(s.type),
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

  return rows
}

/** 读取单个宝宝的全部记录（按时间排序） */
async function fetchBabyData(babyId: number): Promise<BabyCsvData> {
  if (!Number.isFinite(babyId) || babyId <= 0) {
    throw new Error('Invalid babyId for export')
  }
  const [feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, vaccinations, temperatures, milestones] =
    await Promise.all([
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
      db.milestones.where('babyId').equals(babyId).sortBy('time').catch(() => []),
    ])
  return { feedings, diapers, pumpings, sleeps, growths, solidFoods, medications, vaccinations, temperatures, milestones }
}

/** 导出单个宝宝 CSV（十类记录合并为单个文件，统一宽表结构） */
export async function exportBabyCsvs(baby: Baby): Promise<void> {
  if (baby.id === undefined || baby.id === null || !Number.isFinite(baby.id) || baby.id <= 0) {
    throw new Error('Invalid baby id for export')
  }
  const data = await fetchBabyData(baby.id)
  const rows: Row[] = [csvHeader(false), ...buildBabyCsvRows(data)]
  const stamp = formatDate(Date.now())
  downloadBlob(
    '\ufeff' + toCsv(rows),
    t('exportCsv.allFileName', { name: baby.name, stamp }),
    'text/csv;charset=utf-8',
  )
}

/** 一键导出全部宝宝的全部记录为单个合并 CSV（首列标识宝宝名） */
export async function exportAllBabiesCsv(): Promise<void> {
  const babies = await db.babies.toArray()
  const rows: Row[] = [csvHeader(true)]
  for (const baby of babies) {
    const data = await fetchBabyData(baby.id!)
    rows.push(...buildBabyCsvRows(data, baby.name))
  }
  const stamp = formatDate(Date.now())
  downloadBlob(
    '\ufeff' + toCsv(rows),
    t('exportCsv.allBabiesFileName', { stamp }),
    'text/csv;charset=utf-8',
  )
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
export function parseCsv(text: string): string[][] {
  const content = text.replace(/^\ufeff/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < content.length) {
    const ch = content[i]
    const next = content[i + 1]

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(field)
        field = ''
      } else if (ch === '\n' || ch === '\r') {
        row.push(field)
        // 仅当行非空时才加入结果，避免末尾空行产生额外空行
        if (row.some((c) => c !== '')) {
          rows.push(row)
        }
        row = []
        field = ''
        if (ch === '\r' && next === '\n') i++
      } else {
        field += ch
      }
    }
    i++
  }
  // 处理最后一行（无末尾换行时）
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((c) => c !== '')) {
      rows.push(row)
    }
  }
  return rows
}

/** 导入用：CSV 表头键名（内部键值）与内部类型映射（复数，对应 recordBuckets 键） */
const RECORD_TYPE_KEY_MAP: Record<string, string> = {
  feeding: 'feedings',
  diaper: 'diapers',
  pumping: 'pumpings',
  sleep: 'sleeps',
  growth: 'growths',
  solidFood: 'solidFoods',
  medication: 'medications',
  vaccination: 'vaccinations',
  temperature: 'temperatures',
  milestone: 'milestones',
}

/** 将 CSV 行映射为具体记录对象（列值为本地化标签或内部键值，统一经 toInternal 反查） */
function mapCsvRowToRecord(
  row: string[],
  headers: string[],
  babyId: number,
  now: number,
): { kind: string; data: Record<string, unknown> } | null {
  const obj: Record<string, string> = {}
  headers.forEach((h, idx) => {
    obj[h] = row[idx] ?? ''
  })

  // 表头可能是当前 locale / zh / en 的列名或内部键值
  const typeLabel = headerCell(obj, 'recordType')
  const kind = RECORD_TYPE_KEY_MAP[toInternal(typeLabel)]
  if (!kind) return null

  const dateStr = headerCell(obj, 'date')
  const timeStr = headerCell(obj, 'time')
  const endDateStr = headerCell(obj, 'endDate')
  const endTimeStr = headerCell(obj, 'endTime')
  const item = headerCell(obj, 'item')
  const value = headerCell(obj, 'value')
  const duration = headerCell(obj, 'duration')
  const status = headerCell(obj, 'status')
  const notes = headerCell(obj, 'notes')

  const parseDateTime = (date: string, time: string): number => {
    if (!date) return 0
    const d = parseDate(`${date} ${time || '00:00'}`)
    return d ?? new Date(`${date}T${time || '00:00'}`).getTime()
  }

  const startTime = parseDateTime(dateStr, timeStr)
  const endTime = parseDateTime(endDateStr, endTimeStr)

  if (!startTime) return null

  const base = { babyId, createdAt: now, updatedAt: now }

  switch (kind) {
    case 'feedings': {
      // 兼容新旧格式：item 可能是 "breast·left" 或旧的 "breast_left" 等
      const OLD_TYPE_MAP: Record<string, { type: string; side?: string }> = {
        breast_left: { type: 'breast', side: 'left' },
        breast_right: { type: 'breast', side: 'right' },
        breast_both: { type: 'breast', side: 'both' },
      }
      let feedType: string
      let feedSide: string | undefined
      if (item in OLD_TYPE_MAP) {
        const mapped = OLD_TYPE_MAP[item]
        feedType = mapped.type
        feedSide = mapped.side
      } else if (item.includes('·')) {
        const [rawType, rawSide] = item.split('·').map((p) => p.trim())
        feedType = toInternal(rawType || item)
        feedSide = rawSide ? toInternal(rawSide) : undefined
      } else {
        feedType = toInternal(item)
        feedSide = undefined
      }
      return {
        kind,
        data: {
          ...base,
          type: feedType,
          side: feedSide,
          startTime,
          endTime: endTime || undefined,
          duration: duration ? parseInt(duration) * 60000 : undefined,
          amount: value ? parseFloat(value) : undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'diapers': {
      // value 格式：color · amount（导入时反查为内部键值）
      const parts = value.split('·').map((p) => p.trim())
      return {
        kind,
        data: {
          ...base,
          type: toInternal(item),
          time: startTime,
          color: parts[0] ? toInternal(parts[0]) : undefined,
          amount: parts[1] ? toInternal(parts[1]) : undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'pumpings': {
      return {
        kind,
        data: {
          ...base,
          side: toInternal(item),
          startTime,
          endTime: endTime || undefined,
          duration: duration ? parseInt(duration) * 60000 : undefined,
          amount: value ? parseFloat(value) : undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'sleeps': {
      return {
        kind,
        data: {
          ...base,
          type: toInternal(item),
          startTime,
          endTime: endTime || startTime + 60 * 60000,
          notes: notes || undefined,
        },
      }
    }
    case 'growths': {
      // value 格式："8.5 kg · 70.2 cm · 44 cm"（身高、头围按出现顺序）
      const weightMatch = value.match(/([\d.]+)\s*kg/)
      const cmMatches = [...value.matchAll(/([\d.]+)\s*cm/g)]
      return {
        kind,
        data: {
          ...base,
          date: startOfDay(startTime),
          weight: weightMatch ? parseFloat(weightMatch[1]) : undefined,
          height: cmMatches[0] ? parseFloat(cmMatches[0][1]) : undefined,
          headCircumference: cmMatches[1] ? parseFloat(cmMatches[1][1]) : undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'solidFoods': {
      return {
        kind,
        data: {
          ...base,
          time: startTime,
          food: item,
          amount: value || undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'medications': {
      return {
        kind,
        data: {
          ...base,
          time: startTime,
          name: item,
          dose: value || undefined,
          notes: notes || undefined,
        },
      }
    }
    case 'vaccinations': {
      return {
        kind,
        data: {
          ...base,
          date: startOfDay(startTime),
          name: item,
          dose: value || undefined,
          status: toInternal(status) === 'done' ? 'done' : 'planned',
          notes: notes || undefined,
        },
      }
    }
    case 'temperatures': {
      const tempMatch = value.match(/([\d.]+)\s*℃?/)
      return {
        kind,
        data: {
          ...base,
          time: startTime,
          method: item ? toInternal(item) : undefined,
          value: tempMatch ? parseFloat(tempMatch[1]) : 0,
          notes: notes || undefined,
        },
      }
    }
    case 'milestones': {
      return {
        kind,
        data: {
          ...base,
          type: toInternal(item),
          time: startTime,
          notes: notes || undefined,
        },
      }
    }
  }
  return null
}

/** 导入 CSV 备份（覆盖当前数据） */
export async function importAllCsv(
  file: File,
): Promise<{
  babies: number
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
  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error(t('exportCsv.invalidFile'))

  const headers = rows[0]
  const hasBabyNameCol = [t('exportCsv.babyName'), ...HEADER_ALIASES.babyName].includes(headers[0])

  const babiesMap = new Map<string, { name: string; id: number }>()
  const recordBuckets: Record<string, unknown[]> = {
    feedings: [],
    diapers: [],
    pumpings: [],
    sleeps: [],
    growths: [],
    solidFoods: [],
    medications: [],
    vaccinations: [],
    temperatures: [],
    milestones: [],
  }

  const now = Date.now()
  let mappedCount = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every((c) => c === '')) continue

    const babyName = hasBabyNameCol ? row[0] : ''
    let babyId: number

    if (babyName) {
      if (!babiesMap.has(babyName)) {
        const tempId = -(babiesMap.size + 1)
        babiesMap.set(babyName, { name: babyName, id: tempId })
      }
      babyId = babiesMap.get(babyName)!.id
    } else {
      if (babiesMap.size === 0) {
        const defaultBabyName = t('exportCsv.defaultBaby')
        babiesMap.set(defaultBabyName, { name: defaultBabyName, id: -1 })
      }
      babyId = babiesMap.values().next().value!.id
    }

    const mapped = mapCsvRowToRecord(row, headers, babyId, now)
    if (mapped) {
      recordBuckets[mapped.kind].push(mapped.data)
      mappedCount++
    }
  }

  // 一条记录都没识别出：不是本应用导出的文件，拒绝导入（避免清库后写入空数据）
  if (mappedCount === 0) throw new Error(t('exportCsv.invalidFile'))

  const babyIdMap = new Map<number, number>()
  const babyNames = Array.from(babiesMap.entries())
  if (babyNames.length === 0) throw new Error(t('exportCsv.noBaby'))

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

      for (const [, { name, id: tempId }] of babyNames) {
        const realId = (await db.babies.add({ name, avatarColor: '#FF6B6B', createdAt: now }))!
        babyIdMap.set(tempId, realId)
      }

      for (const [kind, records] of Object.entries(recordBuckets)) {
        if (records.length === 0) continue
        const withRealId = records.map((r) => ({
          ...(r as Record<string, unknown>),
          babyId: babyIdMap.get((r as Record<string, unknown>).babyId as number) ?? babyIdMap.values().next().value!,
        }))
        await (db[kind as keyof BabySitterDB] as { bulkAdd: (items: typeof withRealId) => Promise<unknown> }).bulkAdd(withRealId)
      }
    },
  )

  return {
    babies: babyNames.length,
    feedings: recordBuckets.feedings.length,
    diapers: recordBuckets.diapers.length,
    pumpings: recordBuckets.pumpings.length,
    sleeps: recordBuckets.sleeps.length,
    growths: recordBuckets.growths.length,
    solidFoods: recordBuckets.solidFoods.length,
    medications: recordBuckets.medications.length,
    vaccinations: recordBuckets.vaccinations.length,
    temperatures: recordBuckets.temperatures.length,
    milestones: recordBuckets.milestones.length,
  }
}