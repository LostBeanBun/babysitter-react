/**
 * 极简 React 测试渲染工具（不引入 @testing-library，避免额外依赖）：
 * - render / renderHook：用 react-dom/client + act 渲染
 * - click / submit / typeInto：按 React 事件模型派发交互
 */
import { act, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

// React 19 要求测试环境显式声明，否则 act 会告警
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export interface RenderResult {
  container: HTMLDivElement
  rerender: (ui: ReactElement) => void
  unmount: () => void
}

export function render(ui: ReactElement): RenderResult {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(ui))
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

export interface HookResult<T> {
  result: { current: T }
  unmount: () => void
}

export function renderHook<T>(hook: () => T): HookResult<T> {
  const result = { current: undefined as unknown as T }
  function Probe() {
    result.current = hook()
    return null
  }
  const { unmount } = render(<Probe />)
  return { result, unmount }
}

/** 等待副作用（Promise / effect）落定 */
export async function flush(): Promise<void> {
  await act(async () => {})
}

export function click(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

export function submit(form: Element): void {
  act(() => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

/** 受控输入赋值：走原生 setter 再派发 input，React 才能感知变化 */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 按 data-* 属性查询（测试桩用） */
export function query(container: ParentNode, selector: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`未找到元素：${selector}`)
  return el
}
