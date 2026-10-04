export function naira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(roundMoney(value));
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function dateTime(value: number | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function shortDate(value: number | string | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function uid() {
  return crypto.randomUUID();
}

export function reference(prefix: string) {
  const time = Date.now().toString(36).toUpperCase();
  const salt = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${time}-${salt}`;
}

export function fullName(person: { firstName: string; middleName?: string; lastName: string }) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" ");
}

export function maskAccount(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `•••• ${digits.slice(-4)}`;
}

export function deviceLabel() {
  const agent = navigator.userAgent;
  const device = /Mac/i.test(agent) ? "Mac" : /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : /iPhone/i.test(agent) ? "iPhone" : "Browser";
  return `${device} · local session`;
}

export async function digest(salt: string, secret: string) {
  const data = new TextEncoder().encode(`${salt}:${secret}`);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function oneTimeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function passwordIssue(password: string, minLength: number) {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include a letter and a number.";
  return "";
}

export function csvDownload(filename: string, rows: string[][]) {
  const body = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
