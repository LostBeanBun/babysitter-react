import { describe, it, expect } from 'vitest'
import {
  shouldSuggestBackup,
  parseBackup,
  BACKUP_REMIND_DAYS,
  getBackupSnoozeUntil,
  isBackupRemindEnabled,
  markBackedUp,
  setBackupRemindEnabled,
  snoozeBackupReminder,
} from './backup'

const DAY = 86_400_000

describe('shouldSuggestBackup', () => {
  const now = new Date('2026-10-23T10:00:00').getTime()

  it('没有数据时不提醒（新用户不被备份提示打扰）', () => {
    expect(shouldSuggestBackup({ lastBackupAt: null, hasData: false, now })).toBe(false)
  })

  it('有数据且从未备份时提醒', () => {
    expect(shouldSuggestBackup({ lastBackupAt: null, hasData: true, now })).toBe(true)
  })

  it('刚备份过不提醒', () => {
    expect(shouldSuggestBackup({ lastBackupAt: now - DAY, hasData: true, now })).toBe(false)
  })

  it('超过提醒天数后再次提醒', () => {
    expect(
      shouldSuggestBackup({ lastBackupAt: now - (BACKUP_REMIND_DAYS + 1) * DAY, hasData: true, now }),
    ).toBe(true)
  })

  it('恰好等于提醒天数时仍视为新鲜', () => {
    expect(
      shouldSuggestBackup({ lastBackupAt: now - BACKUP_REMIND_DAYS * DAY, hasData: true, now }),
    ).toBe(false)
  })

  it('关闭后静默期内不提醒（刷新页面也不重现）', () => {
    expect(
      shouldSuggestBackup({ lastBackupAt: null, hasData: true, now, snoozeUntil: now + DAY }),
    ).toBe(false)
  })

  it('静默期结束后重新提醒', () => {
    expect(
      shouldSuggestBackup({ lastBackupAt: null, hasData: true, now, snoozeUntil: now - 1 }),
    ).toBe(true)
  })

  it('设置页关闭备份提醒后永不提醒', () => {
    expect(shouldSuggestBackup({ lastBackupAt: null, hasData: true, now, enabled: false })).toBe(
      false,
    )
  })
})

describe('备份提醒静默与开关', () => {
  const now = new Date('2026-10-23T10:00:00').getTime()

  it('关闭提醒条后静默 1 天，成功备份后解除静默', () => {
    localStorage.clear()
    snoozeBackupReminder(now)
    expect(getBackupSnoozeUntil()).toBe(now + DAY)
    markBackedUp(now)
    expect(getBackupSnoozeUntil()).toBeNull()
  })

  it('开关默认开启；关闭可读回，重新开启会清掉静默期', () => {
    localStorage.clear()
    expect(isBackupRemindEnabled()).toBe(true)
    snoozeBackupReminder(now)
    setBackupRemindEnabled(false)
    expect(isBackupRemindEnabled()).toBe(false)
    setBackupRemindEnabled(true)
    expect(isBackupRemindEnabled()).toBe(true)
    expect(getBackupSnoozeUntil()).toBeNull()
  })
})

describe('parseBackup', () => {
  const valid = {
    meta: { app: 'babysitter', version: 4, exportedAt: '2026-10-23T00:00:00.000Z' },
    babies: [{ id: 1, name: '小糯米', avatarColor: 'c1', createdAt: 1 }],
    feedings: [{ id: 1, babyId: 1, type: 'breast', startTime: 1, createdAt: 1, updatedAt: 1 }],
    diapers: [],
    pumpings: [],
    sleeps: [],
  }

  it('解析合法备份并补齐可选表为空数组', () => {
    const parsed = parseBackup(JSON.stringify(valid))
    expect(parsed.babies).toHaveLength(1)
    expect(parsed.growths).toEqual([])
    expect(parsed.milestones).toEqual([])
  })

  it('拒绝非 JSON 文件', () => {
    expect(() => parseBackup('not json')).toThrow('invalidJson')
  })

  it('拒绝非本应用的 JSON', () => {
    expect(() => parseBackup(JSON.stringify({ meta: { app: 'other' } }))).toThrow('notBackup')
  })

  it('拒绝高于当前数据库版本的备份（避免降级写坏数据）', () => {
    const future = { ...valid, meta: { ...valid.meta, version: 999 } }
    expect(() => parseBackup(JSON.stringify(future))).toThrow('tooNew')
  })

  it('缺少 babies 数组时拒绝', () => {
    expect(() => parseBackup(JSON.stringify({ meta: { app: 'babysitter', version: 4 } }))).toThrow(
      'notBackup',
    )
  })
})
