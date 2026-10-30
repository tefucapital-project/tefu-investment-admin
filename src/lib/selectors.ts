import { fullName, roundMoney } from "./format";
import type { AppState, Client, DistributionBatch, Holding, KycRecord, Opportunity, Wallet } from "./types";

export function clientName(client: Client) {
  return fullName(client);
}

export function findClient(state: AppState, id: string) {
  return state.clients.find((item) => item.id === id);
}

export function walletOf(state: AppState, clientId: string): Wallet {
  return state.wallets.find((item) => item.clientId === clientId) ?? { clientId, balance: 0, available: 0, locked: 0 };
}

export function kycOf(state: AppState, clientId: string) {
  return state.kyc.find((item) => item.clientId === clientId);
}

export function holdingsOf(state: AppState, clientId: string) {
  return state.holdings.filter((item) => item.clientId === clientId);
}

export function investedOf(state: AppState, clientId: string) {
  return roundMoney(
    state.holdings
      .filter((item) => item.clientId === clientId && item.status !== "suspended")
      .reduce((sum, item) => sum + item.amount, 0),
  );
}

export function recordedCapital(state: AppState, opportunityId: string) {
  return roundMoney(
    state.holdings.filter((item) => item.opportunityId === opportunityId && item.status !== "suspended").reduce((sum, item) => sum + item.amount, 0),
  );
}

export function fundedOf(state: AppState, opportunity: Opportunity) {
  return roundMoney(recordedCapital(state, opportunity.id) + opportunity.outsideCapital);
}

export function remainingOf(state: AppState, opportunity: Opportunity) {
  return roundMoney(Math.max(0, opportunity.target - fundedOf(state, opportunity)));
}

export function investorCount(state: AppState, opportunity: Opportunity) {
  const clients = new Set(state.holdings.filter((item) => item.opportunityId === opportunity.id).map((item) => item.clientId));
  return clients.size + opportunity.outsideInvestors;
}

export function kycChecklist(kyc: KycRecord) {
  const personal = Boolean(kyc.personal.fullName && kyc.personal.dob && kyc.personal.address && kyc.personal.nationality);
  const items = [
    { key: "personal", label: "Personal information", ok: personal },
    { key: "nin", label: "NIN", ok: kyc.nin.status === "verified" },
    { key: "bvn", label: "BVN", ok: kyc.bvn.status === "verified" },
    { key: "bank", label: "Bank account", ok: kyc.bank.status === "verified" },
    { key: "document", label: "Documents", ok: kyc.document.status === "approved" || kyc.document.status === "pending" },
    { key: "identity", label: "Identity verification", ok: kyc.selfie.status === "approved" || kyc.selfie.status === "pending" },
  ];
  const ready = items.every((item) => item.ok);
  const withFinal = [...items, { key: "final", label: "Final review", ok: kyc.status === "approved" }];
  const done = withFinal.filter((item) => item.ok).length;
  return { items: withFinal, ready, percent: Math.round((done / withFinal.length) * 100) };
}

export function sumAmount(rows: { amount: number }[]) {
  return roundMoney(rows.reduce((sum, item) => sum + item.amount, 0));
}

export function distributionsFor(state: AppState, holdingId: string) {
  return state.distributions.filter((batch) => batch.status === "completed" && batch.lines.some((line) => line.holdingId === holdingId));
}

export function lineTotal(batch: DistributionBatch, holdingId?: string) {
  return roundMoney(batch.lines.filter((line) => !holdingId || line.holdingId === holdingId).reduce((sum, line) => sum + line.amount, 0));
}

export function clientMoney(state: AppState, clientId: string) {
  const txs = state.transactions.filter((item) => item.clientId === clientId && item.status === "successful");
  const of = (type: string) => sumAmount(txs.filter((item) => item.type === type && item.direction === "credit"));
  const debits = (type: string) => sumAmount(txs.filter((item) => item.type === type && item.direction === "debit"));
  return {
    depositTotal: of("deposit"),
    withdrawalTotal: debits("withdrawal"),
    distributionTotal: roundMoney(of("mudarabah_profit") + of("ijarah_rental")),
    feeTotal: sumAmount(state.clientFees.filter((item) => item.clientId === clientId && item.status === "successful")),
  };
}

export function inRange(timestamp: number, from: string, to: string) {
  if (from && timestamp < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && timestamp > new Date(`${to}T23:59:59`).getTime()) return false;
  return true;
}

export function exceptionsOf(state: AppState) {
  const issues: { id: string; kind: string; detail: string; reference: string }[] = [];
  for (const wallet of state.wallets) {
    const expected = roundMoney(wallet.available + wallet.locked);
    if (expected !== roundMoney(wallet.balance)) {
      issues.push({ id: wallet.clientId, kind: "Balance discrepancy", detail: "Available plus locked does not equal the wallet balance.", reference: wallet.clientId });
    }
  }
  const counts = new Map<string, number>();
  for (const tx of state.transactions) counts.set(tx.reference, (counts.get(tx.reference) ?? 0) + 1);
  for (const [reference, count] of counts) {
    if (count > 1) issues.push({ id: reference, kind: "Duplicate transaction", detail: `Reference ${reference} appears ${count} times.`, reference });
  }
  for (const deposit of state.deposits) {
    if (deposit.status === "failed") issues.push({ id: deposit.id, kind: "Failed payment", detail: "Deposit failed and did not credit the wallet.", reference: deposit.reference });
    if (deposit.status === "successful" && !state.transactions.some((tx) => tx.reference === deposit.reference && tx.direction === "credit")) {
      issues.push({ id: deposit.id, kind: "Unmatched payment", detail: "Deposit is successful but no wallet credit uses this reference.", reference: deposit.reference });
    }
  }
  for (const fee of state.clientFees) {
    if (fee.status === "failed" || fee.status === "reversed") {
      issues.push({ id: fee.id, kind: fee.status === "failed" ? "Failed payment" : "Reversed transaction", detail: `${fee.name} is ${fee.status}.`, reference: fee.reference });
    }
  }
  for (const withdrawal of state.withdrawals) {
    if (withdrawal.status === "completed" && !state.transactions.some((tx) => tx.reference === withdrawal.reference && tx.direction === "debit")) {
      issues.push({ id: withdrawal.id, kind: "Missing transaction", detail: "Completed withdrawal has no debit with this reference.", reference: withdrawal.reference });
    }
  }
  return issues;
}

export function allocationPreview(state: AppState, opportunity: Opportunity, performanceAmount: number) {
  const holdings = state.holdings.filter((item) => item.opportunityId === opportunity.id && (item.status === "active" || item.status === "matured"));
  const base = holdings.reduce((sum, item) => sum + item.amount, 0);
  const investorPool = opportunity.kind === "mudarabah" ? roundMoney(performanceAmount * (opportunity.investorShare / 100)) : roundMoney(performanceAmount);
  const lines = holdings.map((holding) => ({
    holding,
    amount: base > 0 ? roundMoney(investorPool * (holding.amount / base)) : 0,
  }));
  return { holdings, base, investorPool, lines };
}

export function isLiveOpportunity(status: Opportunity["status"]) {
  return ["published", "funding", "fully_funded", "active", "lease_active"].includes(status);
}

export function upcomingMaturity(holding: Holding, withinDays = 120) {
  return holding.maturityDate > Date.now() && holding.maturityDate < Date.now() + withinDays * 86400000 && (holding.status === "active" || holding.status === "pending");
}
