/**
 * CSV 导入：增量合并（不清空现有数据），按宝宝名匹配、记录按「宝宝 + 时间戳
 * （含附加区分字段）」去重，只补充缺失记录；兼容新旧格式与双语标签。
 */
import { db } from '@/db'
import { RECORD_TABLES, type RecordTableName } from '@/db/tables'
import { serviceT as t } from '@/i18n/service'
import type { Baby } from '@/types'
import { parseDate, startOfDay } from '@/utils/format'
import { AVATAR_COLORS } from '@/constants'
import { HEADER_ALIASES, headerCell, toInternal } from './csvLabels'


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

/** 导入用：记录种类 → 表名（复数）映射 */
const RECORD_TYPE_KEY_MAP: Record<string, string> = Object.fromEntries(RECORD_TABLES.map((r) => [r.kind, r.name]))

/** 宝宝信息行解析结果（导入用） */
interface BabyInfoMeta {
  name: string
  birthDate?: string
  gender?: 'boy' | 'girl'
  birthWeight?: number
  birthHeight?: number
  avatar?: string
  avatarColor?: string
}

/** 解析宝宝信息行（date=出生日期，item=姓名，value="x kg · y cm"，status=性别，头像两列） */
function parseBabyInfoRow(obj: Record<string, string>): BabyInfoMeta | null {
  const name = (headerCell(obj, 'item') || headerCell(obj, 'babyName')).trim()
  if (!name) return null
  const value = headerCell(obj, 'value')
  const weightMatch = value.match(/([\d.]+)\s*kg/)
  const heightMatch = value.match(/([\d.]+)\s*cm/)
  const genderRaw = toInternal(headerCell(obj, 'status'))
  const dateStr = headerCell(obj, 'date')
  return {
    name,
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : undefined,
    gender: genderRaw === 'boy' || genderRaw === 'girl' ? genderRaw : undefined,
    birthWeight: weightMatch ? parseFloat(weightMatch[1]) : undefined,
    birthHeight: heightMatch ? parseFloat(heightMatch[1]) : undefined,
    avatar: headerCell(obj, 'avatar') || undefined,
    avatarColor: headerCell(obj, 'avatarColor') || undefined,
  }
}

/** 解析 "date time" → 时间戳（date 为空返回 0） */
function parseDateTime(date: string, time: string): number {
  if (!date) return 0
  const d = parseDate(`${date} ${time || '00:00'}`)
  return d ?? new Date(`${date}T${time || '00:00'}`).getTime()
}

