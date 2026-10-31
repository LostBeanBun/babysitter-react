import { describe, it, expect, vi, beforeEach } from 'vitest'
import { csvEscape, toCsv, buildBabyCsvRows, buildBabyInfoRow, exportBabyCsvs, exportAllBabiesCsv, parseCsv, importAllCsv, type BabyCsvData } from '@/services/export'
import type { Feeding, Baby } from '@/types'
import i18n from '@/i18n'

const { mockDb, downloadSpy } = vi.hoisted(() => {
  const makeTable = () => ({
    toArray: vi.fn<() => Promise<unknown[]>>(async () => []),
    where: vi.fn<(table: string) => { equals: (id: number) => { sortBy: (key: string) => Promise<unknown[]> } }>(() => ({
      equals: () => ({ sortBy: async () => [] }),
    })),
    clear: vi.fn<() => Promise<void>>(async () => {}),
    bulkAdd: vi.fn<(items: unknown[]) => Promise<void>>(async () => {}),
    add: vi.fn<(baby: { name: string }) => Promise<number>>(async () => 1),
    update: vi.fn<(id: number, patch: unknown) => Promise<void>>(async () => {}),
  })
  const mockDb = {
    babies: makeTable(),
    feedings: makeTable(),
    diapers: makeTable(),
    pumpings: makeTable(),
    sleeps: makeTable(),
    growths: makeTable(),
    solidFoods: makeTable(),
    medications: makeTable(),
    vaccinations: makeTable(),
    temperatures: makeTable(),
    milestones: makeTable(),
    transaction: vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<unknown>) => {
      return await callback()
    }),
  }
  const downloadSpy = vi.fn()
  return { mockDb, downloadSpy }
})

vi.mock('@/db', () => ({ db: mockDb, DB_VERSION: 4 }))
vi.mock('@/i18n', () => ({
  default: {
    t: (key: string) => key,
    language: 'zh-CN',
    changeLanguage: async () => {},
    on: () => {},
    off: () => {},
  },
}))
vi.mock('@/utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/format')>()
  return { ...actual, downloadBlob: downloadSpy }
})

function makeFeeding(partial: Partial<Feeding>): Feeding {
  return {
    babyId: 1,
    type: 'bottle_formula',
    startTime: new Date(2026, 0, 1, 8, 0).getTime(),
    amount: 120,
    createdAt: 0,
    updatedAt: 0,
    notes: '含逗号, 与"引号"',
    ...partial,
  }
}

function makeBaby(partial: Partial<Baby>): Baby {
  return {
    id: 1,
    name: '小糯米',
    gender: 'girl',
    birthDate: '2026-01-01',
    avatarColor: '#FFF',
    createdAt: 0,
    ...partial,
  }
}

/** 读取最后一次下载的内容（downloadBlob 第一参数为 string 或 Blob） */
async function lastDownloadText(): Promise<string> {
  const [content] = downloadSpy.mock.calls[0]
  return typeof content === 'string' ? content : await content.text()
}

describe('csvEscape', () => {
  it('普通值原样输出', () => {
    expect(csvEscape('abc')).toBe('abc')
    expect(csvEscape(120)).toBe('120')
  })
  it('null/undefined 输出空串', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
  })
  it('含逗号/引号/换行时包裹引号并转义', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('a"b')).toBe('"a""b"')
    expect(csvEscape('a\nb')).toBe('"a\nb"')
  })
})

