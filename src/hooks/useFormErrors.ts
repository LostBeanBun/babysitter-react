'use client'

import { useState } from 'react'

/**
 * 表单字段级校验错误：红框 + 输入框下方内联文案。
 * - set(field, msg) 标记字段错误（阻断提交前调用）
 * - clear(field) 在输入时清除单个字段错误
 * - clearAll() 打开表单 / 校验通过后调用
 * - formError 为表单级错误（如「三项至少填一项」），展示在字段下方
 */
export interface FormErrors {
  errors: Record<string, string>
  formError: string
  setFormError: (msg: string) => void
  set: (field: string, msg: string) => void
  clear: (field: string) => void
  clearAll: () => void
  has: (field: string) => boolean
  get: (field: string) => string
}

export function useFormErrors(): FormErrors {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  function set(field: string, msg: string): void {
    setErrors((prev) => ({ ...prev, [field]: msg }))
  }

  function clear(field: string): void {
    setErrors((prev) => {
      if (!(field in prev)) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function clearAll(): void {
    setErrors({})
    setFormError('')
  }

  function has(field: string): boolean {
    return !!errors[field]
  }

  function get(field: string): string {
    return errors[field] ?? ''
  }

  return { errors, formError, setFormError, set, clear, clearAll, has, get }
}
