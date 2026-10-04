import type { AppState } from "./types";

const KEY = "tefu.investment.admin.v1";
const SESSION = "tefu.admin.session";

export function loadState(): AppState | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export function persist(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearStoredState() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(SESSION);
}

export function readSessionId() {
  return sessionStorage.getItem(SESSION) ?? "";
}

export function writeSessionId(id: string) {
  if (id) sessionStorage.setItem(SESSION, id);
  else sessionStorage.removeItem(SESSION);
}
