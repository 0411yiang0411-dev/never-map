export const LIMITS = Object.freeze({
  bytes: 10_000_000_000,
  class_a: 1_000_000,
  class_b: 10_000_000
});
// Leave 1% headroom for reconciliation and administrative operations.
export const STOP_RATIO = 0.99;
export function quotaState(row, month = new Date().toISOString().slice(0, 7)) {
  if (!row || !row.verified || row.month !== month)
    return { paused: true, warning: false, reason: '用量尚未核实，云端操作已暂停', remaining: {} };
  const remaining = {};
  let warning = false, paused = false;
  for (const [key, limit] of Object.entries(LIMITS)) {
    const used = Number(row[key]);
    if (!Number.isFinite(used) || used < 0) return { paused: true, warning: false, reason: '用量记录无效', remaining: {} };
    remaining[key] = Math.max(0, 1 - used / limit);
    warning ||= used >= limit * 0.9;
    paused ||= used >= Math.floor(limit * STOP_RATIO);
  }
  return { paused, warning, reason: paused ? '已到安全停止线，云端操作暂停' : warning ? '免费额度剩余不足 10%' : '', remaining };
}
