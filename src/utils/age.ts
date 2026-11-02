/** 月龄计算与年龄段分桶 */

/** 按出生日期计算月龄（允许分数月龄，用于插值） */
export function ageInMonths(birthDate: string, date: number): number {
  const birth = new Date(birthDate + 'T00:00:00').getTime()
  return (date - birth) / (30.44 * 24 * 3600_000)
}

/** 月龄分段上界（不含）：0-1, 1-3, 3-6, 6-9, 9-12, 12+ */
export const AGE_BUCKET_BOUNDS = [1, 3, 6, 9, 12] as const

/** 按月龄返回分段索引（0: <1月 1: 1-3月 … 5: 12月+） */
export function bucketIndexByMonths(months: number): number {
  let i = 0
  while (i < AGE_BUCKET_BOUNDS.length && months >= AGE_BUCKET_BOUNDS[i]) i++
  return i
}
