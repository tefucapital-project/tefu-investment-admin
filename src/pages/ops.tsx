import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, Banner, Button, Denied, Empty, Field, PageTitle, Panel, Pill, Select } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { recordExport, sendNotification, updateTicket } from "../lib/engine";
import { csvDownload, dateTime, naira, shortDate } from "../lib/format";
import { ONBOARDING_FEE_NAME } from "../lib/labels";
import { clientName, findClient, inRange, investedOf } from "../lib/selectors";
import type { TicketStatus } from "../lib/types";

export function NotificationsPage() {
  const { state, allowed, commit } = useAdmin();
  const [clientId, setClientId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [category, setCategory] = useState("account");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  if (!state) return null;
  if (!allowed("notifications.send")) return <Denied />;
  return (
    <div>
      <PageTitle title="Notifications" lede="Send a notice to one client, or to every client recorded on an investment." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {saved ? <Banner tone="ok">{saved}</Banner> : null}
      <form className="grid max-w-2xl gap-3" onSubmit={(event) => {
        event.preventDefault();
        const result = commit((draft, actor) => sendNotification(draft, actor, { clientId, opportunityId, category, title, message }));
        if (!result.ok) {
          setSaved("");
          setError(result.error);
          return;
        }
        setError("");
        setSaved(result.data ? `Sent to ${result.data.count} client${result.data.count === 1 ? "" : "s"}.` : "Sent.");
      }}>
        <Select label="Client" value={clientId} onChange={(event) => { setClientId(event.target.value); setOpportunityId(""); }}>
          <option value="">None</option>
          {state.clients.map((item) => <option key={item.id} value={item.id}>{clientName(item)}</option>)}
        </Select>
        <Select label="Or an investment" value={opportunityId} onChange={(event) => { setOpportunityId(event.target.value); setClientId(""); }}>
          <option value="">None</option>
          {state.opportunities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select label="Category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {["account", "payments", "investments", "security"].map((item) => <option key={item}>{item}</option>)}
        </Select>
        <Field label="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
        <Area label="Message" value={message} onChange={(event) => setMessage(event.target.value)} />
        <Button type="submit">Send</Button>
      </form>
      <Panel className="mt-6">
        <h2 className="font-medium">Recent notices</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {state.notifications.slice(0, 12).map((item) => {
            const client = findClient(state, item.clientId);
            return <li key={item.id}>{dateTime(item.createdAt)} · {client ? clientName(client) : item.clientId} · {item.title}</li>;
          })}
        </ul>
      </Panel>
    </div>
  );
}

export function SupportPage() {
  const { state, allowed } = useAdmin();
  if (!state) return null;
  if (!allowed("tickets.manage")) return <Denied />;
  return (
    <div>
      <PageTitle title="Support" lede="Reply to the client, leave an internal note, and move the ticket through the queue." />
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Ticket</th><th>Client</th><th>Priority</th><th>Status</th><th>Opened</th></tr></thead>
          <tbody>
            {state.tickets.map((item) => {
              const client = findClient(state, item.clientId);
              const assignee = state.admins.find((admin) => admin.id === item.assignedTo);
              return (
                <tr key={item.id} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="text-canopy" to={`/support/${item.id}`}>{item.subject}</Link><p className="text-xs text-muted">{item.category} {assignee ? `· ${assignee.name}` : ""}</p></td>
                  <td>{client ? clientName(client) : item.clientId}</td>
                  <td className="capitalize">{item.priority}</td>
                  <td><Pill status={item.status} /></td>
                  <td>{dateTime(item.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TicketPage() {
  const { ticketId = "" } = useParams();
  const { state, allowed, commit } = useAdmin();
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState("");
  const [error, setError] = useState("");
  if (!state) return null;
  if (!allowed("tickets.manage")) return <Denied />;
  const ticket = state.tickets.find((item) => item.id === ticketId);
  const client = ticket ? findClient(state, ticket.clientId) : undefined;
  if (!ticket || !client) return <Empty title="Ticket not found" body="Return to the support queue." />;
  function save(patch: Parameters<typeof updateTicket>[3]) {
    const result = commit((draft, actor) => updateTicket(draft, actor, ticketId, patch));
    setError(result.ok ? "" : result.error);
    if (result.ok) {
      setReply("");
      setInternal("");
    }
  }
  return (
    <div className="space-y-4">
      <PageTitle title={ticket.subject} lede={`${clientName(client)} · ${ticket.category}`} action={<Link className="text-sm text-canopy" to={`/clients/${client.id}`}>Client profile</Link>} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="flex flex-wrap gap-2"><Pill status={ticket.status} /><span className="text-sm capitalize">{ticket.priority} priority</span></div>
      <Panel>
        <ul className="space-y-3 text-sm">
          {ticket.messages.map((item) => (
            <li key={item.id} className={item.kind === "internal" ? "rounded-2xl bg-cream px-3 py-2" : ""}>
              <p className="text-xs text-muted">{item.author} · {item.kind} · {dateTime(item.at)}</p>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Status" value={ticket.status} onChange={(event) => save({ status: event.target.value as TicketStatus })}>
          {["open", "assigned", "in_progress", "waiting_for_client", "resolved", "closed"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </Select>
        <Select label="Priority" value={ticket.priority} onChange={(event) => save({ priority: event.target.value as "low" | "normal" | "high" })}>
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </Select>
        <Select label="Assign" value={ticket.assignedTo} onChange={(event) => save({ assignedTo: event.target.value })}>
          <option value="">Unassigned</option>
          {state.admins.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); save({ reply, internal }); }}>
        <Area label="Reply to the client" value={reply} onChange={(event) => setReply(event.target.value)} />
        <Area label="Internal note" value={internal} onChange={(event) => setInternal(event.target.value)} />
        <Button type="submit">Save ticket</Button>
      </form>
    </div>
  );
}

export function ReportsPage() {
  const { state, allowed, commit } = useAdmin();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  if (!state) return null;
  if (!allowed("reports.view")) return <Denied />;
  const clients = state.clients.filter((item) => inRange(item.registeredAt, from, to));
  const deposits = state.deposits.filter((item) => item.status === "successful" && inRange(item.createdAt, from, to));
  const withdrawals = state.withdrawals.filter((item) => item.status === "completed" && inRange(item.createdAt, from, to));
  const fees = state.clientFees.filter((item) => item.status === "successful" && inRange(item.createdAt, from, to));
  const onboarding = fees.filter((item) => item.name === ONBOARDING_FEE_NAME);
  const distributions = state.distributions.filter((item) => item.status === "completed" && item.executedAt && inRange(item.executedAt, from, to));
  const rows = [
    ["New clients", String(clients.length)],
    ["Active clients", String(state.clients.filter((item) => item.accountStatus === "active").length)],
    ["Suspended clients", String(state.clients.filter((item) => item.accountStatus === "suspended").length)],
    ["Deposits", naira(deposits.reduce((sum, item) => sum + item.amount, 0))],
    ["Withdrawals", naira(withdrawals.reduce((sum, item) => sum + item.amount, 0))],
    ["Fees", naira(fees.reduce((sum, item) => sum + item.amount, 0))],
    [ONBOARDING_FEE_NAME, naira(onboarding.reduce((sum, item) => sum + item.amount, 0))],
    ["Wallet balances", naira(state.wallets.reduce((sum, item) => sum + item.balance, 0))],
    ["Transactions", String(state.transactions.filter((item) => inRange(item.createdAt, from, to)).length)],
    ["Mudarabah invested", naira(state.holdings.filter((item) => state.opportunities.find((opp) => opp.id === item.opportunityId)?.kind === "mudarabah").reduce((sum, item) => sum + item.amount, 0))],
    ["Ijarah invested", naira(state.holdings.filter((item) => state.opportunities.find((opp) => opp.id === item.opportunityId)?.kind === "ijarah").reduce((sum, item) => sum + item.amount, 0))],
    ["Distributions", naira(distributions.reduce((sum, item) => sum + item.investorPool, 0))],
    ["Open KYC", String(state.kyc.filter((item) => item.status === "pending_review" || item.status === "in_progress").length)],
    ["Open tickets", String(state.tickets.filter((item) => !["resolved", "closed"].includes(item.status)).length)],
  ];
  return (
    <div>
      <PageTitle title="Reports" lede="Client, financial, investment, distribution, and operational totals for the selected dates." action={allowed("reports.export") ? <Button type="button" onClick={() => {
        const result = commit((draft, actor) => recordExport(draft, actor, "Operating report"));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        csvDownload(`tefu-report-${shortDate(Date.now()).replaceAll(" ", "-")}.csv`, [["Metric", "Value"], ...rows]);
      }}>Export</Button> : null} />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Field label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <Field label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(([label, value]) => <Panel key={label}><p className="text-xs text-muted">{label}</p><p className="text-xl">{value}</p></Panel>)}
      </div>
      <Panel className="mt-4">
        <h2 className="font-medium">Clients in range</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {clients.map((item) => <li key={item.id}>{clientName(item)} · {item.accountStatus} · invested {naira(investedOf(state, item.id))}</li>)}
        </ul>
      </Panel>
    </div>
  );
}
