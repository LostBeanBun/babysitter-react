import { ageInMonths, bucketIndexByMonths } from '@/utils/age'
import i18n from '@/i18n'
import type { Baby } from '@/types'

const t = (key: string, options?: Record<string, unknown>): string =>
  String(i18n.t(key, options as never))

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
  const i = bucketIndexByMonths(ageInMonths(baby.birthDate, Date.now()))
  return {
    milk: t(`guides.milk${i}`),
    feedCount: t(`guides.feed${i}`),
    sleep: t(`guides.sleep${i}`),
    diaper: t(`guides.diaper${i}`),
    pump: t('guides.pump'),
  }
}
