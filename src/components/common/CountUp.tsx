'use client'

import { useEffect, useRef, useState } from 'react'

interface CountUpProps {
  value: number
  format: (n: number) => string
}

/** 数字滚动：值变化时从上一显示值缓动到目标（挂载时从 0 滚入；reduced-motion 下直接显示） */
export default function CountUp({ value, format }: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = displayRef.current
    const duration = reduced ? 0 : 600
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = from + (value - from) * eased
      displayRef.current = cur
      setDisplay(cur)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <span>{format(display)}</span>
}
