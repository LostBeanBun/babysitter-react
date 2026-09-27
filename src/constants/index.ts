import type {
  FeedType,
  BreastSide,
  DiaperType,
  DiaperColor,
  DiaperAmount,
  PumpSide,
  SleepType,
  TemperatureMethod,
  MilestoneType,
} from '@/types'

/** 喂养类型标签（i18n key，配合 t() 使用） */
export const FEED_TYPE_LABELS: Record<FeedType, string> = {
  breast: 'feed.types.breast',
  bottle_breastmilk: 'feed.types.bottle_breastmilk',
  bottle_formula: 'feed.types.bottle_formula',
}

export const FEED_TYPE_LIST: { value: FeedType; label: string; icon: string; color: string }[] = [
  { value: 'breast', label: 'feed.types.breast', icon: '🤱', color: '#F2A28C' },
  { value: 'bottle_breastmilk', label: 'feed.types.bottle_breastmilk', icon: '🍼', color: '#8FB9D8' },
  { value: 'bottle_formula', label: 'feed.types.bottle_formula', icon: '🥛', color: '#C4A8E0' },
]

/** 亲喂侧边选项 */
export const BREAST_SIDE_LABELS: Record<BreastSide, string> = {
  left: 'feed.sides.left',
  right: 'feed.sides.right',
  both: 'feed.sides.both',
}

export const BREAST_SIDE_LIST: { value: BreastSide; label: string; icon: string }[] = [
  { value: 'left', label: 'feed.sides.left', icon: '👈' },
  { value: 'right', label: 'feed.sides.right', icon: '👉' },
]

/** 纸尿裤类型 */
export const DIAPER_TYPE_LABELS: Record<DiaperType, string> = {
  wet: 'diaper.types.wet',
  dirty: 'diaper.types.dirty',
  both: 'diaper.types.both',
}

export const DIAPER_TYPE_LIST: { value: DiaperType; label: string; icon: string; color: string }[] = [
  { value: 'wet', label: 'diaper.types.wet', icon: '💧', color: '#8FB9D8' },
  { value: 'dirty', label: 'diaper.types.dirty', icon: '💩', color: '#B58B62' },
  { value: 'both', label: 'diaper.types.both', icon: '🧷', color: '#9A8FC8' },
]

/** 便便颜色 */
export const DIAPER_COLOR_LABELS: Record<DiaperColor, string> = {
  yellow: 'diaper.colors.yellow',
  brown: 'diaper.colors.brown',
  green: 'diaper.colors.green',
  black: 'diaper.colors.black',
  red: 'diaper.colors.red',
  other: 'diaper.colors.other',
}

export const DIAPER_COLOR_DOTS: Record<DiaperColor, string> = {
  yellow: '#E8C46A',
  brown: '#9C6B3D',
  green: '#7FAF6C',
  black: '#4A3F35',
  red: '#D96A5A',
  other: '#B0A8A0',
}

/** 便便量 */
export const DIAPER_AMOUNT_LABELS: Record<DiaperAmount, string> = {
  small: 'diaper.amounts.small',
  medium: 'diaper.amounts.medium',
  large: 'diaper.amounts.large',
}

/** 吸奶侧 */
export const PUMP_SIDE_LABELS: Record<PumpSide, string> = {
  left: 'pump.sides.left',
  right: 'pump.sides.right',
  both: 'pump.sides.both',
}

export const PUMP_SIDE_LIST: { value: PumpSide; label: string; icon: string }[] = [
  { value: 'left', label: 'pump.sides.left', icon: '⬅️' },
  { value: 'right', label: 'pump.sides.right', icon: '➡️' },
  { value: 'both', label: 'pump.sides.both', icon: '↔️' },
]

/** 睡眠类型 */
export const SLEEP_TYPE_LABELS: Record<SleepType, string> = {
  nap: 'sleep.types.nap',
  night: 'sleep.types.night',
}

/** 体温测量方式 */
export const TEMP_METHOD_LABELS: Record<TemperatureMethod, string> = {
  armpit: 'temperature.methods.armpit',
  ear: 'temperature.methods.ear',
  forehead: 'temperature.methods.forehead',
  rectal: 'temperature.methods.rectal',
}

export const TEMP_METHOD_LIST: { value: TemperatureMethod; label: string; icon: string }[] = [
  { value: 'armpit', label: 'temperature.methods.armpit', icon: '🤗' },
  { value: 'ear', label: 'temperature.methods.ear', icon: '👂' },
  { value: 'forehead', label: 'temperature.methods.forehead', icon: '🤒' },
  { value: 'rectal', label: 'temperature.methods.rectal', icon: '🌡️' },
]

/** 里程碑类型标签（i18n key） */
export const MILESTONE_TYPE_LABELS: Record<MilestoneType, string> = {
  roll: 'milestone.types.roll',
  sit: 'milestone.types.sit',
  crawl: 'milestone.types.crawl',
  stand: 'milestone.types.stand',
  walk: 'milestone.types.walk',
  first_word: 'milestone.types.first_word',
  tooth: 'milestone.types.tooth',
  wave: 'milestone.types.wave',
  other: 'milestone.types.other',
}

/** 里程碑类型列表（表单按钮组 + 时间线图标） */
export const MILESTONE_TYPE_LIST: { value: MilestoneType; label: string; icon: string; color: string }[] = [
  { value: 'roll', label: 'milestone.types.roll', icon: '🤸', color: '#E8B86A' },
  { value: 'sit', label: 'milestone.types.sit', icon: '🧘', color: '#E8B86A' },
  { value: 'crawl', label: 'milestone.types.crawl', icon: '🐾', color: '#E8B86A' },
  { value: 'stand', label: 'milestone.types.stand', icon: '🧍', color: '#E8B86A' },
  { value: 'walk', label: 'milestone.types.walk', icon: '🚶', color: '#E8B86A' },
  { value: 'first_word', label: 'milestone.types.first_word', icon: '🗣️', color: '#E8B86A' },
  { value: 'tooth', label: 'milestone.types.tooth', icon: '🦷', color: '#E8B86A' },
  { value: 'wave', label: 'milestone.types.wave', icon: '👋', color: '#E8B86A' },
  { value: 'other', label: 'milestone.types.other', icon: '🌟', color: '#E8B86A' },
]

/** 主题色（统计图表统一使用） */
export const CHART_COLORS = {
  feedAmount: '#E8906C',
  breast: '#F2A28C',
  bottle: '#8FB9D8',
  formula: '#C4A8E0',
  sleep: '#8FAED8',
  diaper: '#9A8FC8',
  pump: '#D8A8C8',
  temperature: '#E8A45A',
  primary: '#E8906C',
}

/** 常用单位换算 */
export const MS_PER_HOUR = 3600_000
export const MS_PER_DAY = 24 * MS_PER_HOUR

/** 宝宝头像配色 */
export const AVATAR_COLORS = ['#F2A28C', '#8FB9D8', '#8FBF9F', '#C4A8E0', '#E8C46A', '#D8A8C8', '#9A8FC8', '#7FB3A6']

/** 宝宝头像 emoji 选择（含 12 生肖） */
export const BABY_AVATARS = [
  // 12 生肖
  '🐭',
  '🐮',
  '🐯',
  '🐰',
  '🐲',
  '🐍',
  '🐴',
  '🐑',
  '🐵',
  '🐔',
  '🐶',
  '🐷',
  // 其他可爱形象
  '🐣',
  '🐻',
  '🐼',
  '🐨',
  '🦊',
  '🐸',
  '🐥',
  '🦄',
  '🌸',
  '🌙',
  '⭐',
  '🍀',
]