describe('toCsv', () => {
  it('多行 CRLF 拼接', () => {
    const csv = toCsv([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(csv).toBe('a,b\r\nc,d')
  })
  it('混合类型与转义', () => {
    const csv = toCsv([
      [1, 'x,y'],
      [null, 'z'],
    ])
    expect(csv).toBe('1,"x,y"\r\n,z')
  })
})

describe('buildBabyCsvRows', () => {
  const data: BabyCsvData = {
    feedings: [makeFeeding({})],
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

  it('生成记录行并保留全部字段', () => {
    const rows = buildBabyCsvRows(data)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toHaveLength(12)
    // 数据行使用当前语言标签
    expect(row[0]).toBe('喂养')
    expect(row[1]).toBe('2026-01-01')
    expect(row[2]).toBe('08:00:00')
    expect(row[6]).toBe('120 ml')
    // 末尾为宝宝信息专用列占位
    expect(row[10]).toBe('')
    expect(row[11]).toBe('')
  })

  it('备注含逗号/引号时经 toCsv 正确转义', () => {
    const csv = toCsv([buildBabyCsvRows(data)[0]])
    expect(csv).toContain('"含逗号, 与""引号"""')
  })

  it('提供 babyName 时首列插入宝宝名', () => {
    const rows = buildBabyCsvRows(data, '小糯米')
    expect(rows[0][0]).toBe('小糯米')
    expect(rows[0]).toHaveLength(13)
    const anonymous = buildBabyCsvRows(data)
    expect(anonymous[0]).toHaveLength(12)
  })
})

describe('exportBabyCsvs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.feedings.where.mockReturnValue({
      equals: () => ({ sortBy: async () => [makeFeeding({})] }),
    })
  })

  it('按宝宝导出时查询该宝宝数据并下载 CSV', async () => {
    await exportBabyCsvs(makeBaby({ id: 7 }))
    expect(mockDb.feedings.where).toHaveBeenCalledWith('babyId')
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [, filename, type] = downloadSpy.mock.calls[0]
    expect(filename).toContain('exportCsv.allFileName')
    expect(type).toBe('text/csv;charset=utf-8')
    const text = await lastDownloadText()
    expect(text.startsWith('\ufeff')).toBe(true)
    // 表头使用本地化键
    expect(text).toContain('exportCsv.recordType')
    // 数据行使用当前语言标签
    expect(text).toContain('喂养')
    // 宝宝信息行随文件导出（含完整资料）
    expect(text).toContain('宝宝')
    expect(text).toContain('小糯米')
    expect(text).toContain('2026-01-01')
  })
})

describe('buildBabyInfoRow', () => {
  it('完整还原姓名/出生日期/性别/出生身高体重/头像', () => {
    const baby = makeBaby({
      name: '小糯米',
      gender: 'girl',
      birthDate: '2026-01-01',
      birthWeight: 3.2,
      birthHeight: 50,
      avatar: '👶',
      avatarColor: '#F2A28C',
    })
    const row = buildBabyInfoRow(baby)
    expect(row).toHaveLength(12)
    expect(row[0]).toBe('宝宝')
    expect(row[1]).toBe('2026-01-01')
    expect(row[5]).toBe('小糯米')
    expect(row[6]).toBe('3.2 kg · 50 cm')
    expect(row[8]).toBe('女孩')
    expect(row[10]).toBe('👶')
    expect(row[11]).toBe('#F2A28C')
  })

  it('多宝宝合并导出时首列插入宝宝名', () => {
    const row = buildBabyInfoRow(makeBaby({ name: '大宝' }), true)
    expect(row[0]).toBe('大宝')
    expect(row).toHaveLength(13)
  })

  it('资料缺失时对应列为空', () => {
    const row = buildBabyInfoRow({ name: '匿名', avatarColor: '#FFF', createdAt: 0 })
    expect(row[1]).toBe('')
    expect(row[6]).toBe('')
    expect(row[8]).toBe('')
    expect(row[10]).toBe('')
  })
})

describe('exportAllBabiesCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDb.babies.toArray.mockResolvedValue([
      makeBaby({ id: 1, name: '大宝' }),
      makeBaby({ id: 2, name: '二宝' }),
    ])
    mockDb.feedings.where.mockReturnValue({
      equals: () => ({
        sortBy: async () => [makeFeeding({ babyId: 1 }), makeFeeding({ babyId: 2 })],
      }),
    })
    mockDb.diapers.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.pumpings.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.sleeps.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.growths.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.solidFoods.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.medications.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.vaccinations.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.temperatures.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
    mockDb.milestones.where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
  })

  it('合并所有宝宝为单个 CSV，首列为宝宝名', async () => {
    await exportAllBabiesCsv()
    expect(mockDb.babies.toArray).toHaveBeenCalled()
    expect(downloadSpy).toHaveBeenCalledTimes(1)
    const [, filename, type] = downloadSpy.mock.calls[0]
    expect(filename).toContain('exportCsv.allBabiesFileName')
    expect(type).toBe('text/csv;charset=utf-8')
    const text = await lastDownloadText()
    // 表头含宝宝名列
    expect(text).toContain('exportCsv.babyName')
    // 两个宝宝的数据行各自带宝宝名
    expect(text).toContain('大宝')
    expect(text).toContain('二宝')
    const lines = text.split('\r\n')
    // 表头 + 2 个宝宝 × (1 条宝宝信息行 + 2 条喂养)
    expect(lines.length).toBe(7)
  })

  it('无宝宝时仅输出表头', async () => {
    mockDb.babies.toArray.mockResolvedValue([])
    await exportAllBabiesCsv()
    const text = await lastDownloadText()
    const lines = text.split('\r\n')
    expect(lines.length).toBe(1)
  })
})

