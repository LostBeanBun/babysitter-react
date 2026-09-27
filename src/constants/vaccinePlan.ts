/**
 * 疫苗计划库（0-6 岁）。
 * months 为建议接种月龄（0 表示出生时）；实际接种日期由宝宝出生日期推算。
 * 免费 = 国家免疫规划疫苗；自费 = 常见自费（二类）疫苗。
 */
export interface VaccinePlanItem {
  /** 疫苗名称 */
  name: string
  /** 剂次说明（如「第 1 剂」） */
  dose: string
  /** 建议接种月龄 */
  months: number
  /** 备注（可选） */
  note?: string
}

export type VaccinePlanCategory = 'free' | 'self'

/** 免费疫苗：国家免疫规划疫苗 */
export const VACCINE_PLAN: VaccinePlanItem[] = [
  { name: '乙肝疫苗', dose: '第 1 剂', months: 0, note: '出生时 24 小时内' },
  { name: '卡介苗', dose: '第 1 剂', months: 0, note: '出生时' },
  { name: '乙肝疫苗', dose: '第 2 剂', months: 1 },
  { name: '脊灰灭活疫苗（IPV）', dose: '第 1 剂', months: 2 },
  { name: '百白破疫苗', dose: '第 1 剂', months: 3 },
  { name: '脊灰灭活疫苗（IPV）', dose: '第 2 剂', months: 3 },
  { name: '百白破疫苗', dose: '第 2 剂', months: 4 },
  { name: '脊灰减毒活疫苗（bOPV）', dose: '第 3 剂', months: 4 },
  { name: '百白破疫苗', dose: '第 3 剂', months: 5 },
  { name: '流脑 A 群多糖疫苗', dose: '第 1 剂', months: 6 },
  { name: '乙肝疫苗', dose: '第 3 剂', months: 6 },
  { name: '乙脑减毒活疫苗', dose: '第 1 剂', months: 8 },
  { name: '麻腮风疫苗', dose: '第 1 剂', months: 8 },
  { name: '流脑 A 群多糖疫苗', dose: '第 2 剂', months: 9 },
  { name: '百白破疫苗', dose: '第 4 剂', months: 18 },
  { name: '麻腮风疫苗', dose: '第 2 剂', months: 18 },
  { name: '甲肝灭活疫苗', dose: '第 1 剂', months: 18 },
  { name: '甲肝灭活疫苗', dose: '第 2 剂', months: 24 },
  { name: '流脑 A+C 多糖疫苗', dose: '第 1 剂', months: 36 },
  { name: '白破疫苗', dose: '第 1 剂', months: 72 },
  { name: '流脑 A+C 多糖疫苗', dose: '第 2 剂', months: 72 },
]

/** 自费疫苗：常见二类疫苗（给宝宝的），可替代部分免费疫苗或补足保护 */
export const SELF_PAID_VACCINE_PLAN: VaccinePlanItem[] = [
  { name: '五联疫苗（百白破·脊灰·Hib）', dose: '第 1 剂', months: 2, note: '可替代百白破、脊灰、Hib 单独接种' },
  { name: '五联疫苗（百白破·脊灰·Hib）', dose: '第 2 剂', months: 3 },
  { name: '五联疫苗（百白破·脊灰·Hib）', dose: '第 3 剂', months: 4 },
  { name: '五联疫苗（百白破·脊灰·Hib）', dose: '第 4 剂', months: 18, note: '加强剂' },
  { name: '13 价肺炎球菌结合疫苗', dose: '第 1 剂', months: 2 },
  { name: '13 价肺炎球菌结合疫苗', dose: '第 2 剂', months: 4 },
  { name: '13 价肺炎球菌结合疫苗', dose: '第 3 剂', months: 6 },
  { name: '13 价肺炎球菌结合疫苗', dose: '第 4 剂', months: 12, note: '12-15 月龄加强' },
  { name: '五价轮状病毒疫苗', dose: '第 1 剂', months: 2, note: '口服，6 周龄起，每剂间隔 4-10 周' },
  { name: '五价轮状病毒疫苗', dose: '第 2 剂', months: 4 },
  { name: '五价轮状病毒疫苗', dose: '第 3 剂', months: 6 },
  { name: 'b 型流感嗜血杆菌（Hib）疫苗', dose: '第 1 剂', months: 2 },
  { name: 'b 型流感嗜血杆菌（Hib）疫苗', dose: '第 2 剂', months: 3 },
  { name: 'b 型流感嗜血杆菌（Hib）疫苗', dose: '第 3 剂', months: 4 },
  { name: 'b 型流感嗜血杆菌（Hib）疫苗', dose: '第 4 剂', months: 18, note: '接种五联疫苗则无需单独接种' },
  { name: '手足口病疫苗（EV71）', dose: '第 1 剂', months: 6, note: '共 2 剂，间隔 1 个月' },
  { name: '手足口病疫苗（EV71）', dose: '第 2 剂', months: 7 },
  { name: '流感疫苗', dose: '每年 1 剂', months: 6, note: '每年流感季前接种；首次接种需 2 剂（间隔 4 周）' },
  { name: '水痘疫苗', dose: '第 1 剂', months: 12 },
  { name: '水痘疫苗', dose: '第 2 剂', months: 48, note: '4 岁接种' },
  { name: 'AC 群流脑结合疫苗', dose: '第 1 剂', months: 6, note: '可替代流脑 A 群多糖疫苗' },
  { name: 'AC 群流脑结合疫苗', dose: '第 2 剂', months: 9 },
  { name: '乙脑灭活疫苗', dose: '第 1 剂', months: 8, note: '替代乙脑减毒活疫苗；8 月龄 2 剂间隔 7-10 天，2 岁、6 岁各 1 剂' },
]

/** 出生日期 + 月龄 → 建议接种日期（YYYY-MM-DD，月末溢出钳制） */
export function planDateFromBirth(birthDate: string, months: number): string {
  const d = new Date(birthDate + 'T00:00:00')
  const m = d.getMonth() + months
  const y = d.getFullYear() + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  const day = Math.min(d.getDate(), new Date(y, mm + 1, 0).getDate())
  const dt = new Date(y, mm, day)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}