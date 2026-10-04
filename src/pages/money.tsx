import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, Banner, Button, Denied, Empty, Field, PageTitle, Panel, Pill, Select } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { adjustWallet, advanceWithdrawal, resolveClientFee, resolveDeposit, updateFeeSetting } from "../lib/engine";
import { dateTime, maskAccount, naira } from "../lib/format";
import { ONBOARDING_FEE_NAME } from "../lib/labels";
import { seesFullBank } from "../lib/permissions";
import { clientName, exceptionsOf, findClient, walletOf } from "../lib/selectors";
import type { PayStatus, WithdrawalStatus } from "../lib/types";

function useMoney() {
  const value = useAdmin();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  function run(result: { ok: boolean; error?: string }) {
    if (!result.ok) {
      setSaved("");
      setError(result.error ?? "The action did not complete.");
      return;
    }
    setError("");
    setSaved("Recorded.");
  }
  return { ...value, error, saved, run };
}

export function FeesPage() {
  const { state, allowed, commit, error, saved, run } = useMoney();
  const [reason, setReason] = useState("");
  if (!state) return null;
  if (!allowed("fees.view") && !allowed("fees.manage")) return <Denied />;
  const fees = state.clientFees;
  const tally = (status: string) => fees.filter((item) => item.name === ONBOARDING_FEE_NAME && item.status === status);
  const collected = tally("successful").reduce((sum, item) => sum + item.amount, 0);
  return (
    <div>
      <PageTitle title="Client Onboarding Fee" lede="The fee is always shown as the Client Onboarding Fee. A pending, failed, or reversed payment does not unlock KYC." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel><p className="text-xs text-muted">Collected</p><p className="text-2xl">{naira(collected)}</p></Panel>
        {["successful", "pending", "failed", "reversed", "refunded"].map((status) => <Panel key={status}><p className="text-xs text-muted">{status}</p><p className="text-2xl">{tally(status).length}</p></Panel>)}
      </div>
      <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Fee</th><th>Client</th><th>Amount</th><th>Method</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {fees.map((item) => {
              const client = findClient(state, item.clientId);
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3">{item.name}<p className="text-xs text-muted">{item.reference}</p></td>
                  <td>{client ? clientName(client) : item.clientId}</td>
                  <td>{naira(item.amount)}</td>
                  <td>{item.method}</td>
                  <td><Pill status={item.status} /></td>
                  <td>{dateTime(item.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {allowed("fees.manage") ? (
        <Panel className="mt-4">
          <h2 className="font-medium">Update a fee record</h2>
          <FeeRecordForm onSubmit={(id, status) => run(commit((draft, actor) => resolveClientFee(draft, actor, id, status, reason)))} reason={reason} setReason={setReason} />
          <div className="mt-6 space-y-4">
            {state.feeSettings.map((item) => <FeeSettingForm key={item.id} id={item.id} name={item.name} amount={item.amount} status={item.status} description={item.description} method={item.method} onSave={(amount, status, description) => run(commit((draft, actor) => updateFeeSetting(draft, actor, item.id, amount, status, description)))} />)}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function FeeRecordForm({ reason, setReason, onSubmit }: { reason: string; setReason: (value: string) => void; onSubmit: (id: string, status: PayStatus) => void }) {
  const { state } = useAdmin();
  const [id, setId] = useState(state?.clientFees[0]?.id ?? "");
  const [status, setStatus] = useState<PayStatus>("successful");
  if (!state) return null;
  return (
    <form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSubmit(id, status); }}>
      <Select label="Record" value={id} onChange={(event) => setId(event.target.value)}>
        {state.clientFees.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.reference}</option>)}
      </Select>
      <Select label="New status" value={status} onChange={(event) => setStatus(event.target.value as PayStatus)}>
        {["pending", "processing", "successful", "failed", "reversed", "refunded"].map((item) => <option key={item} value={item}>{item}</option>)}
      </Select>
      <Area label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="self-end"><Button type="submit">Update fee record</Button></div>
    </form>
  );
}

function FeeSettingForm({ name, amount, status, description, method, onSave }: { id: string; name: string; amount: number; status: "active" | "inactive"; description: string; method: string; onSave: (amount: number, status: "active" | "inactive", description: string) => void }) {
  const [nextAmount, setNextAmount] = useState(String(amount));
  const [nextStatus, setNextStatus] = useState(status);
  const [nextDescription, setNextDescription] = useState(description);
  return (
    <form className="grid gap-3 rounded-2xl border border-line p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); onSave(Number(nextAmount), nextStatus, nextDescription); }}>
      <p className="md:col-span-2 font-medium">{name} · {method}</p>
      <Field label={method === "percent" ? "Percent" : "Amount"} value={nextAmount} onChange={(event) => setNextAmount(event.target.value)} />
      <Select label="Status" value={nextStatus} onChange={(event) => setNextStatus(event.target.value as "active" | "inactive")}>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </Select>
      <Area label="Description" value={nextDescription} onChange={(event) => setNextDescription(event.target.value)} />
      <div className="self-end"><Button type="submit">Save fee setting</Button></div>
    </form>
  );
}

export function WalletsPage() {
  const { state, allowed } = useMoney();
  if (!state) return null;
  if (!allowed("wallets.view")) return <Denied />;
  return (
    <div>
      <PageTitle title="Wallets" lede="Balances are monitored here. An adjustment needs a reason, a reference, and an audit record." />
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Client</th><th>Balance</th><th>Available</th><th>Locked</th></tr></thead>
          <tbody>
            {state.wallets.map((item) => {
              const client = findClient(state, item.clientId);
              return (
                <tr key={item.clientId} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="text-canopy" to={`/wallets/${item.clientId}`}>{client ? clientName(client) : item.clientId}</Link></td>
                  <td>{naira(item.balance)}</td>
                  <td>{naira(item.available)}</td>
                  <td>{naira(item.locked)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WalletDetailPage() {
  const { clientId = "" } = useParams();
  const { state, allowed, commit, error, saved, run } = useMoney();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [reason, setReason] = useState("");
  if (!state) return null;
  if (!allowed("wallets.view")) return <Denied />;
  const client = findClient(state, clientId);
  const wallet = walletOf(state, clientId);
  if (!client) return <Empty title="Wallet not found" body="Return to the wallet list." />;
  const txs = state.transactions.filter((item) => item.clientId === clientId);
  return (
    <div>
      <PageTitle title={`${clientName(client)} wallet`} lede={`Balance ${naira(wallet.balance)} · Available ${naira(wallet.available)} · Locked ${naira(wallet.locked)}`} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      {allowed("wallets.adjust") ? (
        <Panel className="mb-4">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); run(commit((draft, actor) => adjustWallet(draft, actor, client.id, Number(amount), direction, reason))); }}>
            <Field label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
            <Select label="Direction" value={direction} onChange={(event) => setDirection(event.target.value as "credit" | "debit")}>
              <option value="credit">Credit available balance</option>
              <option value="debit">Debit available balance</option>
            </Select>
            <Area label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
            <div className="self-end"><Button type="submit">Post adjustment</Button></div>
          </form>
        </Panel>
      ) : null}
      <TxTable rows={txs} />
    </div>
  );
}

export function DepositsPage() {
  const { state, allowed, commit, error, saved, run } = useMoney();
  const [note, setNote] = useState("");
  if (!state) return null;
  if (!allowed("deposits.manage")) return <Denied />;
  return (
    <div>
      <PageTitle title="Deposits" lede="A wallet is credited only after a pending deposit is confirmed." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <Field label="Note for the next action" value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Reference</th><th>Client</th><th>Amount</th><th>Method</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {state.deposits.map((item) => {
              const client = findClient(state, item.clientId);
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3">{item.reference}<p className="text-xs text-muted">{dateTime(item.createdAt)} {item.note}</p></td>
                  <td>{client ? clientName(client) : item.clientId}</td>
                  <td>{naira(item.amount)}</td>
                  <td>{item.method}</td>
                  <td><Pill status={item.status} /></td>
                  <td className="space-x-2 py-3">
                    {item.status === "pending" || item.status === "processing" ? <Button type="button" onClick={() => run(commit((draft, actor) => resolveDeposit(draft, actor, item.id, "successful", note)))}>Confirm</Button> : null}
                    {item.status === "pending" || item.status === "processing" ? <Button type="button" tone="ghost" onClick={() => run(commit((draft, actor) => resolveDeposit(draft, actor, item.id, "failed", note)))}>Fail</Button> : null}
                    {item.status === "successful" ? <Button type="button" tone="danger" onClick={() => run(commit((draft, actor) => resolveDeposit(draft, actor, item.id, "reversed", note)))}>Reverse</Button> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WithdrawalsPage() {
  const { state, admin, allowed, commit, error, saved, run } = useMoney();
  const [reason, setReason] = useState("");
  if (!state || !admin) return null;
  if (!allowed("withdrawals.review")) return <Denied />;
  return (
    <div>
      <PageTitle title="Withdrawals" lede="Review uses the verified bank account. Completion pays from locked available funds and records the fee." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <Area label="Reason for a rejection or failure" value={reason} onChange={(event) => setReason(event.target.value)} />
      <div className="mt-4 space-y-3">
        {state.withdrawals.map((item) => {
          const client = findClient(state, item.clientId);
          const account = seesFullBank(admin.role) ? item.accountNumber : maskAccount(item.accountNumber);
          const next = nextWithdrawal(item.status);
          return (
            <Panel key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.reference} · {client ? clientName(client) : item.clientId}</p>
                  <p className="text-sm text-muted">{item.bankName} · {item.accountName} · {account}</p>
                  <p className="mt-1 text-sm">Amount {naira(item.amount)} · Fee {naira(item.fee)} · Available at request {naira(item.availableAtRequest)}</p>
                  <p className="text-xs text-muted">{dateTime(item.createdAt)} {item.reason}</p>
                </div>
                <Pill status={item.status} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {next.map((status) => <Button key={status} type="button" tone={status === "rejected" || status === "failed" ? "danger" : "primary"} onClick={() => run(commit((draft, actor) => advanceWithdrawal(draft, actor, item.id, status, reason)))}>{status.replaceAll("_", " ")}</Button>)}
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function nextWithdrawal(status: WithdrawalStatus): WithdrawalStatus[] {
  if (status === "pending") return ["under_review", "rejected"];
  if (status === "under_review") return ["approved", "rejected"];
  if (status === "approved") return ["processing", "rejected"];
  if (status === "processing") return ["completed", "failed"];
  return [];
}

export function TransactionsPage() {
  const { state, allowed } = useMoney();
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(() => {
    if (!state) return [];
    return state.transactions.filter((item) => {
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (from && item.createdAt < new Date(`${from}T00:00:00`).getTime()) return false;
      if (to && item.createdAt > new Date(`${to}T23:59:59`).getTime()) return false;
      const client = findClient(state, item.clientId);
      const blob = `${item.reference} ${item.description} ${client ? clientName(client) : ""} ${item.amount}`.toLowerCase();
      return blob.includes(query.trim().toLowerCase());
    });
  }, [state, type, status, query, from, to]);
  if (!state) return null;
  if (!allowed("transactions.view")) return <Denied />;
  return (
    <div>
      <PageTitle title="Transactions" lede="Every row has its own reference. The Client Onboarding Fee is named in full." />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Field label="Client, reference, or amount" value={query} onChange={(event) => setQuery(event.target.value)} />
        <Select label="Type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">All</option>
          {["client_onboarding_fee", "deposit", "withdrawal", "mudarabah_investment", "ijarah_investment", "mudarabah_profit", "ijarah_rental", "refund", "reversal", "fee", "wallet_adjustment"].map((item) => <option key={item} value={item}>{item === "client_onboarding_fee" ? ONBOARDING_FEE_NAME : item.replaceAll("_", " ")}</option>)}
        </Select>
        <Field label="Status" value={status} onChange={(event) => setStatus(event.target.value)} />
        <Field label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <TxTable rows={rows} />
    </div>
  );
}

function TxTable({ rows }: { rows: { id: string; clientId: string; type: string; amount: number; reference: string; status: string; description: string; createdAt: number }[] }) {
  const { state } = useAdmin();
  if (!state) return null;
  if (rows.length === 0) return <Empty title="No transactions" body="Filters can be cleared to see the full ledger." />;
  return (
    <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Reference</th><th>Client</th><th>Type</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
        <tbody>
          {rows.map((item) => {
            const client = findClient(state, item.clientId);
            return (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">{item.reference}<p className="text-xs text-muted">{item.description}</p></td>
                <td>{client ? clientName(client) : item.clientId}</td>
                <td>{item.type === "client_onboarding_fee" ? ONBOARDING_FEE_NAME : item.type.replaceAll("_", " ")}</td>
                <td>{naira(item.amount)}</td>
                <td><Pill status={item.status} /></td>
                <td>{dateTime(item.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReconciliationPage() {
  const { state, allowed } = useMoney();
  if (!state) return null;
  if (!allowed("reconciliation.view")) return <Denied />;
  const issues = exceptionsOf(state);
  return (
    <div>
      <PageTitle title="Reconciliation" lede="Failed payments, duplicate references, unmatched credits, and balance gaps are listed for finance." />
      {issues.length === 0 ? <Empty title="No exceptions" body="Payment records, wallet transactions, and balances currently match." /> : (
        <div className="space-y-3">
          {issues.map((item) => (
            <Panel key={`${item.kind}-${item.id}`}>
              <p className="font-medium">{item.kind}</p>
              <p className="text-sm">{item.detail}</p>
              <p className="text-xs text-muted">{item.reference}</p>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
