import { describe, it, expect } from 'vitest'
import i18n from '@/i18n'

describe('i18n interpolation', () => {
  it('单花括号 {n} 可插值（与语言包 / vue-i18n 一致）', () => {
    expect(i18n.t('common.records', { n: 5 })).toBe('5 条')
    expect(i18n.t('common.times', { n: 3 })).toBe('3 次')
    expect(i18n.t('common.daily', { value: '3 次' })).toBe('日均 3 次')
    expect(i18n.t('stats.summarySub', { n: 7 })).toContain('7')
    expect(i18n.t('stats.summarySub', { n: 7 })).not.toContain('{n}')
  })

  it('多变量文案可插值', () => {
    expect(i18n.t('settings.ageDays', { n: 12 })).toBe('12 天')
    expect(i18n.t('dashboard.vaccineDaysLeft', { n: 3 })).not.toContain('{n}')
    expect(i18n.t('vaccination.planMonth', { n: 5 })).not.toContain('{n}')
  })
})
