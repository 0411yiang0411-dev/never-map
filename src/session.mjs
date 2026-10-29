const KEY = 'never-map-token';
export function storedAccess(session = sessionStorage, durable = localStorage) {
  try { return session.getItem(KEY) || durable.getItem(KEY) || ''; } catch { return ''; }
}
export function rememberAccess(value, session = sessionStorage, durable = localStorage) {
  try { session.setItem(KEY, value); } catch {}
  try { durable.setItem(KEY, value); } catch {}
}
export function forgetAccess(session = sessionStorage, durable = localStorage) {
  try { session.removeItem(KEY); } catch {}
  try { durable.removeItem(KEY); } catch {}
}
