/**
 * WHO 生长百分位估算：根据测量值反推其对应的百分位。
 *
 * 原理：WHO 参考数据只提供 P3/P15/P50/P85/P97 五个锚点。
 * 将各锚点对应的标准正态 Z 分数（P3≈-1.88, P15≈-1.04, P50=0, P85≈+1.04, P97≈+1.88）
 * 与测量值做线性插值反推 Z，再用标准正态 CDF 转成百分位。
 * 结果 clamp 到 1-99（P3 以下 / P97 以上给出保守估计）。
 */
import { interpolateWho, type WhoField, type WhoPoint, type WhoPercentileKey } from '@/constants/whoGrowth'

/** 各百分位锚点对应的 Z 分数 */
const PERCENTILE_Z: Record<WhoPercentileKey, number> = {
  p3: -1.8808,
  p15: -1.0364,
  p50: 0,
  p85: 1.0364,
  p97: 1.8808,
}

const ANCHOR_KEYS: WhoPercentileKey[] = ['p3', 'p15', 'p50', 'p85', 'p97']

/** 标准正态分布 CDF（Abramowitz-Stegun 7.1.26 近似，误差 < 1e-7） */
export function normCdf(z: number): number {
  if (z >= 6) return 1
  if (z <= -6) return 0
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z > 0 ? 1 - p : p
}

/**
 * 估算某月龄某测量值对应的 WHO 百分位（0-100，clamp 到 1-99）。
 * @param data WHO 数据集（whoData(gender) 的结果）
 * @param month 月龄（允许分数，会先对百分位值做线性插值）
 * @param field 测量类型：weight / length / hc
 * @param value 测量值
 */
export function estimatePercentile(
  data: WhoPoint[],
  month: number,
  field: WhoField,
  value: number,
): number {
  if (!data.length) return 50
  // 各锚点在该月龄的参考值
  const anchors = ANCHOR_KEYS.map((k) => ({
    v: interpolateWho(data, month, field, k),
    z: PERCENTILE_Z[k],
  }))

  // 低于 P3：用 P3-P15 段斜率外推，再 clamp
  if (value <= anchors[0].v) {
    const a = anchors[0]
    const b = anchors[1]
    const slope = b.v === a.v ? 0 : (b.z - a.z) / (b.v - a.v)
    return clampPercentile(normCdf(a.z + (value - a.v) * slope))
  }
  // 高于 P97：用 P85-P97 段斜率外推，再 clamp
  if (value >= anchors[anchors.length - 1].v) {
    const a = anchors[anchors.length - 2]
    const b = anchors[anchors.length - 1]
    const slope = b.v === a.v ? 0 : (b.z - a.z) / (b.v - a.v)
    return clampPercentile(normCdf(b.z + (value - b.v) * slope))
  }
  // 落在锚点区间内：线性插值 Z，再转百分位
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (value >= a.v && value <= b.v) {
      const t = b.v === a.v ? 0 : (value - a.v) / (b.v - a.v)
      return clampPercentile(normCdf(a.z + (b.z - a.z) * t))
    }
  }
  return 50
}

function clampPercentile(p: number): number {
  if (Number.isNaN(p)) return 50
  return Math.max(1, Math.min(99, Math.round(p * 100)))
}
