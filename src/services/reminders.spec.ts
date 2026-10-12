import { describe, it, expect } from 'vitest'
import { upcomingVaccinations, vaccineDaysLeft } from '@/services/reminders'
import type { Vaccination } from '@/types'

const TODAY_START = 1_700_000_000_000
const DAY = 24 * 3600_000

function vax(partial: Partial<Vaccination> & { date: number }): Vaccination {
  return {
    babyId: 1,
    name: '百白破',
    status: 'planned',
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  }
}

describe('upcomingVaccinations', () => {
  it('只保留 planned 状态', () => {
    const list = [
      vax({ date: TODAY_START + DAY, status: 'done' }),
      vax({ date: TODAY_START + DAY, status: 'planned' }),
    ]
    expect(upcomingVaccinations(list, TODAY_START)).toHaveLength(1)
    expect(upcomingVaccinations(list, TODAY_START)[0].status).toBe('planned')
  })

  it('日期早于 14 天窗口的逾期计划不再提醒', () => {
    const list = [vax({ date: TODAY_START - 14 * DAY }), vax({ date: TODAY_START - 15 * DAY, name: '更早' })]
    expect(upcomingVaccinations(list, TODAY_START).map((v) => v.name)).toEqual(['百白破'])
  })

  it('窗口内逾期与未来计划都保留，按日期升序', () => {
    const list = [
      vax({ date: TODAY_START + 30 * DAY, name: '远期' }),
      vax({ date: TODAY_START - 3 * DAY, name: '逾期' }),
      vax({ date: TODAY_START + DAY, name: '近期' }),
    ]
    expect(upcomingVaccinations(list, TODAY_START).map((v) => v.name)).toEqual(['逾期', '近期', '远期'])
  })

  it('最多取 limit 条', () => {
    const list = [1, 2, 3, 4].map((n) => vax({ date: TODAY_START + n * DAY, name: `疫苗${n}` }))
    expect(upcomingVaccinations(list, TODAY_START, 2)).toHaveLength(2)
    expect(upcomingVaccinations(list, TODAY_START).map((v) => v.name)).toEqual(['疫苗1', '疫苗2', '疫苗3'])
  })
})

describe('vaccineDaysLeft', () => {
  it('当天为 0', () => {
    expect(vaccineDaysLeft(TODAY_START, TODAY_START)).toBe(0)
  })

  it('未来为正、逾期为负', () => {
    expect(vaccineDaysLeft(TODAY_START + 3 * DAY, TODAY_START)).toBe(3)
    expect(vaccineDaysLeft(TODAY_START - 2 * DAY, TODAY_START)).toBe(-2)
  })
})
