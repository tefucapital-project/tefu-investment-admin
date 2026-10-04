import { Link } from "react-router-dom";
import { PageTitle, Panel, Stat } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { naira } from "../lib/format";
import { exceptionsOf, fundedOf, investedOf } from "../lib/selectors";

export function DashboardPage() {
  const { state } = useAdmin();
  if (!state) return null;
  const week = Date.now() - 7 * 86400000;
  const clients = state.clients;
  const kyc = state.kyc;
  const countKyc = (status: string) => kyc.filter((item) => item.status === status).length;
  const walletTotal = state.wallets.reduce((sum, item) => sum + item.balance, 0);
  const deposits = state.deposits.filter((item) => item.status === "successful").reduce((sum, item) => sum + item.amount, 0);
  const withdrawals = state.withdrawals.filter((item) => item.status === "completed").reduce((sum, item) => sum + item.amount, 0);
  const pendingWithdrawals = state.withdrawals.filter((item) => ["pending", "under_review", "approved", "processing"].includes(item.status));
  const invested = clients.reduce((sum, item) => sum + investedOf(state, item.id), 0);
  const distributed = state.distributions.filter((item) => item.status === "completed").reduce((sum, item) => sum + item.investorPool, 0);
  const onboarding = state.clientFees.filter((item) => item.name === "Client Onboarding Fee" && item.status === "successful").reduce((sum, item) => sum + item.amount, 0);
  const mudarabah = state.opportunities.filter((item) => item.kind === "mudarabah");
  const ijarah = state.opportunities.filter((item) => item.kind === "ijarah");
  const live = (kind: "mudarabah" | "ijarah") => state.opportunities.filter((item) => item.kind === kind && ["published", "funding", "fully_funded", "active", "lease_active"].includes(item.status));
  const exceptions = exceptionsOf(state);
  const tasks = [
    ["KYC awaiting review", kyc.filter((item) => item.status === "pending_review").length, "/kyc"],
    ["Withdrawal requests", pendingWithdrawals.length, "/withdrawals"],
    ["Opportunity approvals", state.opportunities.filter((item) => item.status === "pending_review").length, "/mudarabah"],
    ["Distribution approvals", state.distributions.filter((item) => item.status === "pending_approval" || item.status === "draft").length, "/distributions"],
    ["Open tickets", state.tickets.filter((item) => !["resolved", "closed"].includes(item.status)).length, "/support"],
    ["Failed payments", state.deposits.filter((item) => item.status === "failed").length + state.clientFees.filter((item) => item.status === "failed").length, "/deposits"],
    ["Reconciliation exceptions", exceptions.length, "/reconciliation"],
  ] as const;
  return (
    <div>
      <PageTitle title="Operating dashboard" lede="Clients, money, and investments in one queue. Profit and rental are recorded from actual performance." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total clients" value={String(clients.length)} hint={`${clients.filter((item) => item.registeredAt > week).length} new this week`} />
        <Stat label="Active clients" value={String(clients.filter((item) => item.accountStatus === "active").length)} hint={`${clients.filter((item) => item.accountStatus === "suspended").length} suspended`} />
        <Stat label="KYC pending review" value={String(countKyc("pending_review"))} hint={`${countKyc("approved")} approved · ${countKyc("rejected")} rejected · ${countKyc("requires_update")} need an update`} />
        <Stat label="KYC in progress" value={String(countKyc("in_progress"))} hint={`${countKyc("not_started")} not started`} />
        <Stat label="Total wallet balance" value={naira(walletTotal)} />
        <Stat label="Deposits" value={naira(deposits)} hint={`${naira(withdrawals)} withdrawn`} />
        <Stat label="Pending withdrawals" value={String(pendingWithdrawals.length)} />
        <Stat label="Invested on record" value={naira(invested)} hint={`${naira(distributed)} distributed`} />
        <Stat label="Client Onboarding Fees" value={naira(onboarding)} hint="Successful payments only" />
        <Stat label="Pending transactions" value={String(state.deposits.filter((item) => item.status === "pending" || item.status === "processing").length + pendingWithdrawals.length)} />
        <Stat label="Mudarabah live" value={String(live("mudarabah").length)} hint={naira(mudarabah.reduce((sum, item) => sum + fundedOf(state, item), 0))} />
        <Stat label="Ijarah live" value={String(live("ijarah").length)} hint={naira(ijarah.reduce((sum, item) => sum + fundedOf(state, item), 0))} />
      </div>
      <Panel className="mt-6">
        <h2 className="font-serif text-2xl text-forest">Pending actions</h2>
        <ul className="mt-4 divide-y divide-line">
          {tasks.map(([title, count, href]) => (
            <li key={title} className="flex items-center justify-between py-3 text-sm">
              <span>{title}</span>
              <Link className="text-canopy" to={href}>{count}</Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
