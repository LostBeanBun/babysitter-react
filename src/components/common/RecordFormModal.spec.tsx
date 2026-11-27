/**
 * 记录表单弹窗分发：按 kind 渲染对应表单、编辑载荷透传、标题随新增/编辑切换、事件透传。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import RecordFormModal from '@/components/common/RecordFormModal'
import { click, query, render, type RenderResult } from '@/test/render'
import type { RecordKind } from '@/types'
import type { TimelineEntry } from '@/services/timeline'

/** kind → 表单组件名（与 RecordFormModal 的分支一致） */
const FORM_OF: Record<RecordKind, string> = {
  feeding: 'FeedingForm',
  diaper: 'DiaperForm',
  pumping: 'PumpingForm',
  sleep: 'SleepForm',
  growth: 'GrowthForm',
  solidFood: 'SolidFoodForm',
  medication: 'MedicationForm',
  vaccination: 'VaccinationForm',
  temperature: 'TemperatureForm',
  milestone: 'MilestoneForm',
}

interface StubProps {
  editing?: unknown
  onSaved?: () => void
  onCancelled?: () => void
  onStartRecord?: () => void
}

const { received } = vi.hoisted(() => ({ received: {} as Record<string, StubProps> }))

/** 表单桩：记录收到的 props，并提供触发回调的按钮 */
function formStub(name: string) {
  return {
    default: (props: StubProps) => {
      received[name] = props
      return (
        <div data-form={name}>
          <button data-act="saved" onClick={props.onSaved} />
          <button data-act="cancelled" onClick={props.onCancelled} />
          <button data-act="startRecord" onClick={props.onStartRecord} />
        </div>
      )
    },
  }
}

vi.mock('../forms/FeedingForm', () => formStub('FeedingForm'))
vi.mock('../forms/DiaperForm', () => formStub('DiaperForm'))
vi.mock('../forms/PumpingForm', () => formStub('PumpingForm'))
vi.mock('../forms/SleepForm', () => formStub('SleepForm'))
vi.mock('../forms/GrowthForm', () => formStub('GrowthForm'))
vi.mock('../forms/SolidFoodForm', () => formStub('SolidFoodForm'))
vi.mock('../forms/MedicationForm', () => formStub('MedicationForm'))
vi.mock('../forms/VaccinationForm', () => formStub('VaccinationForm'))
vi.mock('../forms/TemperatureForm', () => formStub('TemperatureForm'))
vi.mock('../forms/MilestoneForm', () => formStub('MilestoneForm'))

vi.mock('./BaseModal', () => ({
  default: ({
    show,
    title,
    onClose,
    children,
  }: {
    show: boolean
    title?: string
    onClose?: () => void
    children?: ReactNode
  }) =>
    show ? (
      <div data-modal data-title={title}>
        <button data-act="close" onClick={onClose} />
        {children}
      </div>
    ) : null,
}))

let seq = 0
function entry(kind: RecordKind): TimelineEntry {
  const id = ++seq
  return {
    id,
    kind,
    time: 1_700_000_000_000,
    icon: '🍼',
    color: '#000',
    kindColor: '#000',
    title: 't',
    detail: 'd',
    raw: { id, babyId: 1, createdAt: 0, updatedAt: 0 } as TimelineEntry['raw'],
  }
}

interface Callbacks {
  onClose?: () => void
  onSaved?: () => void
  onCancelled?: () => void
  onStartRecord?: () => void
}

const rendered: RenderResult[] = []

function mountModal(
  state: { kind: RecordKind; editing?: TimelineEntry } | null,
  callbacks: Callbacks = {},
) {
  const r = render(
    <RecordFormModal
      state={state}
      onClose={callbacks.onClose ?? (() => {})}
      onSaved={callbacks.onSaved ?? (() => {})}
      onCancelled={callbacks.onCancelled ?? (() => {})}
      onStartRecord={callbacks.onStartRecord ?? (() => {})}
    />,
  )
  rendered.push(r)
  return r
}

afterEach(() => {
  while (rendered.length) rendered.pop()!.unmount()
})

describe('RecordFormModal', () => {
  it('state 为 null 时不渲染弹窗与表单', () => {
    const { container } = mountModal(null)
    expect(container.querySelector('[data-modal]')).toBeNull()
    expect(container.querySelector('[data-form]')).toBeNull()
  })

  it.each(Object.keys(FORM_OF) as RecordKind[])('kind=%s 只渲染对应表单', (kind) => {
    const { container } = mountModal({ kind })
    const forms = container.querySelectorAll('[data-form]')
    expect(forms).toHaveLength(1)
    expect(forms[0].getAttribute('data-form')).toBe(FORM_OF[kind])
  })

  it('新增时标题为「添加记录」', () => {
    const { container } = mountModal({ kind: 'feeding' })
    expect(query(container, '[data-modal]').getAttribute('data-title')).toBe(i18n.t('log.addTitle'))
  })

  it('编辑时标题为「编辑记录」并透传完整编辑载荷', () => {
    const item = entry('growth')
    const { container } = mountModal({ kind: 'growth', editing: item })

    expect(query(container, '[data-modal]').getAttribute('data-title')).toBe(i18n.t('log.editTitle'))
    expect(received['GrowthForm'].editing).toEqual({ ...item.raw, id: item.id })
  })

  it('表单事件透传给父组件', () => {
    const onSaved = vi.fn()
    const onCancelled = vi.fn()
    const onStartRecord = vi.fn()
    const { container } = mountModal({ kind: 'sleep' }, { onSaved, onCancelled, onStartRecord })

    click(query(container, '[data-act="saved"]'))
    click(query(container, '[data-act="cancelled"]'))
    click(query(container, '[data-act="startRecord"]'))

    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onCancelled).toHaveBeenCalledTimes(1)
    expect(onStartRecord).toHaveBeenCalledTimes(1)
  })

  it('弹窗关闭事件透传', () => {
    const onClose = vi.fn()
    const { container } = mountModal({ kind: 'feeding' }, { onClose })

    click(query(container, '[data-act="close"]'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
