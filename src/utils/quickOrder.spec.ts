import { describe, it, expect, beforeEach } from 'vitest'
import { loadQuickUsage, recordQuickUse, sortQuickKinds } from './quickOrder'
import type { RecordKind } from '@/types'

const KINDS: RecordKind[] = ['feeding', 'diaper', 'sleep', 'pumping']

describe('quickOrder', () => {
  beforeEach(() => localStorage.clear())

  it('没有使用记录时保持默认顺序', () => {
    expect(sortQuickKinds(KINDS)).toEqual(KINDS)
  })

  it('按使用次数从多到少排序', () => {
    recordQuickUse('sleep')
    recordQuickUse('sleep')
    recordQuickUse('diaper')
    expect(sortQuickKinds(KINDS)).toEqual(['sleep', 'diaper', 'feeding', 'pumping'])
  })

  it('次数相同保持默认相对顺序（稳定）', () => {
    recordQuickUse('diaper')
    recordQuickUse('pumping')
    expect(sortQuickKinds(KINDS)).toEqual(['diaper', 'pumping', 'feeding', 'sleep'])
  })

  it('忽略损坏的 localStorage 内容', () => {
    localStorage.setItem('babysitter.quickUsage', 'not json')
    expect(loadQuickUsage()).toEqual({})
    expect(sortQuickKinds(KINDS)).toEqual(KINDS)
  })
})
