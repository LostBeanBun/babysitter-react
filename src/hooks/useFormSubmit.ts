import { useRef } from 'react'
import type { FormEvent } from 'react'

const ERROR_FOCUS = '.has-error input, .has-error textarea, .has-error select, .has-error [role="radio"]'

/**
 * 表单提交包装：
 * - 根节点为 <form ref={formRef} onSubmit={onSubmit}>，输入框回车即触发提交
 * - 提交期间防重入并禁用提交按钮（进行态），结束后恢复
 * - 提交完成后聚焦第一个仍有校验错误的字段并轻晃提示（保存成功则表单已卸载，自动跳过）
 */
export function useFormSubmit(submit: () => Promise<void> | void) {
  const formRef = useRef<HTMLFormElement>(null)
  const busyRef = useRef(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (busyRef.current) return
    busyRef.current = true
    const buttons = Array.from(formRef.current?.querySelectorAll<HTMLButtonElement>('button[type="submit"]') ?? [])
    buttons.forEach((b) => {
      b.disabled = true
    })
    try {
      await submit()
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector<HTMLElement>(ERROR_FOCUS)
        el?.focus()
        const field = el?.closest<HTMLElement>('.has-error')
        if (field) {
          field.classList.remove('shake')
          field.getBoundingClientRect()
          field.classList.add('shake')
          window.setTimeout(() => field.classList.remove('shake'), 450)
        }
      })
    } finally {
      busyRef.current = false
      buttons.forEach((b) => {
        b.disabled = false
      })
    }
  }

  return { formRef, onSubmit }
}
