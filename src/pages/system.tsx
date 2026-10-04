import { useState } from "react";
import { Banner, Button, Denied, Field, PageTitle, Panel, Pill, Select, Area } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { assignRole, endOtherSessions, setAdminStatus, setTwoFactor, updateSettings } from "../lib/engine";
import { dateTime } from "../lib/format";
import { ROLE_LABEL } from "../lib/labels";
import type { Role, Settings } from "../lib/types";

export function AuditPage() {
  const { state, allowed } = useAdmin();
  const [query, setQuery] = useState("");
  if (!state) return null;
  if (!allowed("audit.view")) return <Denied />;
  const rows = state.audit.filter((item) => `${item.action} ${item.adminName} ${item.target} ${item.reason}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <PageTitle title="Audit log" lede="Sensitive actions stay on this record. Ordinary admins cannot delete it." />
      <Field label="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">When</th><th>Admin</th><th>Action</th><th>Target</th><th>Change</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">{dateTime(item.createdAt)}<p className="text-xs text-muted">{item.session}</p></td>
                <td>{item.adminName}<p className="text-xs text-muted">{ROLE_LABEL[item.role]}</p></td>
                <td>{item.action}</td>
                <td>{item.target}</td>
                <td>{item.previousValue || "—"} → {item.newValue || "—"}<p className="text-xs text-muted">{item.reason}</p></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { state, allowed, commit, resetDemo } = useAdmin();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  if (!state) return null;
  if (!allowed("settings.manage")) return <Denied />;
  return (
    <div>
      <PageTitle title="Settings" lede="Platform, fee, and security changes are written to the audit log." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <SettingsForm initial={state.settings} onSave={(next) => {
        const result = commit((draft, actor) => updateSettings(draft, actor, next));
        setSaved(result.ok ? "Settings saved." : "");
        setError(result.ok ? "" : result.error);
      }} />
      <Panel className="mt-4">
        <h2 className="font-medium">Demonstration ledger</h2>
        <p className="mt-2 text-sm text-muted">This removes the staff records stored in this browser and loads a fresh ledger.</p>
        <Button className="mt-3" tone="danger" type="button" onClick={resetDemo}>Reset demonstration data</Button>
      </Panel>
    </div>
  );
}

function SettingsForm({ initial, onSave }: { initial: Settings; onSave: (next: Settings) => void }) {
  const [form, setForm] = useState(initial);
  const [methods, setMethods] = useState(initial.paymentMethods.join(", "));
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, paymentMethods: methods.split(",").map((item) => item.trim()).filter(Boolean) }); }}>
      <Field label="Platform name" value={form.platformName} onChange={(event) => setForm({ ...form, platformName: event.target.value })} />
      <Field label="Support email" value={form.supportEmail} onChange={(event) => setForm({ ...form, supportEmail: event.target.value })} />
      <Field label="Support phone" value={form.supportPhone} onChange={(event) => setForm({ ...form, supportPhone: event.target.value })} />
      <Field label="Payment methods, comma separated" value={methods} onChange={(event) => setMethods(event.target.value)} />
      <Field label="Session timeout in minutes" type="number" value={form.sessionMinutes} onChange={(event) => setForm({ ...form, sessionMinutes: Number(event.target.value) })} />
      <Field label="Minimum password length" type="number" value={form.passwordMinLength} onChange={(event) => setForm({ ...form, passwordMinLength: Number(event.target.value) })} />
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.require2fa} onChange={(event) => setForm({ ...form, require2fa: event.target.checked })} /> Require a second factor at sign-in</label>
      <Button type="submit">Save settings</Button>
    </form>
  );
}

export function AdminsPage() {
  const { state, admin, allowed, commit, createAdmin } = useAdmin();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("support_admin");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  if (!state || !admin) return null;
  if (!allowed("admins.manage")) return <Denied />;
  return (
    <div className="space-y-4">
      <PageTitle title="Admin accounts" lede="Super Admin assigns roles. The last active Super Admin cannot be removed." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Admin</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {state.admins.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">{item.name}<p className="text-xs text-muted">{item.email}</p></td>
                <td>
                  <select className="rounded-xl border border-line bg-white px-2 py-1" value={item.role} onChange={(event) => {
                    const result = commit((draft, actor) => assignRole(draft, actor, item.id, event.target.value as Role));
                    setError(result.ok ? "" : result.error);
                  }}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
                  </select>
                </td>
                <td><Pill status={item.status} /></td>
                <td>{dateTime(item.lastLogin)}</td>
                <td>{item.id !== admin.id ? <Button type="button" tone="ghost" onClick={() => {
                  const result = commit((draft, actor) => setAdminStatus(draft, actor, item.id, item.status === "active" ? "suspended" : "active", reason));
                  setError(result.ok ? "" : result.error);
                }}>{item.status === "active" ? "Suspend" : "Reactivate"}</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Area label="Reason for a suspension or reactivation" value={reason} onChange={(event) => setReason(event.target.value)} />
      <form className="grid gap-3 md:grid-cols-2" onSubmit={async (event) => {
        event.preventDefault();
        const result = await createAdmin({ name, email, role, password });
        setError(result.ok ? "" : result.error);
        if (result.ok) {
          setName("");
          setEmail("");
          setPassword("");
        }
      }}>
        <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Field label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        <Select label="Role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          {(Object.keys(ROLE_LABEL) as Role[]).map((value) => <option key={value} value={value}>{ROLE_LABEL[value]}</option>)}
        </Select>
        <Field label="Temporary password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        <Button type="submit">Create admin</Button>
      </form>
    </div>
  );
}

export function SecurityPage() {
  const { state, admin, sessionId, commit, changePassword } = useAdmin();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  if (!state || !admin) return null;
  const sessions = state.sessions.filter((item) => item.adminId === admin.id);
  return (
    <div className="space-y-4">
      <PageTitle title="Security" lede="Password changes sign out other sessions. A second factor can be required for this account." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <form className="grid max-w-xl gap-3" onSubmit={async (event) => {
        event.preventDefault();
        const result = await changePassword(current, next);
        setSaved(result.ok ? "Password updated." : "");
        setError(result.ok ? "" : result.error);
        if (result.ok) {
          setCurrent("");
          setNext("");
        }
      }}>
        <Field label="Current password" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        <Field label="New password" type="password" value={next} onChange={(event) => setNext(event.target.value)} />
        <Button type="submit">Change password</Button>
      </form>
      <Panel>
        <h2 className="font-medium">Sessions</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {sessions.map((item) => <li key={item.id}>{item.device} · expires {dateTime(item.expiresAt)} {item.id === sessionId ? "· this device" : ""}</li>)}
        </ul>
        <Button className="mt-3" tone="ghost" type="button" onClick={() => {
          const result = commit((draft, actor) => endOtherSessions(draft, actor, sessionId));
          setError(result.ok ? "" : result.error);
        }}>Sign out other devices</Button>
      </Panel>
      <Panel>
        <h2 className="font-medium">Two-factor sign-in</h2>
        <p className="mt-2 text-sm text-muted">{admin.twoFactor ? "A code is required for this account." : "This account signs in with a password only."} {state.settings.require2fa ? "Platform policy also requires a second factor." : ""}</p>
        <Button className="mt-3" type="button" onClick={() => {
          const result = commit((draft, actor) => setTwoFactor(draft, actor, !admin.twoFactor));
          setSaved(result.ok ? "Two-factor setting updated." : "");
          setError(result.ok ? "" : result.error);
        }}>{admin.twoFactor ? "Turn off" : "Turn on"}</Button>
      </Panel>
    </div>
  );
}
