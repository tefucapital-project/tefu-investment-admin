const TOKEN_KEY = "tefu.admin.access";
const REFRESH_KEY = "tefu.admin.refresh";
const PROFILE_KEY = "tefu.admin.profile";

export type ApiResult<T> = { success: boolean; message: string; data: T; code?: string };

export type AdminApiProfile = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  name: string;
  role: string;
};

function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function saveProfile(profile: AdminApiProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function readProfile(): AdminApiProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminApiProfile;
  } catch {
    return null;
  }
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(PROFILE_KEY);
}

export function hasToken() {
  return Boolean(localStorage.getItem(TOKEN_KEY));
}

export async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const headers = new Headers(authHeaders(init?.headers));
  const response = await fetch(`/api/v1/admin${path}`, { ...init, headers });
  const body = (await response.json()) as ApiResult<T>;
  if (!response.ok || !body.success) {
    throw Object.assign(new Error(body.message || "Request failed."), { code: body.code, status: response.status });
  }
  return body;
}