/** 兼容旧格式：breast_left 等下划线写法 */
const OLD_FEED_TYPE_MAP: Record<string, { type: string; side?: string }> = {
  breast_left: { type: 'breast', side: 'left' },
  breast_right: { type: 'breast', side: 'right' },
  breast_both: { type: 'breast', side: 'both' },
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

  const startTime = parseDateTime(dateStr, timeStr)
  const endTime = parseDateTime(endDateStr, endTimeStr)

  if (!startTime) return null

  const base = { babyId, createdAt: now, updatedAt: now }

  switch (kind) {
    case 'feedings': {
      // 兼容新旧格式：item 可能是 "breast·left" 或旧的 "breast_left" 等
      let feedType: string
      let feedSide: string | undefined
      if (item in OLD_FEED_TYPE_MAP) {
        const mapped = OLD_FEED_TYPE_MAP[item]
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
      // 结束时间缺失或不晚于开始时间时，优先用时长列还原真实结束时间（旧文件回退 1 小时）
      const durMin = duration ? parseInt(duration, 10) : 0
      let sleepEnd = endTime
      if (!sleepEnd || sleepEnd <= startTime) {
        sleepEnd = durMin > 0 ? startTime + durMin * 60000 : startTime + 60 * 60000
      }
      return {
        kind,
        data: {
          ...base,
          // 睡眠类型已统一为「小睡」：旧文件里的「夜间睡眠」也按小睡导入
          type: 'nap',
          startTime,
          endTime: sleepEnd,
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

/** 导入结果计数：per-table 为新增条数，skipped 为去重跳过条数 */
export type ImportCsvResult = { babies: number; skipped: number } & Record<RecordTableName, number>

/** 各表判定重复记录时的附加区分字段（与宝宝、时间字段共同构成去重键） */
const DEDUPE_EXTRA_FIELDS: Partial<Record<RecordTableName, string[]>> = {
  medications: ['name'],
  vaccinations: ['name', 'dose'],
  milestones: ['type'],
}

/** 记录去重键：宝宝 + 时间 + 附加区分字段 */
function recordDedupeKey(
  rec: Record<string, unknown>,
  timeField: string,
  extra: string[] | undefined,
): string {
  const parts = [String(rec.babyId), String(rec[timeField])]
  for (const field of extra ?? []) parts.push(String(rec[field] ?? ''))
  return parts.join('|')
}

/** 导入 CSV 备份（增量合并：不清空现有数据，按宝宝和时间戳去重，只补充缺失记录） */
export async function importAllCsv(file: File): Promise<ImportCsvResult> {
  const text = await file.text()
  const rows = parseCsv(text)
  if (rows.length < 2) throw new Error(t('exportCsv.invalidFile'))

  const headers = rows[0]
  const hasBabyNameCol = [t('exportCsv.babyName'), ...HEADER_ALIASES.babyName].includes(headers[0])

  const babiesMap = new Map<string, BabyInfoMeta & { id: number }>()
  const recordBuckets = Object.fromEntries(RECORD_TABLES.map((r) => [r.name, [] as unknown[]]))

  const now = Date.now()
  let mappedCount = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.every((c) => c === '')) continue

    // 宝宝信息行：合并进 babiesMap（先于记录行出现时即为目标宝宝）
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      obj[h] = row[idx] ?? ''
    })
    if (toInternal(headerCell(obj, 'recordType')) === 'baby') {
      const meta = parseBabyInfoRow(obj)
      if (meta) {
        let entry = babiesMap.get(meta.name)
        if (!entry) {
          entry = { name: meta.name, id: -(babiesMap.size + 1) }
          babiesMap.set(meta.name, entry)
        }
        if (meta.birthDate) entry.birthDate = meta.birthDate
        if (meta.gender) entry.gender = meta.gender
        if (meta.birthWeight != null) entry.birthWeight = meta.birthWeight
        if (meta.birthHeight != null) entry.birthHeight = meta.birthHeight
        if (meta.avatar) entry.avatar = meta.avatar
        if (meta.avatarColor) entry.avatarColor = meta.avatarColor
        mappedCount++
      }
      continue
    }

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

  let skipped = 0
  const perTableAdded = Object.fromEntries(
    RECORD_TABLES.map((r) => [r.name, 0]),
  ) as Record<RecordTableName, number>

  await db.transaction(
    'rw',
    [db.babies, ...RECORD_TABLES.map((r) => db[r.name])],
    async () => {
      // 宝宝按名字增量合并：已存在则复用（回填 CSV 提供而现有缺失的资料），不存在才新增
      const existingBabies = await db.babies.toArray()
      const existingByName = new Map(existingBabies.map((b) => [b.name, b]))
      for (const [, entry] of babyNames) {
        const existed = existingByName.get(entry.name)
        if (existed && existed.id != null) {
          const existedId = existed.id
          babyIdMap.set(entry.id, existedId)
          const updates: Partial<Baby> = {}
          if (entry.gender != null && existed.gender == null) updates.gender = entry.gender
          if (entry.birthDate && !existed.birthDate) updates.birthDate = entry.birthDate
          if (entry.birthWeight != null && existed.birthWeight == null)
            updates.birthWeight = entry.birthWeight
          if (entry.birthHeight != null && existed.birthHeight == null)
            updates.birthHeight = entry.birthHeight
          if (entry.avatar && !existed.avatar) updates.avatar = entry.avatar
          if (entry.avatarColor && !existed.avatarColor) updates.avatarColor = entry.avatarColor
          if (Object.keys(updates).length > 0) await db.babies.update(existedId, updates)
        } else {
          const realId = (await db.babies.add({
            name: entry.name,
            gender: entry.gender,
            birthDate: entry.birthDate,
            birthWeight: entry.birthWeight,
            birthHeight: entry.birthHeight,
            avatar: entry.avatar,
            avatarColor: entry.avatarColor ?? AVATAR_COLORS[0],
            createdAt: now,
          }))!
          babyIdMap.set(entry.id, realId)
        }
      }

      // 记录增量合并：按宝宝 + 时间戳（含附加区分字段）去重，只添加现有库没有的记录
      for (const r of RECORD_TABLES) {
        const records = recordBuckets[r.name]
        if (records.length === 0) continue
        const table = db[r.name] as unknown as {
          toArray: () => Promise<unknown[]>
          bulkAdd: (items: Record<string, unknown>[]) => Promise<unknown>
        }
        const existing = await table.toArray()
        const seen = new Set(
          existing.map((e) =>
            recordDedupeKey(e as Record<string, unknown>, r.timeField, DEDUPE_EXTRA_FIELDS[r.name]),
          ),
        )
        const fresh: Record<string, unknown>[] = []
        for (const raw of records) {
          const rec = raw as Record<string, unknown>
          const withRealId = {
            ...rec,
            babyId: babyIdMap.get(rec.babyId as number) ?? babyIdMap.values().next().value!,
          }
          const key = recordDedupeKey(withRealId, r.timeField, DEDUPE_EXTRA_FIELDS[r.name])
          if (seen.has(key)) {
            skipped++
            continue
          }
          seen.add(key)
          fresh.push(withRealId)
        }
        if (fresh.length === 0) continue
        await table.bulkAdd(fresh)
        perTableAdded[r.name] = fresh.length
      }
    },
  )

  return {
    babies: babyNames.length,
    skipped,
    ...perTableAdded,
  } as ImportCsvResult
}
