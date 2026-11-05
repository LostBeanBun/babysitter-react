'use client'

/**
 * 选项按钮组公共组件（对齐 Vue 同名组件）：图标 + 文案的网格选择。
 * - 选项带 color 时选中态用该色内联样式；否则用主题色默认选中态
 * - clearable：再次点击已选项时清空（如体温方式可不选）
 */
import s from './ChoiceGrid.module.css'

export interface ChoiceOption {
  value: string
  icon: string
  label: string
  /** 选中态颜色（如喂养类型各类型专属色） */
  color?: string
}

export interface ChoiceGridProps {
  options: ChoiceOption[]
  value: string
  onChange: (value: string) => void
  /** 每行列数 */
  columns?: number
  disabled?: boolean
  clearable?: boolean
}

export default function ChoiceGrid({ options, value, onChange, columns = 3, disabled, clearable }: ChoiceGridProps) {
  function select(opt: ChoiceOption) {
    if (disabled) return
    if (clearable && value === opt.value) {
      onChange('')
      return
    }
    onChange(opt.value)
  }

  return (
    <div className={s['choice-grid']} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className={selected ? `${s['choice-btn']} ${s.selected}` : s['choice-btn']}
            style={selected && opt.color ? { background: opt.color + '22', borderColor: opt.color, color: opt.color } : undefined}
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => select(opt)}
          >
            <span className={s['choice-icon']}>{opt.icon}</span>
            <span className={s['choice-label']}>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
