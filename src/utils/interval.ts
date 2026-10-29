/**
 * 统计用区间工具
 *
 * 跨天记录（如 22:00 睡到次日 06:00）必须按「与统计窗口的重叠部分」计入，
 * 否则按开始时间整段归到一天会漏算次日、多算当天；未结束的记录按 now 截断。
 */

/** 区间 [start, end) 与窗口 [windowStart, windowEnd) 的重叠时长（ms）；end 为空时按 now 截断 */
export function overlapMs(
  start: number,
  end: number | undefined,
  windowStart: number,
  windowEnd: number,
  now: number,
): number {
  const from = Math.max(start, windowStart)
  const to = Math.min(end ?? now, windowEnd)
  return Math.max(0, to - from)
}

/**
 * 记录的实际结束时刻：
 * 优先 endTime；仅有 duration 的历史 / CSV 导入记录按 start + duration 还原；
 * 两者都没有说明记录进行中，按 now 截断。
 */
export function endOf(
  start: number,
  end: number | undefined,
  duration: number | undefined,
  now: number,
): number {
  if (end != null) return end
  if (duration != null) return start + duration
  return now
}
