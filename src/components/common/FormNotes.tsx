/**
 * 备注输入公共组件：统一「备注（可选）」字段，支持单行输入与多行文本域。
 */
export interface FormNotesProps {
  label: string
  value?: string
  placeholder?: string
  textarea?: boolean
  onChange?: (value: string) => void
}

export default function FormNotes({ label, value, placeholder, textarea, onChange }: FormNotesProps) {
  function handleInput(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    onChange?.(e.target.value)
  }

  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      {textarea ? (
        <textarea
          value={value ?? ''}
          placeholder={placeholder ?? ''}
          className="form-input form-textarea"
          onChange={handleInput}
        />
      ) : (
        <input
          value={value ?? ''}
          type="text"
          placeholder={placeholder ?? ''}
          className="form-input"
          onChange={handleInput}
        />
      )}
    </div>
  )
}
