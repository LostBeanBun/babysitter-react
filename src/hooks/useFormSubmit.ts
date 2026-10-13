import { useRef } from 'react'
import type { FormEvent } from 'react'

/**
 * 表单提交包装：
 * - 根节点为 <form ref={formRef} onSubmit={onSubmit}>，输入框回车即触发提交
 * - 提交完成后聚焦第一个仍有校验错误的字段（保存成功则表单已卸载，自动跳过）
 */
export function useFormSubmit(submit: () => Promise<void> | void) {
  const formRef = useRef<HTMLFormElement>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    await submit()
    requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>('.has-error input, .has-error textarea, .has-error select, .has-error [role="radio"]')
        ?.focus()
    })
  }

  return { formRef, onSubmit }
}
