import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from "react";
import { label, tone } from "../lib/labels";

const control = "w-full rounded-2xl border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-canopy";

export function Button({ children, tone: buttonTone = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-forest text-gold2 hover:bg-canopy",
    ghost: "border border-line bg-white text-ink hover:bg-cream",
    danger: "bg-danger text-white",
  }[buttonTone];
  return (
    <button className={`rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Field({ label: caption, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{caption}</span>
      <input className={control} {...props} />
    </label>
  );
}

export function Select({ label: caption, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{caption}</span>
      <select className={control} {...props}>{children}</select>
    </label>
  );
}

export function Area({ label: caption, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{caption}</span>
      <textarea className={`${control} min-h-28`} {...props} />
    </label>
  );
}

export function Banner({ children, tone: bannerTone = "warn" }: { children: ReactNode; tone?: "warn" | "danger" | "ok" }) {
  const styles = { warn: "bg-gold2/60 text-ink", danger: "bg-red-100 text-danger", ok: "bg-emerald-50 text-ok" }[bannerTone];
  return <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Pill({ status }: { status: string }) {
  const color = tone(status);
  const styles = { ok: "bg-emerald-50 text-ok", danger: "bg-red-50 text-danger", warn: "bg-amber-50 text-warn", muted: "bg-cream text-muted" }[color];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs capitalize ${styles}`}>{label(status)}</span>;
}

export function PageTitle({ title, lede, action }: { title: string; lede?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl text-forest">{title}</h1>
        {lede ? <p className="mt-1 max-w-2xl text-sm text-muted">{lede}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label: caption, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[1.5rem] border border-line bg-paper px-4 py-4">
      <p className="text-xs text-muted">{caption}</p>
      <p className="mt-1 text-xl text-forest">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-line bg-paper px-4 py-8 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted">{body}</p>
    </div>
  );
}

export function Denied() {
  return <Empty title="This screen is outside your role" body="Sign in with a role that has this permission, or ask a Super Admin to grant it." />;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.5rem] border border-line bg-paper p-5 ${className}`}>{children}</section>;
}
