import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Banner, Button, Denied, Empty, Field, PageTitle, Panel, Pill, Select, Area } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { api } from "../lib/api";
import { setClientStatus } from "../lib/engine";
import { dateTime, maskAccount, naira, shortDate } from "../lib/format";
import { seesFullBank } from "../lib/permissions";
import { clientMoney, clientName, findClient, holdingsOf, investedOf, kycChecklist, kycOf, walletOf } from "../lib/selectors";

function clientCode(client: { memberCode?: string | null; id: string }) {
  return client.memberCode || client.id;
}

export function ClientsPage() {
  const { state, admin, allowed, liveMode, refreshClients } = useAdmin();
  const [query, setQuery] = useState("");
  const [kycStatus, setKycStatus] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [invested, setInvested] = useState("");
  const [importJson, setImportJson] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const rows = useMemo(() => {
    if (!state || !admin) return [];
    const needle = query.trim().toLowerCase();
    return state.clients.filter((client) => {
      const kyc = kycOf(state, client.id);
      if (kycStatus && kyc?.status !== kycStatus) return false;
      if (accountStatus && client.accountStatus !== accountStatus) return false;
      if (from && client.registeredAt < new Date(`${from}T00:00:00`).getTime()) return false;
      if (to && client.registeredAt > new Date(`${to}T23:59:59`).getTime()) return false;
      const amount = investedOf(state, client.id);
      if (invested === "yes" && amount <= 0) return false;
      if (invested === "no" && amount > 0) return false;
      if (!needle) return true;
      const blob = [client.id, client.memberCode, clientName(client), client.email, client.phone, kyc?.nin.reference, kyc?.bvn.reference].join(" ").toLowerCase();
      const identity = allowed("kyc.review") ? blob : blob.replace(kyc?.nin.reference ?? "___", "").replace(kyc?.bvn.reference ?? "___", "");
      return identity.includes(needle);
    });
  }, [state, admin, query, kycStatus, accountStatus, from, to, invested, allowed]);
  if (!state || !admin) return null;
  if (!allowed("clients.view")) return <Denied />;
  return (
    <div>
      <PageTitle title="Clients" lede={liveMode ? "Live registered clients from the API. Search by name, email, phone, or client ID." : "Demo clients only. Sign in against the API to load registered users."} />
      {liveMode && allowed("admins.manage") ? (
        <Panel>
          <h2 className="font-medium">Recover demo browser signups</h2>
          <p className="mt-2 text-sm text-muted">
            Demo accounts lived in each browser under <code className="text-xs">tefu.investment.user.v1</code>. Paste that JSON (or a users array) here to create real API clients. Temporary password for imported accounts: <code className="text-xs">DemoRecover123!</code>
          </p>
          <p className="mt-2 text-xs text-muted">
            On a browser that still has the signup, open tefuinvestment.com, DevTools → Console, run:{" "}
            <code className="break-all">copy(localStorage.getItem(&quot;tefu.investment.user.v1&quot;))</code> then paste below.
          </p>
          {importError ? <div className="mt-3"><Banner tone="danger">{importError}</Banner></div> : null}
          {importMessage ? <div className="mt-3"><Banner>{importMessage}</Banner></div> : null}
          <form
            className="mt-4 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setImportBusy(true);
              setImportError("");
              setImportMessage("");
              try {
                const parsed = JSON.parse(importJson) as { users?: unknown[] } | unknown[];
                const users = Array.isArray(parsed) ? parsed : parsed.users;
                if (!Array.isArray(users) || users.length === 0) throw new Error("JSON must include a non-empty users array.");
                const result = await api<{
                  created: number;
                  skipped: number;
                  temporaryPassword: string;
                  skippedItems: { email: string; reason: string }[];
                }>("/clients/import-demo", {
                  method: "POST",
                  body: JSON.stringify({ users }),
                });
                await refreshClients();
                const skipNote = result.data.skipped
                  ? ` Skipped ${result.data.skipped}: ${result.data.skippedItems.map((item) => `${item.email} (${item.reason})`).join("; ")}`
                  : "";
                setImportMessage(`Imported ${result.data.created} client(s). Temporary password: ${result.data.temporaryPassword}.${skipNote}`);
                setImportJson("");
              } catch (err) {
                setImportError(err instanceof Error ? err.message : "Import failed.");
              } finally {
                setImportBusy(false);
              }
            }}
          >
            <Area label="Demo localStorage JSON" value={importJson} onChange={(event) => setImportJson(event.target.value)} />
            <Button type="submit" disabled={importBusy || !importJson.trim()}>{importBusy ? "Importing…" : "Import demo users"}</Button>
          </form>
        </Panel>
      ) : null}
      <div className="mb-4 mt-4 grid gap-3 md:grid-cols-3">
        <Field label="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select label="KYC status" value={kycStatus} onChange={(event) => setKycStatus(event.target.value)}>
          <option value="">Any</option>
          {["not_started", "in_progress", "pending_review", "approved", "rejected", "requires_update"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </Select>
        <Select label="Account status" value={accountStatus} onChange={(event) => setAccountStatus(event.target.value)}>
          <option value="">Any</option>
          {["kyc_locked", "kyc_in_progress", "kyc_pending_review", "active", "suspended", "kyc_rejected"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </Select>
        <Field label="Registered from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="Registered to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <Select label="Investment status" value={invested} onChange={(event) => setInvested(event.target.value)}>
          <option value="">Any</option>
          <option value="yes">Has an investment</option>
          <option value="no">No investment</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Client</th><th>Contact</th><th>KYC</th><th>Account</th><th>Wallet</th><th>Invested</th><th>Registered</th></tr></thead>
          <tbody>
            {rows.map((client) => {
              const kyc = kycOf(state, client.id);
              return (
                <tr key={client.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="text-canopy" to={`/clients/${client.id}`}>{clientName(client)}</Link><p className="text-xs text-muted">{clientCode(client)}</p></td>
                  <td>{client.email}<p className="text-xs text-muted">{client.phone}</p></td>
                  <td><Pill status={kyc?.status ?? "not_started"} /></td>
                  <td><Pill status={client.accountStatus} /></td>
                  <td>{naira(walletOf(state, client.id).balance)}</td>
                  <td>{naira(investedOf(state, client.id))}</td>
                  <td>{shortDate(client.registeredAt)}<p className="text-xs text-muted">Active {shortDate(client.lastActivity)}</p></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ClientProfilePage() {
  const { clientId = "" } = useParams();
  const navigate = useNavigate();
  const { state, admin, allowed, commit, liveMode, refreshClients } = useAdmin();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  if (!state || !admin) return null;
  if (!allowed("clients.view")) return <Denied />;
  const client = findClient(state, clientId);
  const kyc = kycOf(state, clientId);
  if (!client || !kyc) return <Empty title="Client not found" body="Return to the client list." />;
  const wallet = walletOf(state, client.id);
  const money = clientMoney(state, client.id);
  const check = kycChecklist(kyc);
  const holdings = holdingsOf(state, client.id);
  const bank = seesFullBank(admin.role) ? kyc.bank.accountNumber : maskAccount(kyc.bank.accountNumber);
  const notices = state.notifications.filter((item) => item.clientId === client.id).slice(0, 5);
  const tickets = state.tickets.filter((item) => item.clientId === client.id);
  const sessions = state.transactions.filter((item) => item.clientId === client.id).slice(0, 6);
  return (
    <div className="space-y-4">
      <PageTitle title={clientName(client)} lede={`${clientCode(client)} · registered ${shortDate(client.registeredAt)}`} action={<Link className="text-sm text-canopy" to={`/kyc/${client.id}`}>Open KYC review</Link>} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-medium">Personal information</h2>
          <p className="mt-2 text-sm">{kyc.personal.fullName || clientName(client)}</p>
          <p className="text-sm text-muted">{kyc.personal.dob || "Date of birth not submitted"} · {kyc.personal.gender || "Gender not submitted"} · {kyc.personal.nationality || "Nationality not submitted"}</p>
          <p className="mt-2 text-sm">{kyc.personal.address || "Address not submitted"}{kyc.personal.state ? `, ${kyc.personal.state}` : ""} {kyc.personal.lga}</p>
          <p className="text-sm">{client.phone} · {client.email}</p>
          <p className="mt-2 text-sm">Member code <span className="font-medium">{clientCode(client)}</span></p>
        </Panel>
        <Panel>
          <h2 className="font-medium">Account</h2>
          <div className="mt-2 flex flex-wrap gap-2"><Pill status={client.accountStatus} /><Pill status={kyc.status} /></div>
          <p className="mt-3 text-sm">Last login {dateTime(client.lastLogin)}</p>
          <p className="text-sm">Activated {dateTime(client.activatedAt)}</p>
          <p className="text-sm">KYC completion {check.percent}%</p>
          {allowed("clients.manage") ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const next = client.accountStatus === "suspended" ? "active" : "suspended";
                if (liveMode) {
                  setBusy(true);
                  try {
                    await api(`/clients/${client.id}/status`, {
                      method: "PATCH",
                      body: JSON.stringify({ status: next === "active" ? "ACTIVE" : "SUSPENDED", reason }),
                    });
                    await refreshClients();
                    setReason("");
                    setError("");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not update status.");
                  } finally {
                    setBusy(false);
                  }
                  return;
                }
                const result = commit((draft, actor) => setClientStatus(draft, actor, client.id, next, reason));
                setError(result.ok ? "" : result.error);
                if (result.ok) setReason("");
              }}
            >
              <Area label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              <Button type="submit" tone={client.accountStatus === "suspended" ? "primary" : "danger"} disabled={busy}>
                {client.accountStatus === "suspended" ? "Reactivate account" : "Suspend account"}
              </Button>
            </form>
          ) : null}
          {liveMode && allowed("admins.manage") ? (
            <div className="mt-6 space-y-3 border-t border-line pt-4">
              <p className="text-sm text-muted">Permanently delete this client, wallet, KYC, and related records. This cannot be undone.</p>
              <Button
                type="button"
                tone="danger"
                disabled={deleteBusy || reason.trim().length < 3}
                onClick={async () => {
                  if (!window.confirm(`Delete ${clientName(client)} (${clientCode(client)}) permanently?`)) return;
                  setDeleteBusy(true);
                  setError("");
                  try {
                    await api(`/clients/${client.id}`, {
                      method: "DELETE",
                      body: JSON.stringify({ reason: reason.trim() || "Deleted by admin." }),
                    });
                    await refreshClients();
                    navigate("/clients");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not delete account.");
                  } finally {
                    setDeleteBusy(false);
                  }
                }}
              >
                {deleteBusy ? "Deleting…" : "Delete account permanently"}
              </Button>
            </div>
          ) : null}
        </Panel>
        <Panel>
          <h2 className="font-medium">KYC components</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {check.items.map((item) => <li key={item.key}>{item.ok ? "✓" : "○"} {item.label}</li>)}
          </ul>
          <p className="mt-3 text-sm">NIN {kyc.nin.status} · {kyc.nin.reference || "No reference"}</p>
          <p className="text-sm">BVN {kyc.bvn.status} · {kyc.bvn.reference || "No reference"}</p>
          <p className="text-sm">Bank {kyc.bank.bank || "—"} · {bank || "—"} · {kyc.bank.status}</p>
        </Panel>
        <Panel>
          <h2 className="font-medium">Financial</h2>
          <p className="mt-2 text-sm">Balance {naira(wallet.balance)}</p>
          <p className="text-sm">Available {naira(wallet.available)} · Locked {naira(wallet.locked)}</p>
          <p className="text-sm">Deposits {naira(money.depositTotal)} · Withdrawals {naira(money.withdrawalTotal)}</p>
          <p className="text-sm">Invested {naira(investedOf(state, client.id))} · Distributions {naira(money.distributionTotal)}</p>
          <p className="text-sm">Fees collected {naira(money.feeTotal)}</p>
        </Panel>
      </div>
      <Panel>
        <h2 className="font-medium">Investments</h2>
        {holdings.length === 0 ? <p className="mt-2 text-sm text-muted">No recorded investment.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {holdings.map((item) => {
              const opp = state.opportunities.find((row) => row.id === item.opportunityId);
              return <li key={item.id}><Link className="text-canopy" to={`/investments/${item.id}`}>{item.reference}</Link> · {opp?.name} · {naira(item.amount)} · {item.status}</li>;
            })}
          </ul>
        )}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-medium">Recent transactions</h2>
          <ul className="mt-3 space-y-2 text-sm">{sessions.map((item) => <li key={item.id}>{item.reference} · {naira(item.amount)} · {item.status}</li>)}</ul>
        </Panel>
        <Panel>
          <h2 className="font-medium">Tickets and notices</h2>
          <ul className="mt-3 space-y-2 text-sm">{tickets.map((item) => <li key={item.id}><Link className="text-canopy" to={`/support/${item.id}`}>{item.subject}</Link> · {item.status}</li>)}</ul>
          <ul className="mt-3 space-y-2 text-sm text-muted">{notices.map((item) => <li key={item.id}>{item.title}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}
