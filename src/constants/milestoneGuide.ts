/**
 * 发育里程碑参考表（月龄 → 常见能力）
 * 数据为通俗参考，供家长对照观察，不构成医学诊断。
 * 每个条目：[起始月龄, 结束月龄, 能力描述 i18n key]
 */
export interface MilestoneGuideItem {
  /** 起始月龄（含） */
  from: number
  /** 结束月龄（含） */
  to: number
  labelKey: string
  icon: string
}

export const MILESTONE_GUIDE: MilestoneGuideItem[] = [
  { from: 1, to: 3, labelKey: 'milestone.guide.1_3', icon: '🙂' },
  { from: 4, to: 6, labelKey: 'milestone.guide.4_6', icon: '🤸' },
  { from: 7, to: 9, labelKey: 'milestone.guide.7_9', icon: '🧘' },
  { from: 10, to: 12, labelKey: 'milestone.guide.10_12', icon: '🧍' },
  { from: 13, to: 18, labelKey: 'milestone.guide.13_18', icon: '🚶' },
  { from: 19, to: 24, labelKey: 'milestone.guide.19_24', icon: '🗣️' },
]

/** 按月龄查找对应参考条目（不在范围内返回 undefined） */
export function milestoneGuideForAge(months: number): MilestoneGuideItem | undefined {
  return MILESTONE_GUIDE.find((g) => months >= g.from && months <= g.to)
}

/** 生成月龄范围（如「1-3」；单位由调用方用 duration.monthShort 拼接） */
export function milestoneGuideRange(item: MilestoneGuideItem): string {
  return item.from === item.to ? `${item.from}` : `${item.from}-${item.to}`
}