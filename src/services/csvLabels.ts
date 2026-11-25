/**
 * CSV 标签与反查表（CSV 导出 / 导入共用）。
 *
 * 导出把内部键值转成本地化显示文本（bl），导入按 zh / en 双语标签反查回
 * 内部键值（toInternal），并兼容 Vue 旧版导出的别名。
 */
import i18n from '@/i18n'
import zhCN from '@/i18n/locales/zh-CN'
import enUS from '@/i18n/locales/en-US'

const t = (key: string, options?: Record<string, unknown>): string => String(i18n.t(key, options as never))

export const CSV_COLUMN_KEYS = [
  'recordType',
  'date',
  'time',
  'endDate',
  'endTime',
  'item',
  'value',
  'duration',
  'status',
  'notes',
] as const

/** 宝宝信息专用列（仅宝宝信息行有值，记录行留空） */
export const BABY_COLUMN_KEYS = ['avatar', 'avatarColor'] as const

/** 表头别名（导入用）：zh/en 两语言列名 + 内部键值，兼容任意语言导出的文件 */
export const HEADER_ALIASES: Record<string, string[]> = {
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
  avatar: [zhCN.exportCsv.avatar, enUS.exportCsv.avatar, 'avatar'],
  avatarColor: [zhCN.exportCsv.avatarColor, enUS.exportCsv.avatarColor, 'avatarColor'],
}

/** 按表头取单元格：当前 locale 列名 -> zh -> en -> 内部键值，未命中返回 '' */
export function headerCell(obj: Record<string, string>, key: string): string {
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
  brown: '棕色',
  green: '绿色',
  black: '黑色',
  red: '红色',
  other: '其他',
  // 纸尿裤量
  small: '少量',
  medium: '适中',
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
  forehead: '额温',
  rectal: '肛温',
  // 宝宝信息行
  baby: '宝宝',
  boy: '男孩',
  girl: '女孩',
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
  // 宝宝信息行
  baby: 'Baby',
  boy: 'Boy',
  girl: 'Girl',
}

/** 获取当前语言标签，未找到返回原键值 */
export function bl(key: string): string {
  const locale = i18n.language || 'zh-CN'
  const map = locale === 'en-US' ? LABELS_EN : LABELS_ZH
  return map[key] ?? key
}

/** 亲喂侧边标签（避免与 diaper 的 both 键冲突） */
const BREAST_SIDE_LABELS_MAP: Record<string, Record<string, string>> = {
  'zh-CN': { left: '左侧', right: '右侧', both: '双侧' },
  'en-US': { left: 'Left', right: 'Right', both: 'Both' },
}
export function breastSideLabel(side: string): string {
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

/** 旧版 React 导出的标签（Vue 端一直是棕色 / 适中 / 额温），导入旧文件时仍能反查 */
const LEGACY_LABEL_ALIASES: [string, string][] = [
  ['褐色', 'brown'],
  ['中等', 'medium'],
  ['额头', 'forehead'],
]
for (const [label, key] of LEGACY_LABEL_ALIASES) if (!LABEL_REV.has(label)) LABEL_REV.set(label, key)

export function toInternal(label: string): string {
  return LABEL_REV.get(label) ?? label
}

/** CSV 转义：含逗号/引号/换行时包裹引号 */
