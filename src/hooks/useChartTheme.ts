'use client'

import { useThemeStore, isDarkNow } from '@/stores/theme'

/** 当前是否暗色 */
export function useIsDark(): boolean {
  return useThemeStore((s) => s.isDark)
}

/** ECharts 坐标轴/网格主题色（随明暗切换） */
export function useChartTheme() {
  const dark = useIsDark()

  const axisColor = dark ? '#b9ab9e' : '#8c7b72'
  const axisLineColor = dark ? '#42372f' : '#f0e2d4'
  const splitLineColor = dark ? '#2b251f' : '#f5ece2'
  const tooltipColors = dark
    ? { backgroundColor: 'rgba(41,35,30,0.96)', borderColor: '#42372f', textColor: '#f0e6dd' }
    : { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#f0e2d4', textColor: '#4a3a33' }
  const whoColors = dark
    ? { strong: '#6d6158', mid: '#5a5048', soft: '#4a413a' }
    : { strong: '#a49482', mid: '#c4b6a6', soft: '#d8cbbd' }

  return { axisColor, axisLineColor, splitLineColor, tooltipColors, whoColors, isDark: dark }
}