describe('parseCsv', () => {
  it('解析简单 CSV', () => {
    const rows = parseCsv('a,b,c\r\n1,2,3')
    expect(rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
  })

  it('处理 BOM', () => {
    const rows = parseCsv('\ufeffa,b\r\n1,2')
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })

  it('处理引号转义', () => {
    const rows = parseCsv('a,b\r\n"hello, world","a""b"')
    expect(rows).toEqual([['a', 'b'], ['hello, world', 'a"b']])
  })

  it('处理字段内换行', () => {
    const rows = parseCsv('a,b\r\n"line1\nline2",c')
    expect(rows).toEqual([['a', 'b'], ['line1\nline2', 'c']])
  })

  it('处理 \\r\\n 和 \\n 混合', () => {
    const rows = parseCsv('a,b\n1,2\r\n3,4')
    expect(rows).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })

  it('跳过末尾空行', () => {
    const rows = parseCsv('a,b\n1,2\n\n')
    // 新行为：末尾空行被跳过，不产生额外空行
    expect(rows).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('importAllCsv', () => {
  beforeEach(() => {
    // 手动重置所需 mock，避免 clearAllMocks 影响 transaction 等共享 mock
    vi.clearAllMocks()
    // 为所有表配置空返回
    const tables = ['babies', 'feedings', 'diapers', 'pumpings', 'sleeps', 'growths', 'solidFoods', 'medications', 'vaccinations', 'temperatures', 'milestones'] as const
    for (const t of tables) {
      mockDb[t].where.mockReturnValue({ equals: () => ({ sortBy: async () => [] }) })
      mockDb[t].clear.mockResolvedValue(undefined)
      mockDb[t].bulkAdd.mockResolvedValue(undefined)
      // 每个用例重置 toArray，避免上一用例覆盖的实现残留
      mockDb[t].toArray = vi.fn(async () => [])
    }
    // babies 表额外需要 add 方法（用于导入时创建宝宝）
    mockDb.babies.add = vi.fn().mockImplementation(async (b) => b.id || 1)
    // transaction mock 会被 clearAllMocks 清除，需重新设置
    mockDb.transaction = vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<unknown>) => {
      return await callback()
    })
    // downloadSpy 也需要重置
    downloadSpy.mockClear()
  })

  it('仅表头无数据抛出错误', async () => {
    const csv = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const file = new File([csv], 'empty.csv', { type: 'text/csv' })
    await expect(importAllCsv(file)).rejects.toThrow('exportCsv.invalidFile')
  })

  it('导出→导入往返：喂养字段还原', async () => {
    // 构造与导出格式一致的 CSV（mock i18n 下 t 返回 key，标签用 zh 硬编码 + 内部键值双兼容）
    const headers = [
      'exportCsv.recordType',
      'exportCsv.date',
      'exportCsv.time',
      'exportCsv.endDate',
      'exportCsv.endTime',
      'exportCsv.item',
      'exportCsv.value',
      'exportCsv.duration',
      'exportCsv.status',
      'exportCsv.notes',
    ].join(',')
    // recordType 用内部键值 feeding；item 用内部键值 bottle_formula
    const row = ['feeding', '2026-01-01', '08:00', '', '', 'bottle_formula', '120 ml', '30', '', '备注1'].join(',')
    const csv = `${headers}\r\n${row}`
    const file = new File([csv], 'roundtrip.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(1)
    expect(mockDb.feedings.bulkAdd).toHaveBeenCalledTimes(1)
    const added = (mockDb.feedings.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(added.amount).toBe(120)
    expect(added.type).toBe('bottle_formula')
    expect(added.notes).toBe('备注1')
    expect(added.babyId).toBe(1)
  })

  it('喂养 breast·left 与旧格式 breast_both 均可解析', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['feeding', '2026-01-01', '08:00', '', '', 'breast·left', '', '', '', ''].join(','),
      ['feeding', '2026-01-01', '09:00', '', '', 'breast_both', '', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'feed.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(2)
    const calls = (mockDb.feedings.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calls[0].type).toBe('breast')
    expect(calls[0].side).toBe('left')
    expect(calls[1].type).toBe('breast')
    expect(calls[1].side).toBe('both')
  })

  it('成长记录解析 weight/height/头围', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['growth', '2026-01-01', '', '', '', '', '8.5 kg · 70.2 cm · 44 cm', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'growth.csv', { type: 'text/csv' })
    await importAllCsv(file)
    const added = (mockDb.growths.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(added.weight).toBe(8.5)
    expect(added.height).toBe(70.2)
    expect(added.headCircumference).toBe(44)
  })

  it('疫苗状态中英与内部键值均可解析', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['vaccination', '2026-01-01', '', '', '', '乙肝疫苗', '第 1 剂', '', '已接种', ''].join(','),
      ['vaccination', '2026-01-02', '', '', '', '百白破', '', '', 'Planned', ''].join(','),
      ['vaccination', '2026-01-03', '', '', '', '脊灰', '', '', '未知', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'vac.csv', { type: 'text/csv' })
    await importAllCsv(file)
    const calls = (mockDb.vaccinations.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(calls[0].status).toBe('done')
    expect(calls[1].status).toBe('planned')
    expect(calls[2].status).toBe('planned') // 未知 → planned
  })

  it('英文表头 Baby 识别宝宝名列', async () => {
    const headers = [
      'Baby',
      'exportCsv.recordType',
      'exportCsv.date',
      'exportCsv.time',
      'exportCsv.endDate',
      'exportCsv.endTime',
      'exportCsv.item',
      'exportCsv.value',
      'exportCsv.duration',
      'exportCsv.status',
      'exportCsv.notes',
    ].join(',')
    const csv = [
      headers,
      ['小明', 'feeding', '2026-01-01', '08:00', '', '', 'bottle_formula', '100 ml', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'en.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.babies).toBe(1)
    expect(mockDb.babies.add).toHaveBeenCalledWith(expect.objectContaining({ name: '小明' }))
    expect(result.feedings).toBe(1)
  })

  it('中文表头「宝宝」识别宝宝名列（跨语言导出头）', async () => {
    const headers = [
      '宝宝',
      'exportCsv.recordType',
      'exportCsv.date',
      'exportCsv.time',
      'exportCsv.endDate',
      'exportCsv.endTime',
      'exportCsv.item',
      'exportCsv.value',
      'exportCsv.duration',
      'exportCsv.status',
      'exportCsv.notes',
    ].join(',')
    const csv = [
      headers,
      ['糯米', 'feeding', '2026-01-01', '08:00', '', '', 'bottle_formula', '100 ml', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'zh.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.babies).toBe(1)
    expect(mockDb.babies.add).toHaveBeenCalledWith(expect.objectContaining({ name: '糯米' }))
  })

  it('未知记录类型行被跳过、不中断导入', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['not_a_type', '2026-01-01', '08:00', '', '', 'x', '', '', '', ''].join(','),
      ['feeding', '2026-01-01', '08:00', '', '', 'bottle_formula', '120 ml', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'mixed.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(1)
  })

  it('date/time 为空的行被丢弃', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['feeding', '', '', '', '', 'bottle_formula', '120 ml', '', '', ''].join(','),
      ['feeding', '2026-01-01', '08:00', '', '', 'bottle_formula', '100 ml', '', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'nodate.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(1)
  })

  it('睡眠 duration 按分钟导出后回导（单位正确）', async () => {
    const headers = 'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    // 2 小时睡眠 → 导出分钟数 120
    const csv = [
      headers,
      ['sleep', '2026-01-01', '20:00', '2026-01-01', '22:00', 'nap', '', '120', '', ''].join(','),
    ].join('\r\n')
    const file = new File([csv], 'sleep.csv', { type: 'text/csv' })
    await importAllCsv(file)
    const added = (mockDb.sleeps.bulkAdd as ReturnType<typeof vi.fn>).mock.calls[0][0][0]
    expect(added.endTime - added.startTime).toBe(2 * 3600_000)
  })

  it('旧文件里的「夜间睡眠」/night 导入后统一为小睡', async () => {
    const headers =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes'
    const csv = [
      headers,
      ['sleep', '2026-01-01', '20:00', '2026-01-01', '22:00', '夜间睡眠', '', '120', '', ''].join(','),
      ['sleep', '2026-01-01', '23:00', '2026-01-02', '01:00', 'night', '', '120', '', ''].join(','),
    ].join('\r\n')
    const result = await importAllCsv(new File([csv], 'sleep-night.csv', { type: 'text/csv' }))
    expect(result.sleeps).toBe(2)
    const calls = (mockDb.sleeps.bulkAdd as ReturnType<typeof vi.fn>).mock.calls as Array<
      [Array<{ type: string }>]
    >
    const rows = calls.flatMap(([r]) => r)
    expect(rows.map((r) => r.type)).toEqual(['nap', 'nap'])
  })

  it('时间列带秒（HH:mm:ss）时保留到秒', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,08:30:15,,,breast,,,,'
    const file = new File([csv], 'seconds.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(1)
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0]
    const [first] = items as Array<{ startTime: number }>
    const d = new Date(first.startTime)
    expect(d.getHours()).toBe(8)
    expect(d.getMinutes()).toBe(30)
    expect(d.getSeconds()).toBe(15)
  })

  it('时间列不带秒（HH:mm）时兼容旧文件', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,08:30,,,breast,,,,'
    const file = new File([csv], 'legacy.csv', { type: 'text/csv' })
    const result = await importAllCsv(file)
    expect(result.feedings).toBe(1)
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0]
    const [first] = items as Array<{ startTime: number }>
    const d = new Date(first.startTime)
    expect(d.getHours()).toBe(8)
    expect(d.getMinutes()).toBe(30)
    expect(d.getSeconds()).toBe(0)
  })

  it('完整往返：本地化标签反查为内部键值（zh-CN，全记录类型）', async () => {
    const t0 = new Date(2026, 0, 1, 8, 30, 15).getTime()
    const data: BabyCsvData = {
      feedings: [
        makeFeeding({ type: 'breast', side: 'left', amount: undefined, duration: 600000, startTime: t0 }),
        makeFeeding({
          type: 'bottle_breastmilk',
          amount: 150,
          startTime: new Date(2026, 0, 1, 9, 0, 5).getTime(),
          endTime: new Date(2026, 0, 1, 9, 20, 30).getTime(),
        }),
      ],
      diapers: [{ babyId: 1, type: 'both', color: 'yellow', amount: 'small', time: t0, createdAt: 0, updatedAt: 0 }],
      pumpings: [
        {
          babyId: 1,
          side: 'both',
          amount: 120,
          duration: 900000,
          startTime: t0,
          endTime: t0 + 900000,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
      sleeps: [{ babyId: 1, type: 'nap', startTime: t0, endTime: t0 + 3600000, createdAt: 0, updatedAt: 0 }],
      growths: [{ babyId: 1, date: t0, weight: 8.5, height: 70.2, headCircumference: 44, createdAt: 0, updatedAt: 0 }],
      solidFoods: [{ babyId: 1, time: t0, food: '南瓜泥', amount: '半碗', createdAt: 0, updatedAt: 0 }],
      medications: [{ babyId: 1, time: t0, name: '维生素D', dose: '1滴', createdAt: 0, updatedAt: 0 }],
      vaccinations: [{ babyId: 1, name: 'BCG', date: t0, status: 'done', createdAt: 0, updatedAt: 0 }],
      temperatures: [{ babyId: 1, time: t0, value: 36.8, method: 'armpit', createdAt: 0, updatedAt: 0 }],
      milestones: [{ babyId: 1, type: 'roll', time: t0, createdAt: 0, updatedAt: 0 }],
    }
    const csv =
      'exportCsv.babyName,exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\r\n' +
      toCsv(buildBabyCsvRows(data, '小满'))
    const result = await importAllCsv(new File([csv], 'roundtrip.csv', { type: 'text/csv' }))
    expect(result).toEqual({
      babies: 1,
      skipped: 0,
      feedings: 2,
      diapers: 1,
      pumpings: 1,
      sleeps: 1,
      growths: 1,
      solidFoods: 1,
      medications: 1,
      vaccinations: 1,
      temperatures: 1,
      milestones: 1,
    })

    const [feedItems] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(feedItems[0]).toMatchObject({ type: 'breast', side: 'left', duration: 600000, babyId: 1 })
    expect(feedItems[0].amount).toBeUndefined()
    expect(feedItems[0].startTime).toBe(t0)
    expect(feedItems[1]).toMatchObject({ type: 'bottle_breastmilk', amount: 150 })
    expect(feedItems[1].endTime).toBe(new Date(2026, 0, 1, 9, 20, 30).getTime())
    expect(feedItems[0].endTime).toBeUndefined()

    const [diaperItems] = mockDb.diapers.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(diaperItems[0]).toMatchObject({ type: 'both', color: 'yellow', amount: 'small', time: t0 })

    const [pumpItems] = mockDb.pumpings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(pumpItems[0]).toMatchObject({ side: 'both', amount: 120, duration: 900000, startTime: t0 })
    expect(pumpItems[0].endTime).toBe(t0 + 900000)

    const [sleepItems] = mockDb.sleeps.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(sleepItems[0]).toMatchObject({ type: 'nap', startTime: t0, endTime: t0 + 3600000 })

    const [growthItems] = mockDb.growths.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(growthItems[0]).toMatchObject({
      date: new Date(2026, 0, 1).getTime(),
      weight: 8.5,
      height: 70.2,
      headCircumference: 44,
    })

    const [sfItems] = mockDb.solidFoods.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(sfItems[0]).toMatchObject({ food: '南瓜泥', amount: '半碗', time: t0 })

    const [medItems] = mockDb.medications.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(medItems[0]).toMatchObject({ name: '维生素D', dose: '1滴', time: t0 })

    const [vacItems] = mockDb.vaccinations.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(vacItems[0]).toMatchObject({ name: 'BCG', status: 'done', date: new Date(2026, 0, 1).getTime() })

    const [tempItems] = mockDb.temperatures.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(tempItems[0]).toMatchObject({ value: 36.8, method: 'armpit', time: t0 })

    const [msItems] = mockDb.milestones.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(msItems[0]).toMatchObject({ type: 'roll', time: t0 })
  })

  it('英文标签同样反查为内部键值（en-US locale）', async () => {
    i18n.language = 'en-US'
    try {
      const t0 = new Date(2026, 0, 1, 7, 5, 9).getTime()
      const data: BabyCsvData = {
        feedings: [makeFeeding({ type: 'breast', side: 'both', amount: undefined, duration: undefined, startTime: t0 })],
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
      const csv =
        'exportCsv.babyName,exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\r\n' +
        toCsv(buildBabyCsvRows(data, 'Baby A'))
      const result = await importAllCsv(new File([csv], 'en.csv', { type: 'text/csv' }))
      expect(result).toMatchObject({ babies: 1, feedings: 1 })
      const [items] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
      expect(items[0]).toMatchObject({ type: 'breast', side: 'both', startTime: t0, babyId: 1 })
    } finally {
      i18n.language = 'zh-CN'
    }
  })

  it('中文真实表头可导入（别名回退，不依赖当前 locale）', async () => {
    const csv =
      '宝宝,记录类型,日期,时间,结束日期,结束时间,类型 / 名称,数值,时长(分钟),状态,备注\r\n' +
      '小满,喂养,2026-01-01,08:30:15,,,亲喂,,,,'
    const result = await importAllCsv(new File([csv], 'zh-headers.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 1 })
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(items[0]).toMatchObject({ type: 'breast', babyId: 1 })
    const d = new Date(items[0].startTime as number)
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([8, 30, 15])
    const [babyItems] = mockDb.babies.add.mock.calls
    expect(babyItems[0].name).toBe('小满')
  })

  it('英文真实表头可导入（大小写变体 + 宝宝名列）', async () => {
    const csv =
      'Baby,Record type,Date,Time,End date,End time,Type / Name,Value,Duration (min),Status,Notes\r\n' +
      'Baby A,Feeding,2026-01-01,08:30:15,,,Breastfeed,,,,'
    const result = await importAllCsv(new File([csv], 'en-headers.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 1 })
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(items[0]).toMatchObject({ type: 'breast', babyId: 1 })
    const d = new Date(items[0].startTime as number)
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([8, 30, 15])
    const [babyItems] = mockDb.babies.add.mock.calls
    expect(babyItems[0].name).toBe('Baby A')
  })

  it('非本应用 CSV（无记录类型行）拒绝导入，不触发清库', async () => {
    const csv = 'a,b,c\r\n1,2,3\r\n4,5,6'
    const file = new File([csv], 'foreign.csv', { type: 'text/csv' })
    await expect(importAllCsv(file)).rejects.toThrow('exportCsv.invalidFile')
    expect(mockDb.feedings.clear).not.toHaveBeenCalled()
    expect(mockDb.babies.add).not.toHaveBeenCalled()
  })

  it('增量导入：不清空现有数据，按宝宝+时间戳去重只补缺失记录', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,08:30,,,bottle_formula,120,,,\n' +
      'feeding,2026-01-01,09:00,,,bottle_formula,150,,,'

    // 已有 08:30 的同一条记录（重复），09:00 缺失
    mockDb.feedings.toArray = vi.fn(async () => [
      {
        babyId: 1,
        type: 'bottle_formula',
        startTime: new Date(2026, 0, 1, 8, 30).getTime(),
        amount: 120,
        createdAt: 0,
        updatedAt: 0,
      },
    ])
    const result = await importAllCsv(
      new File([csv], 'incremental.csv', { type: 'text/csv' }),
    )
    expect(result.feedings).toBe(1)
    expect(result.skipped).toBe(1)
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(items).toHaveLength(1)
    expect(items[0].startTime).toBe(new Date(2026, 0, 1, 9, 0).getTime())
    // 不再清空现有数据
    expect(mockDb.feedings.clear).not.toHaveBeenCalled()
    expect(mockDb.babies.clear).not.toHaveBeenCalled()
  })

  it('重复导入同一文件：全部跳过，不写入任何记录', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,09:30,,,bottle_formula,120,,,\n' +
      'feeding,2026-01-01,10:00,,,bottle_formula,100,,,'

    mockDb.feedings.toArray = vi.fn(async () => [
      { babyId: 1, startTime: new Date(2026, 0, 1, 9, 30).getTime(), createdAt: 0, updatedAt: 0 },
      { babyId: 1, startTime: new Date(2026, 0, 1, 10, 0).getTime(), createdAt: 0, updatedAt: 0 },
    ])
    const result = await importAllCsv(new File([csv], 'reimport.csv', { type: 'text/csv' }))
    expect(result.feedings).toBe(0)
    expect(result.skipped).toBe(2)
    expect(mockDb.feedings.bulkAdd).not.toHaveBeenCalled()
  })

  it('宝宝按名字增量合并：已存在复用现有 id，不重复添加宝宝', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,08:30,,,bottle_formula,120,,'

    mockDb.babies.toArray = vi.fn(async () => [
      { id: 7, name: 'exportCsv.defaultBaby', createdAt: 0 },
    ])
    await importAllCsv(new File([csv], 'reuse-baby.csv', { type: 'text/csv' }))
    expect(mockDb.babies.add).not.toHaveBeenCalled()
    const [items] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(items[0].babyId).toBe(7)
  })

  it('同时间戳但不同内容的用药/疫苗都保留（按名称等附加字段区分）', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'medication,2026-01-01,09:00,,,维生素D,1滴,,,\n' +
      'vaccination,2026-01-01,09:00,,,BCG,第1剂,,,'

    const t9 = new Date(2026, 0, 1, 9, 0).getTime()
    const dayStart = new Date(2026, 0, 1, 0, 0).getTime()
    mockDb.medications.toArray = vi.fn(async () => [
      { babyId: 1, time: t9, name: '维生素D', dose: '1滴', createdAt: 0, updatedAt: 0 },
    ])
    mockDb.vaccinations.toArray = vi.fn(async () => [
      { babyId: 1, date: dayStart, name: 'BCG', dose: '第1剂', createdAt: 0, updatedAt: 0 },
    ])
    const result = await importAllCsv(new File([csv], 'dedupe-named.csv', { type: 'text/csv' }))
    expect(result.medications).toBe(0)
    expect(result.vaccinations).toBe(0)
    expect(result.skipped).toBe(2)
  })

  const HEADER_13 =
    'exportCsv.babyName,exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes,exportCsv.avatar,exportCsv.avatarColor'
  const HEADER_12 =
    'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes,exportCsv.avatar,exportCsv.avatarColor'

  it('宝宝信息行完整还原：姓名/性别/出生日期/出生身高体重/头像/头像色', async () => {
    const baby = makeBaby({
      name: '小糯米',
      gender: 'girl',
      birthDate: '2026-01-01',
      birthWeight: 3.2,
      birthHeight: 50,
      avatar: '👶',
      avatarColor: '#F2A28C',
    })
    const csv =
      `${HEADER_13}\r\n` +
      `${toCsv([buildBabyInfoRow(baby, true)])}\r\n` +
      toCsv([buildBabyCsvRows({ ...emptyData(), feedings: [makeFeeding({})] }, '小糯米')[0]])
    const result = await importAllCsv(new File([csv], 'baby-meta.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 1 })
    const [added] = mockDb.babies.add.mock.calls as Array<[Record<string, unknown>]>
    expect(added[0]).toMatchObject({
      name: '小糯米',
      gender: 'girl',
      birthDate: '2026-01-01',
      birthWeight: 3.2,
      birthHeight: 50,
      avatar: '👶',
      avatarColor: '#F2A28C',
    })
    // 记录挂到还原出的真实宝宝 id
    const [feedItems] = mockDb.feedings.bulkAdd.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(feedItems[0].babyId).toBe(1)
  })

  it('单宝宝文件（无宝宝名列）也能还原宝宝资料，不再落为默认宝宝', async () => {
    const baby = makeBaby({ name: '小糯米', gender: 'boy', birthDate: '2026-02-02', avatarColor: '#8FB9D8' })
    const csv =
      `${HEADER_12}\r\n` +
      `${toCsv([buildBabyInfoRow(baby)])}\r\n` +
      toCsv([buildBabyCsvRows({ ...emptyData(), feedings: [makeFeeding({})] })[0]])
    const result = await importAllCsv(new File([csv], 'single.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 1 })
    const [added] = mockDb.babies.add.mock.calls as Array<[Record<string, unknown>]>
    expect(added[0]).toMatchObject({ name: '小糯米', gender: 'boy', birthDate: '2026-02-02' })
  })

  it('无任何记录的宝宝仅凭信息行也能导入', async () => {
    const baby = makeBaby({ name: '独苗', avatarColor: '#8FBF9F' })
    const csv = `${HEADER_12}\r\n${toCsv([buildBabyInfoRow(baby)])}`
    const result = await importAllCsv(new File([csv], 'lonely.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 0 })
    const [added] = mockDb.babies.add.mock.calls as Array<[Record<string, unknown>]>
    expect(added[0].name).toBe('独苗')
  })

  it('旧版文件（无宝宝信息行/新增列）仍可导入', async () => {
    const csv =
      'exportCsv.recordType,exportCsv.date,exportCsv.time,exportCsv.endDate,exportCsv.endTime,exportCsv.item,exportCsv.value,exportCsv.duration,exportCsv.status,exportCsv.notes\n' +
      'feeding,2026-01-01,08:30,,,breast,120 ml,,,,'
    const result = await importAllCsv(new File([csv], 'legacy.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ babies: 1, feedings: 1 })
    const [added] = mockDb.babies.add.mock.calls as Array<[Record<string, unknown>]>
    expect(added[0].name).toBe('exportCsv.defaultBaby')
  })

  it('已存在的宝宝按信息行回填缺失资料（不覆盖已有值）', async () => {
    const csv =
      `${HEADER_12}\r\n` +
      'baby,2026-01-01,,,,"小糯米",3.2 kg · 50 cm,,女孩,,👶,#F2A28C'
    mockDb.babies.toArray = vi.fn(async () => [
      { id: 7, name: '小糯米', gender: 'girl', avatarColor: '#000', createdAt: 0 },
    ])
    await importAllCsv(new File([csv], 'fill.csv', { type: 'text/csv' }))
    expect(mockDb.babies.add).not.toHaveBeenCalled()
    const [id, patch] = mockDb.babies.update.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(7)
    expect(patch).toMatchObject({ birthDate: '2026-01-01', birthWeight: 3.2, birthHeight: 50, avatar: '👶' })
    // 已有性别 / 头像色不被覆盖
    expect(patch.gender).toBeUndefined()
    expect(patch.avatarColor).toBeUndefined()
  })

  it('Vue 导出的标签（棕色 / 适中 / 额温）可导入，旧 React 标签也兼容', async () => {
    const csv =
      `${HEADER_12}\r\n` +
      'diaper,2026-01-01,08:00:00,,,尿+便,棕色 · 适中,,,,\r\n' +
      'diaper,2026-01-01,09:00:00,,,尿+便,褐色 · 中等,,,,\r\n' +
      'temperature,2026-01-01,10:00:00,,,额温,36.8 ℃,,,,\r\n' +
      'temperature,2026-01-01,11:00:00,,,额头,36.9 ℃,,,,'
    const result = await importAllCsv(new File([csv], 'labels.csv', { type: 'text/csv' }))
    expect(result).toMatchObject({ diapers: 2, temperatures: 2 })
    const diapers = (mockDb.diapers.bulkAdd.mock.calls as Array<[Array<Record<string, unknown>>]>).flatMap(
      ([r]) => r,
    )
    expect(diapers.map((d) => [d.color, d.amount])).toEqual([
      ['brown', 'medium'],
      ['brown', 'medium'],
    ])
    const temps = (mockDb.temperatures.bulkAdd.mock.calls as Array<[Array<Record<string, unknown>>]>).flatMap(
      ([r]) => r,
    )
    expect(temps.map((x) => x.method)).toEqual(['forehead', 'forehead'])
  })
})

function emptyData(): BabyCsvData {
  return {
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
}