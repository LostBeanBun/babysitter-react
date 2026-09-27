import { ageInMonths } from '@/constants/whoGrowth'
import i18n from '@/i18n'
import type { Baby } from '@/types'

const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never))

/** 按月龄返回参考数据分段索引（0:0-1月 1:1-3月 2:3-6月 3:6-9月 4:9-12月 5:12月+） */
function guideIndex(months: number): number {
  if (months < 1) return 0
  if (months < 3) return 1
  if (months < 6) return 2
  if (months < 9) return 3
  if (months < 12) return 4
  return 5
}

/** 各指标的每日参考值（按年龄段），文案来自 i18n */
export interface DailyGuide {
  /** 每日奶量参考，如「500-800 ml」 */
  milk: string
  /** 每日喂养次数参考，如「8-12 次」 */
  feedCount: string
  /** 每日睡眠时长参考，如「11-14 小时」 */
  sleep: string
  /** 每日纸尿裤更换参考，如「6-8 次」 */
  diaper: string
  /** 吸奶频率参考（通用） */
  pump: string
}

/** 按月龄返回各指标每日参考值；宝宝无出生日期时返回 null */
export function dailyGuide(baby?: Baby): DailyGuide | null {
  if (!baby?.birthDate) return null
  const i = guideIndex(ageInMonths(baby.birthDate, Date.now()))
  return {
    milk: t(`guides.milk${i}`),
    feedCount: t(`guides.feed${i}`),
    sleep: t(`guides.sleep${i}`),
    diaper: t(`guides.diaper${i}`),
    pump: t('guides.pump'),
  }
}
