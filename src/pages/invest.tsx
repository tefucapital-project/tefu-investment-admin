import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Area, Banner, Button, Denied, Empty, Field, PageTitle, Panel, Pill, Select } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { actOnDistribution, actOnOpportunity, addAgreementVersion, prepareDistribution, saveOpportunity, type OpportunityAction, type OpportunityInput } from "../lib/engine";
import { dateTime, naira, shortDate } from "../lib/format";
import { clientName, findClient, fundedOf, investorCount, lineTotal, recordedCapital, remainingOf } from "../lib/selectors";

function useResult() {
  const admin = useAdmin();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  function run(result: { ok: boolean; error?: string }) {
    if (!result.ok) {
      setSaved("");
      setError(result.error ?? "The action did not complete.");
      return false;
    }
    setError("");
    setSaved("Recorded.");
    return true;
  }
  return { ...admin, error, saved, run };
}

export function OpportunityListPage({ kind }: { kind: "mudarabah" | "ijarah" }) {
  const { state, allowed } = useResult();
  if (!state) return null;
  if (!allowed("investments.manage")) return <Denied />;
  const rows = state.opportunities.filter((item) => item.kind === kind);
  const title = kind === "mudarabah" ? "Mudarabah" : "Ijarah";
  return (
    <div>
      <PageTitle title={title} lede={kind === "mudarabah" ? "Profit is shared from actual performance. It is not interest." : "Rental is distributed only when it is collected."} action={<Link className="rounded-full bg-forest px-4 py-2 text-sm text-gold2" to={`/${kind}/new`}>Create {title}</Link>} />
      <div className="grid gap-3">
        {rows.map((item) => (
          <Panel key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link className="font-medium text-canopy" to={`/${kind}/${item.id}`}>{item.name}</Link>
                <p className="text-sm text-muted">{item.summary}</p>
                <p className="mt-2 text-sm">Funded {naira(fundedOf(state, item))} of {naira(item.target)} · Remaining {naira(remainingOf(state, item))} · {investorCount(state, item)} investors</p>
              </div>
              <Pill status={item.status} />
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export function OpportunityFormPage({ kind }: { kind: "mudarabah" | "ijarah" }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { state, allowed, commit, error, run } = useResult();
  const existing = state?.opportunities.find((item) => item.id === id);
  const [form, setForm] = useState<OpportunityInput>(() => existing ? toInput(existing) : blank(kind));
  if (!state) return null;
  if (!allowed("investments.manage")) return <Denied />;
  function set<K extends keyof OpportunityInput>(key: K, value: OpportunityInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <div>
      <PageTitle title={existing ? `Edit ${existing.name}` : `New ${kind}`} lede="A draft is not visible to clients. Publishing waits for approval." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        const result = commit((draft, actor) => saveOpportunity(draft, actor, { ...form, kind }, existing?.id ?? ""));
        if (run(result) && result.ok && result.data) navigate(`/${kind}/${result.data.id}`);
      }}>
        <Field label="Name" value={form.name} onChange={(event) => set("name", event.target.value)} />
        <Field label="Summary" value={form.summary} onChange={(event) => set("summary", event.target.value)} />
        <Area label="Description" value={form.description} onChange={(event) => set("description", event.target.value)} />
        <Area label={kind === "mudarabah" ? "Business or project" : "Asset description"} value={form.project} onChange={(event) => set("project", event.target.value)} />
        <Field label="Minimum" value={form.min} onChange={(event) => set("min", Number(event.target.value))} />
        <Field label="Maximum" value={form.max} onChange={(event) => set("max", Number(event.target.value))} />
        <Field label="Target" value={form.target} onChange={(event) => set("target", Number(event.target.value))} />
        <Field label="Duration in days" value={form.durationDays} onChange={(event) => set("durationDays", Number(event.target.value))} />
        <Field label="Start date" type="date" value={form.startDate} onChange={(event) => set("startDate", event.target.value)} />
        <Field label="Maturity date" type="date" value={form.maturityDate} onChange={(event) => set("maturityDate", event.target.value)} />
        {kind === "mudarabah" ? (
          <>
            <Field label="Investor profit share %" value={form.investorShare} onChange={(event) => set("investorShare", Number(event.target.value))} />
            <Field label="Manager profit share %" value={form.managerShare} onChange={(event) => set("managerShare", Number(event.target.value))} />
          </>
        ) : (
          <>
            <Field label="Asset type" value={form.assetType} onChange={(event) => set("assetType", event.target.value)} />
            <Field label="Asset value" value={form.assetValue} onChange={(event) => set("assetValue", Number(event.target.value))} />
            <Field label="Lease structure" value={form.leaseStructure} onChange={(event) => set("leaseStructure", event.target.value)} />
            <Field label="Rental schedule" value={form.rentalSchedule} onChange={(event) => set("rentalSchedule", event.target.value)} />
            <Area label="Takaful" value={form.takaful} onChange={(event) => set("takaful", event.target.value)} />
          </>
        )}
        <Area label="Risk" value={form.risk} onChange={(event) => set("risk", event.target.value)} />
        <Area label="Terms" value={form.terms} onChange={(event) => set("terms", event.target.value)} />
        <Area label="Shariah structure" value={form.shariah} onChange={(event) => set("shariah", event.target.value)} />
        <div className="self-end"><Button type="submit">Save draft</Button></div>
      </form>
    </div>
  );
}

function blank(kind: "mudarabah" | "ijarah"): OpportunityInput {
  return {
    kind,
    name: "",
    summary: "",
    description: "",
    project: "",
    min: kind === "mudarabah" ? 50000 : 25000,
    max: 2000000,
    target: 10000000,
    durationDays: 180,
    startDate: "",
    maturityDate: "",
    investorShare: kind === "mudarabah" ? 70 : 100,
    managerShare: kind === "mudarabah" ? 30 : 0,
    risk: "",
    terms: "",
    shariah: "",
    assetType: "",
    assetValue: 0,
    leaseStructure: "",
    rentalSchedule: "",
    takaful: "",
  };
}

function toInput(item: OpportunityInput & { kind: "mudarabah" | "ijarah" }): OpportunityInput {
  return blank(item.kind) && {
    kind: item.kind,
    name: item.name,
    summary: item.summary,
    description: item.description,
    project: item.project,
    min: item.min,
    max: item.max,
    target: item.target,
    durationDays: item.durationDays,
    startDate: item.startDate,
    maturityDate: item.maturityDate,
    investorShare: item.investorShare,
    managerShare: item.managerShare,
    risk: item.risk,
    terms: item.terms,
    shariah: item.shariah,
    assetType: item.assetType,
    assetValue: item.assetValue,
    leaseStructure: item.leaseStructure,
    rentalSchedule: item.rentalSchedule,
    takaful: item.takaful,
  };
}

export function OpportunityDetailPage() {
  const { id = "" } = useParams();
  const { state, allowed, commit, error, saved, run } = useResult();
  const [reason, setReason] = useState("");
  if (!state) return null;
  if (!allowed("investments.manage") && !allowed("investments.approve") && !allowed("investments.publish")) return <Denied />;
  const item = state.opportunities.find((row) => row.id === id);
  if (!item) return <Empty title="Opportunity not found" body="Return to the list." />;
  const holdings = state.holdings.filter((row) => row.opportunityId === item.id);
  const actions = actionsFor(item.status, item.kind, allowed);
  return (
    <div className="space-y-4">
      <PageTitle title={item.name} lede={item.summary} action={item.status === "draft" ? <Link className="text-sm text-canopy" to={`/${item.kind}/${item.id}/edit`}>Edit draft</Link> : null} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <div className="flex flex-wrap gap-2"><Pill status={item.status} /><Pill status={item.kind} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel><p className="text-xs text-muted">Target</p><p>{naira(item.target)}</p></Panel>
        <Panel><p className="text-xs text-muted">Funded</p><p>{naira(fundedOf(state, item))}</p></Panel>
        <Panel><p className="text-xs text-muted">Remaining</p><p>{naira(remainingOf(state, item))}</p></Panel>
        <Panel><p className="text-xs text-muted">Recorded capital</p><p>{naira(recordedCapital(state, item.id))}</p></Panel>
        <Panel><p className="text-xs text-muted">Investors</p><p>{investorCount(state, item)}</p></Panel>
        <Panel><p className="text-xs text-muted">Maturity</p><p>{shortDate(item.maturityDate)}</p></Panel>
      </div>
      <Panel>
        <p className="text-sm">{item.description}</p>
        <p className="mt-2 text-sm">Minimum {naira(item.min)} · Maximum {naira(item.max)} · {item.durationDays} days</p>
        {item.kind === "mudarabah" ? <p className="text-sm">Profit share: investor {item.investorShare}% · manager {item.managerShare}% of actual profit.</p> : <p className="text-sm">{item.assetType} · Asset value {naira(item.assetValue)} · {item.leaseStructure}</p>}
        <p className="mt-2 text-sm">{item.kind === "ijarah" ? item.rentalSchedule : item.terms}</p>
        <p className="mt-2 text-sm">{item.shariah}</p>
        <p className="mt-2 text-sm text-muted">{item.risk}</p>
        {item.takaful ? <p className="mt-2 text-sm">{item.takaful}</p> : null}
      </Panel>
      <Panel>
        <h2 className="font-medium">Recorded investments</h2>
        {holdings.length === 0 ? <p className="mt-2 text-sm text-muted">No client capital is recorded on this opportunity yet.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {holdings.map((holding) => {
              const client = findClient(state, holding.clientId);
              return <li key={holding.id}><Link className="text-canopy" to={`/investments/${holding.id}`}>{holding.reference}</Link> · {client ? clientName(client) : holding.clientId} · {naira(holding.amount)} · {holding.status}</li>;
            })}
          </ul>
        )}
      </Panel>
      {actions.length > 0 ? (
        <Panel>
          <Field label="Reason, required for suspend or cancel" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => <Button key={action} type="button" onClick={() => run(commit((draft, actor) => actOnOpportunity(draft, actor, item.id, action, reason)))}>{action.replaceAll("_", " ")}</Button>)}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function actionsFor(status: string, kind: "mudarabah" | "ijarah", allowed: (permission: "investments.manage" | "investments.approve" | "investments.publish") => boolean): OpportunityAction[] {
  const actions: OpportunityAction[] = [];
  if (allowed("investments.manage") && status === "draft") actions.push("submit");
  if (allowed("investments.approve") && status === "pending_review") actions.push("approve");
  if (allowed("investments.publish") && status === "approved") actions.push("publish");
  if (allowed("investments.publish") && (status === "published" || status === "funding")) actions.push("unpublish");
  if (allowed("investments.manage") && status === "published") actions.push("funding");
  if (allowed("investments.manage") && status === "funding") actions.push("fully_funded", "active");
  if (allowed("investments.manage") && status === "fully_funded") actions.push("active");
  if (allowed("investments.manage") && kind === "ijarah" && (status === "fully_funded" || status === "active")) actions.push("lease_active");
  if (allowed("investments.manage") && (status === "active" || status === "lease_active")) actions.push("matured");
  if (allowed("investments.manage") && status === "matured") actions.push("completed");
  if (allowed("investments.manage") && !["completed", "cancelled", "draft"].includes(status)) actions.push("suspended", "cancelled");
  if (allowed("investments.manage") && status === "suspended") actions.push("resume");
  return actions;
}

export function HoldingsPage() {
  const { state, allowed } = useResult();
  const [tab, setTab] = useState("all");
  if (!state) return null;
  if (!allowed("investments.manage")) return <Denied />;
  const rows = state.holdings.filter((item) => {
    if (tab === "all") return true;
    if (tab === "mudarabah" || tab === "ijarah") return state.opportunities.find((opp) => opp.id === item.opportunityId)?.kind === tab;
    return item.status === tab;
  });
  return (
    <div>
      <PageTitle title="Investments" lede="Client holdings across Mudarabah and Ijarah." />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "mudarabah", "ijarah", "active", "pending", "completed", "matured", "suspended"].map((item) => <button key={item} type="button" className={`rounded-full px-3 py-1.5 text-xs capitalize ${tab === item ? "bg-forest text-gold2" : "bg-paper"}`} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">ID</th><th>Client</th><th>Opportunity</th><th>Amount</th><th>Status</th><th>Maturity</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const client = findClient(state, item.clientId);
              const opp = state.opportunities.find((row) => row.id === item.opportunityId);
              const received = state.distributions.filter((batch) => batch.status === "completed").reduce((sum, batch) => sum + lineTotal(batch, item.id), 0);
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="text-canopy" to={`/investments/${item.id}`}>{item.reference}</Link></td>
                  <td>{client ? clientName(client) : item.clientId}</td>
                  <td>{opp?.name}</td>
                  <td>{naira(item.amount)}<p className="text-xs text-muted">Distributed {naira(received)}</p></td>
                  <td><Pill status={item.status} /></td>
                  <td>{shortDate(item.maturityDate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HoldingDetailPage() {
  const { holdingId = "" } = useParams();
  const { state, allowed } = useResult();
  if (!state) return null;
  if (!allowed("investments.manage") && !allowed("clients.view")) return <Denied />;
  const holding = state.holdings.find((item) => item.id === holdingId);
  if (!holding) return <Empty title="Investment not found" body="Return to the investment list." />;
  const client = findClient(state, holding.clientId);
  const opp = state.opportunities.find((item) => item.id === holding.opportunityId);
  const lines = state.distributions.flatMap((batch) => batch.lines.filter((line) => line.holdingId === holding.id).map((line) => ({ ...line, status: batch.status, kind: batch.kind })));
  return (
    <div className="space-y-4">
      <PageTitle title={opp?.name ?? "Investment"} lede={`${holding.reference} · ${client ? clientName(client) : holding.clientId}`} />
      <Panel>
        <p className="text-sm">Type {opp?.kind} · Amount {naira(holding.amount)} · Fee {naira(holding.fee)}</p>
        <p className="text-sm">Invested {shortDate(holding.investedAt)} · Start {shortDate(holding.startDate)} · Maturity {shortDate(holding.maturityDate)}</p>
        <div className="mt-2"><Pill status={holding.status} /></div>
      </Panel>
      <Panel>
        <h2 className="font-medium">Distributions</h2>
        {lines.length === 0 ? <p className="mt-2 text-sm text-muted">No distribution has been recorded for this holding.</p> : lines.map((line) => <p key={line.id} className="mt-2 text-sm">{line.reference} · {naira(line.amount)} · {line.kind.replaceAll("_", " ")} · {line.status}</p>)}
      </Panel>
    </div>
  );
}

export function DistributionsPage() {
  const { state, allowed } = useResult();
  if (!state) return null;
  if (!allowed("distributions.prepare") && !allowed("distributions.decide")) return <Denied />;
  return (
    <div>
      <PageTitle title="Distributions" lede="Mudarabah profit and Ijarah rental are prepared from recorded performance, then approved and paid." action={allowed("distributions.prepare") ? <Link className="rounded-full bg-forest px-4 py-2 text-sm text-gold2" to="/distributions/new">Prepare distribution</Link> : null} />
      <div className="space-y-3">
        {state.distributions.map((item) => {
          const opp = state.opportunities.find((row) => row.id === item.opportunityId);
          return (
            <Panel key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link className="font-medium text-canopy" to={`/distributions/${item.id}`}>{opp?.name}</Link>
                  <p className="text-sm text-muted">{item.performanceNote}</p>
                  <p className="text-sm">Performance {naira(item.performanceAmount)} · Client pool {naira(item.investorPool)}</p>
                </div>
                <Pill status={item.status} />
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

export function DistributionFormPage() {
  const navigate = useNavigate();
  const { state, allowed, commit, error, run } = useResult();
  const [opportunityId, setOpportunityId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!state) return null;
  if (!allowed("distributions.prepare")) return <Denied />;
  const live = state.opportunities.filter((item) => ["funding", "fully_funded", "active", "lease_active", "matured"].includes(item.status));
  return (
    <div>
      <PageTitle title="Prepare distribution" lede="Enter the profit or rent actually collected. The client pool follows the agreement. Nothing here is interest." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <form className="grid max-w-2xl gap-3" onSubmit={(event) => {
        event.preventDefault();
        const result = commit((draft, actor) => prepareDistribution(draft, actor, opportunityId, Number(amount), note));
        if (run(result) && result.ok && result.data) navigate(`/distributions/${result.data.id}`);
      }}>
        <Select label="Opportunity" value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)}>
          <option value="">Choose</option>
          {live.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Field label="Profit or rent collected" value={amount} onChange={(event) => setAmount(event.target.value)} />
        <Area label="Performance note" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button type="submit">Save draft</Button>
      </form>
    </div>
  );
}

export function DistributionDetailPage() {
  const { id = "" } = useParams();
  const { state, admin, allowed, commit, error, saved, run } = useResult();
  const [reason, setReason] = useState("");
  if (!state || !admin) return null;
  if (!allowed("distributions.prepare") && !allowed("distributions.decide")) return <Denied />;
  const batch = state.distributions.find((item) => item.id === id);
  const opp = batch ? state.opportunities.find((item) => item.id === batch.opportunityId) : undefined;
  if (!batch || !opp) return <Empty title="Distribution not found" body="Return to the distribution list." />;
  return (
    <div className="space-y-4">
      <PageTitle title={opp.name} lede={batch.performanceNote} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <Pill status={batch.status} />
      <Panel>
        <p className="text-sm">Collected {naira(batch.performanceAmount)} · Client pool {naira(batch.investorPool)}</p>
        <p className="text-sm text-muted">{batch.kind === "mudarabah_profit" ? "Investor share of actual profit. The manager share is not credited to clients." : "Rent collected, split by recorded capital."}</p>
        <ul className="mt-3 space-y-2 text-sm">
          {batch.lines.map((line) => {
            const client = findClient(state, line.clientId);
            return <li key={line.id}>{client ? clientName(client) : line.clientId} · {naira(line.amount)} · {line.reference}</li>;
          })}
        </ul>
      </Panel>
      <Panel>
        <Field label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        <div className="mt-3 flex flex-wrap gap-2">
          {batch.status === "draft" && allowed("distributions.prepare") ? <Button type="button" onClick={() => run(commit((draft, actor) => actOnDistribution(draft, actor, batch.id, "submit", reason)))}>Submit for approval</Button> : null}
          {batch.status === "pending_approval" && allowed("distributions.decide") ? <Button type="button" onClick={() => run(commit((draft, actor) => actOnDistribution(draft, actor, batch.id, "approve", reason)))}>Approve</Button> : null}
          {batch.status === "pending_approval" && allowed("distributions.decide") ? <Button type="button" tone="danger" onClick={() => run(commit((draft, actor) => actOnDistribution(draft, actor, batch.id, "reject", reason)))}>Reject</Button> : null}
          {batch.status === "approved" && allowed("distributions.decide") ? <Button type="button" onClick={() => run(commit((draft, actor) => actOnDistribution(draft, actor, batch.id, "execute", reason)))}>Execute</Button> : null}
          {batch.status === "completed" && allowed("distributions.decide") ? <Button type="button" tone="ghost" onClick={() => run(commit((draft, actor) => actOnDistribution(draft, actor, batch.id, "reverse", reason)))}>Reverse</Button> : null}
        </div>
      </Panel>
    </div>
  );
}

export function AgreementsPage() {
  const { state, allowed, commit, error, saved, run } = useResult();
  const [type, setType] = useState("mudarabah");
  const [name, setName] = useState("Mudarabah participation agreement");
  const [body, setBody] = useState("");
  if (!state) return null;
  if (!allowed("investments.manage")) return <Denied />;
  return (
    <div>
      <PageTitle title="Agreements" lede="New versions retire the current one. Older versions stay on record." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <div className="space-y-3">
        {state.agreements.map((item) => (
          <Panel key={item.id}>
            <div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{item.name} · v{item.version}</p><Pill status={item.status} /></div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.body}</p>
            <p className="mt-2 text-xs text-muted">Effective {dateTime(item.effectiveAt)}</p>
          </Panel>
        ))}
      </div>
      <form className="mt-4 grid max-w-2xl gap-3" onSubmit={(event) => { event.preventDefault(); run(commit((draft, actor) => addAgreementVersion(draft, actor, type, name, body))); }}>
        <Select label="Type" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="mudarabah">Mudarabah</option>
          <option value="ijarah">Ijarah</option>
        </Select>
        <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Area label="Terms" value={body} onChange={(event) => setBody(event.target.value)} />
        <Button type="submit">Add version</Button>
      </form>
    </div>
  );
}
