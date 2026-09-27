import { use as echartsUse } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  DataZoomComponent,
} from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking 减小打包体积）
 
echartsUse([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  DataZoomComponent,
])
