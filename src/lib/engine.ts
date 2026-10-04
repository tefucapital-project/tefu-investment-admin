import { deviceLabel, digest, oneTimeCode, reference, roundMoney, uid } from "./format";
import { ONBOARDING_FEE_NAME } from "./labels";
import { can } from "./permissions";
import { allocationPreview, findClient, kycChecklist, kycOf } from "./selectors";
import type { ActionResult, AdminUser, AppState, DocStatus, FeeSetting, Opportunity, PayStatus, Role, Settings, TxType, WithdrawalStatus } from "./types";

const LOCK_MS = 2 * 60 * 1000;

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

function ok<T = undefined>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

function audit(state: AppState, admin: AdminUser, action: string, target: string, previousValue: string, newValue: string, reason = "") {
  state.audit.unshift({
    id: uid(),
    adminId: admin.id,
    adminName: admin.name,
    role: admin.role,
    action,
    target,
    previousValue,
    newValue,
    reason,
    createdAt: Date.now(),
    session: deviceLabel(),
  });
}

function notify(state: AppState, clientId: string, category: string, title: string, message: string, adminId: string) {
  state.notifications.unshift({ id: uid(), clientId, category, title, message, createdAt: Date.now(), createdBy: adminId });
}

function walletRow(state: AppState, clientId: string) {
  return state.wallets.find((item) => item.clientId === clientId) ?? null;
}

function sync(wallet: { balance: number; available: number; locked: number }) {
  wallet.balance = roundMoney(wallet.available + wallet.locked);
}

function addTx(state: AppState, input: { clientId: string; type: TxType; amount: number; reference: string; description: string; direction: "credit" | "debit" | "neutral" }) {
  state.transactions.unshift({ id: uid(), status: "successful", createdAt: Date.now(), ...input });
}

function openSession(state: AppState, admin: AdminUser) {
  const session = {
    id: uid(),
    adminId: admin.id,
    device: deviceLabel(),
    createdAt: Date.now(),
    expiresAt: Date.now() + state.settings.sessionMinutes * 60 * 1000,
  };
  state.sessions.unshift(session);
  admin.lastLogin = Date.now();
  admin.failedLogins = 0;
  admin.lockedUntil = 0;
  return session;
}

export async function loginAdmin(state: AppState, email: string, password: string): Promise<ActionResult<{ needsCode: boolean; preview: string; sessionId: string }>> {
  const admin = state.admins.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
  if (!admin || admin.status !== "active") return fail("Those sign-in details were not recognised.");
  if (admin.lockedUntil > Date.now()) return fail("This account is temporarily locked. Try again in a few minutes.");
  const hash = await digest(admin.passwordSalt, password);
  if (hash !== admin.passwordHash) {
    admin.failedLogins += 1;
    if (admin.failedLogins >= 5) {
      admin.failedLogins = 0;
      admin.lockedUntil = Date.now() + LOCK_MS;
      audit(state, admin, "Login locked", admin.email, "", "Locked", "Five unsuccessful attempts");
    }
    return fail("Those sign-in details were not recognised.");
  }
  if (admin.twoFactor || state.settings.require2fa) {
    const salt = uid();
    const preview = oneTimeCode();
    state.otp = { adminId: admin.id, salt, hash: await digest(salt, preview), expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0, preview };
    return ok({ needsCode: true, preview, sessionId: "" });
  }
  const session = openSession(state, admin);
  audit(state, admin, "Admin login", admin.email, "", "Signed in");
  return ok({ needsCode: false, preview: "", sessionId: session.id });
}

export async function verifyAdminCode(state: AppState, code: string): Promise<ActionResult<{ sessionId: string }>> {
  const otp = state.otp;
  if (!otp) return fail("Request a new code.");
  if (otp.expiresAt < Date.now()) {
    state.otp = null;
    return fail("That code has expired.");
  }
  const admin = state.admins.find((item) => item.id === otp.adminId);
  if (!admin || admin.status !== "active") return fail("This admin account cannot sign in.");
  const hash = await digest(otp.salt, code.trim());
  if (hash !== otp.hash) {
    otp.attempts += 1;
    if (otp.attempts >= 5) state.otp = null;
    return fail(otp.attempts >= 5 ? "Too many incorrect codes. Sign in again." : "That code is not correct.");
  }
  state.otp = null;
  const session = openSession(state, admin);
  audit(state, admin, "Admin login", admin.email, "", "Signed in with a second factor");
  return ok({ sessionId: session.id });
}

export function logoutAdmin(state: AppState, admin: AdminUser, sessionId: string) {
  state.sessions = state.sessions.filter((item) => item.id !== sessionId);
  audit(state, admin, "Admin logout", admin.email, "Signed in", "Signed out");
  return ok();
}

export function endOtherSessions(state: AppState, admin: AdminUser, sessionId: string) {
  state.sessions = state.sessions.filter((item) => item.adminId !== admin.id || item.id === sessionId);
  audit(state, admin, "Sessions ended", admin.email, "", "Other devices signed out");
  return ok();
}

export function applyPassword(state: AppState, admin: AdminUser, sessionId: string, salt: string, hash: string) {
  admin.passwordSalt = salt;
  admin.passwordHash = hash;
  state.sessions = state.sessions.filter((item) => item.adminId !== admin.id || item.id === sessionId);
  audit(state, admin, "Password changed", admin.email, "Hidden", "Hidden");
  return ok();
}

export function setTwoFactor(state: AppState, admin: AdminUser, enabled: boolean) {
  if (!enabled && state.settings.require2fa) return fail("Platform settings require a second factor.");
  const previous = admin.twoFactor ? "On" : "Off";
  admin.twoFactor = enabled;
  audit(state, admin, "Two-factor setting", admin.email, previous, enabled ? "On" : "Off");
  return ok();
}

export function createAdminUser(state: AppState, actor: AdminUser, input: { name: string; email: string; role: Role; passwordSalt: string; passwordHash: string }) {
  if (!can(actor.role, "admins.manage")) return fail("Your role cannot manage admin accounts.");
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim() || !email.includes("@")) return fail("Enter a name and a valid email.");
  if (state.admins.some((item) => item.email === email)) return fail("That email is already an admin.");
  state.admins.unshift({
    id: uid(),
    name: input.name.trim(),
    email,
    role: input.role,
    status: "active",
    passwordSalt: input.passwordSalt,
    passwordHash: input.passwordHash,
    twoFactor: false,
    lastLogin: null,
    createdAt: Date.now(),
    failedLogins: 0,
    lockedUntil: 0,
  });
  audit(state, actor, "Admin created", email, "", input.role);
  return ok();
}

export function assignRole(state: AppState, actor: AdminUser, adminId: string, role: Role) {
  if (!can(actor.role, "admins.manage")) return fail("Your role cannot assign roles.");
  const target = state.admins.find((item) => item.id === adminId);
  if (!target) return fail("Admin not found.");
  if (target.role === "super_admin" && role !== "super_admin" && activeSupers(state, target.id).length === 0) {
    return fail("Keep at least one active Super Admin.");
  }
  const previous = target.role;
  target.role = role;
  audit(state, actor, "Role changed", target.email, previous, role);
  return ok();
}

export function setAdminStatus(state: AppState, actor: AdminUser, adminId: string, status: "active" | "suspended", reason: string) {
  if (!can(actor.role, "admins.manage")) return fail("Your role cannot change admin access.");
  if (reason.trim().length < 8) return fail("Record a reason.");
  const target = state.admins.find((item) => item.id === adminId);
  if (!target) return fail("Admin not found.");
  if (status === "suspended" && target.role === "super_admin" && activeSupers(state, target.id).length === 0) {
    return fail("Keep at least one active Super Admin.");
  }
  const previous = target.status;
  target.status = status;
  if (status === "suspended") state.sessions = state.sessions.filter((item) => item.adminId !== target.id);
  audit(state, actor, status === "suspended" ? "Admin suspended" : "Admin reactivated", target.email, previous, status, reason.trim());
  return ok();
}

function activeSupers(state: AppState, exceptId: string) {
  return state.admins.filter((item) => item.id !== exceptId && item.role === "super_admin" && item.status === "active");
}

export function setClientStatus(state: AppState, admin: AdminUser, clientId: string, next: "active" | "suspended", reason: string) {
  if (!can(admin.role, "clients.manage")) return fail("Your role cannot change a client account.");
  if (reason.trim().length < 8) return fail("Record a reason for this status change.");
  const client = findClient(state, clientId);
  const kyc = kycOf(state, clientId);
  if (!client || !kyc) return fail("Client not found.");
  if (next === "suspended" && client.accountStatus !== "active") return fail("Only an active account can be suspended.");
  if (next === "active") {
    if (kyc.status !== "approved") return fail("Activate the account only after KYC is approved.");
    if (client.accountStatus !== "suspended" && client.accountStatus !== "kyc_approved") return fail("This account cannot be activated from its current status.");
  }
  const previous = client.accountStatus;
  client.accountStatus = next;
  if (next === "active" && !client.activatedAt) client.activatedAt = Date.now();
  client.lastActivity = Date.now();
  notify(state, client.id, "account", next === "suspended" ? "Account suspended" : "Account active", reason.trim(), admin.id);
  audit(state, admin, next === "suspended" ? "Client suspended" : "Client activated", client.id, previous, next, reason.trim());
  return ok();
}

export function decideKyc(state: AppState, admin: AdminUser, clientId: string, decision: "approve" | "reject" | "update", reason: string) {
  if (!can(admin.role, "kyc.decide")) return fail("Your role cannot decide KYC.");
  const client = findClient(state, clientId);
  const kyc = kycOf(state, clientId);
  if (!client || !kyc) return fail("KYC record not found.");
  const previous = kyc.status;
  if (decision === "approve") {
    const paid = state.clientFees.some((item) => item.clientId === clientId && item.name === ONBOARDING_FEE_NAME && item.status === "successful");
    if (!paid) return fail("KYC cannot be approved before the Client Onboarding Fee is successful.");
    if (!kycChecklist(kyc).ready) return fail("KYC cannot be approved while a mandatory component is incomplete.");
    kyc.status = "approved";
    kyc.rejectionReason = "";
    kyc.updateRequest = "";
    if (client.accountStatus !== "suspended") {
      client.accountStatus = "active";
      if (!client.activatedAt) client.activatedAt = Date.now();
    }
    notify(state, client.id, "account", "KYC approved", "Your investment account is active.", admin.id);
  } else if (decision === "reject") {
    if (reason.trim().length < 8) return fail("Enter the rejection reason.");
    kyc.status = "rejected";
    kyc.rejectionReason = reason.trim();
    client.accountStatus = "kyc_rejected";
    notify(state, client.id, "account", "KYC rejected", reason.trim(), admin.id);
  } else {
    if (reason.trim().length < 8) return fail("Explain the correction the client must make.");
    kyc.status = "requires_update";
    kyc.updateRequest = reason.trim();
    if (client.accountStatus !== "suspended") client.accountStatus = "kyc_in_progress";
    notify(state, client.id, "account", "KYC needs an update", reason.trim(), admin.id);
  }
  kyc.reviewedAt = Date.now();
  kyc.reviewedBy = admin.id;
  kyc.history.unshift({ at: Date.now(), action: decision === "approve" ? "Approved" : decision === "reject" ? "Rejected" : "Update requested", by: admin.name, note: reason.trim() });
  client.lastActivity = Date.now();
  audit(state, admin, decision === "approve" ? "KYC approved" : decision === "reject" ? "KYC rejected" : "KYC update requested", client.id, previous, kyc.status, reason.trim());
  return ok();
}

export function reviewEvidence(state: AppState, admin: AdminUser, clientId: string, kind: "document" | "selfie", status: DocStatus, note: string) {
  if (!can(admin.role, "documents.review")) return fail("Your role cannot review documents.");
  if (status !== "approved" && status !== "rejected" && status !== "requires_update") return fail("Choose a review outcome.");
  if (note.trim().length < 4) return fail("Add a review note.");
  const kyc = kycOf(state, clientId);
  if (!kyc) return fail("KYC record not found.");
  const part = kind === "document" ? kyc.document : kyc.selfie;
  if (part.status === "not_submitted") return fail("Nothing has been submitted for review.");
  const previous = part.status;
  part.status = status;
  part.reviewNote = note.trim();
  part.reviewedBy = admin.id;
  part.reviewedAt = Date.now();
  kyc.history.unshift({ at: Date.now(), action: `${kind === "document" ? "Document" : "Identity photo"} ${status}`, by: admin.name, note: note.trim() });
  audit(state, admin, "Document reviewed", `${clientId} ${kind}`, previous, status, note.trim());
  return ok();
}

export function updateFeeSetting(state: AppState, admin: AdminUser, id: string, amount: number, status: FeeSetting["status"], description: string) {
  if (!can(admin.role, "fees.manage")) return fail("Your role cannot change fee settings.");
  const fee = state.feeSettings.find((item) => item.id === id);
  if (!fee) return fail("Fee setting not found.");
  if (!(amount >= 0)) return fail("Enter a valid amount.");
  if (fee.name === ONBOARDING_FEE_NAME && amount <= 0) return fail("The Client Onboarding Fee must stay in place.");
  const previous = `${fee.amount} · ${fee.status}`;
  fee.amount = amount;
  fee.status = status;
  fee.description = description.trim();
  fee.updatedBy = admin.id;
  fee.effectiveAt = Date.now();
  audit(state, admin, "Fee setting changed", fee.name, previous, `${amount} · ${status}`);
  return ok();
}

export function resolveClientFee(state: AppState, admin: AdminUser, id: string, status: PayStatus, reason: string) {
  if (!can(admin.role, "fees.manage")) return fail("Your role cannot update fee records.");
  if (reason.trim().length < 8) return fail("Record a reason.");
  const fee = state.clientFees.find((item) => item.id === id);
  const client = fee ? findClient(state, fee.clientId) : undefined;
  const kyc = fee ? kycOf(state, fee.clientId) : undefined;
  if (!fee || !client || !kyc) return fail("Fee record not found.");
  const previous = fee.status;
  fee.status = status;
  if (fee.name === ONBOARDING_FEE_NAME && status === "successful" && (client.accountStatus === "kyc_locked" || client.accountStatus === "registered" || client.accountStatus === "otp_pending")) {
    client.accountStatus = "kyc_in_progress";
    if (kyc.status === "not_started") kyc.status = "in_progress";
    notify(state, client.id, "payments", "Client Onboarding Fee received", "KYC verification is now unlocked.", admin.id);
  }
  if (fee.name === ONBOARDING_FEE_NAME && status !== "successful" && kyc.status !== "approved" && client.accountStatus !== "suspended") {
    const stillPaid = state.clientFees.some((item) => item.clientId === client.id && item.name === ONBOARDING_FEE_NAME && item.status === "successful");
    if (!stillPaid && ["kyc_in_progress", "kyc_pending_review", "kyc_locked"].includes(client.accountStatus)) {
      client.accountStatus = "kyc_locked";
      notify(state, client.id, "payments", "Client Onboarding Fee not successful", "KYC stays locked until a payment is successful.", admin.id);
    }
  }
  audit(state, admin, "Fee record updated", fee.reference, previous, status, reason.trim());
  return ok();
}

export function adjustWallet(state: AppState, admin: AdminUser, clientId: string, amount: number, direction: "credit" | "debit", reason: string) {
  if (!can(admin.role, "wallets.adjust")) return fail("Your role cannot adjust a wallet.");
  if (reason.trim().length < 8) return fail("Record the reason for this adjustment.");
  if (!(amount > 0)) return fail("Enter an amount.");
  const wallet = walletRow(state, clientId);
  const client = findClient(state, clientId);
  if (!wallet || !client) return fail("Wallet not found.");
  if (direction === "debit" && amount > wallet.available) return fail("Available balance is not enough. Locked and invested funds stay untouched.");
  const previous = String(wallet.available);
  wallet.available = roundMoney(direction === "credit" ? wallet.available + amount : wallet.available - amount);
  sync(wallet);
  const ref = reference("ADJ");
  addTx(state, { clientId, type: "wallet_adjustment", amount, reference: ref, description: reason.trim(), direction });
  client.lastActivity = Date.now();
  notify(state, clientId, "payments", "Wallet adjustment", reason.trim(), admin.id);
  audit(state, admin, "Wallet adjusted", clientId, previous, String(wallet.available), reason.trim());
  return ok({ reference: ref });
}

export function resolveDeposit(state: AppState, admin: AdminUser, id: string, outcome: "successful" | "failed" | "reversed", note: string) {
  if (!can(admin.role, "deposits.manage")) return fail("Your role cannot update deposits.");
  const deposit = state.deposits.find((item) => item.id === id);
  const wallet = deposit ? walletRow(state, deposit.clientId) : null;
  if (!deposit || !wallet) return fail("Deposit not found.");
  const previous = deposit.status;
  if (outcome === "successful") {
    if (deposit.status !== "pending" && deposit.status !== "processing") return fail("Only a pending deposit can be confirmed.");
    if (state.transactions.some((item) => item.reference === deposit.reference && item.direction === "credit")) return fail("This reference is already credited.");
    deposit.status = "successful";
    wallet.available = roundMoney(wallet.available + deposit.amount);
    sync(wallet);
    addTx(state, { clientId: deposit.clientId, type: "deposit", amount: deposit.amount, reference: deposit.reference, description: "Wallet deposit confirmed", direction: "credit" });
    notify(state, deposit.clientId, "payments", "Deposit successful", `${deposit.reference} was credited after payment confirmation.`, admin.id);
  } else if (outcome === "failed") {
    if (deposit.status === "successful") return fail("A credited deposit has to be reversed, not failed.");
    deposit.status = "failed";
  } else {
    if (deposit.status !== "successful") return fail("Only a successful deposit can be reversed.");
    if (wallet.available < deposit.amount) return fail("Available balance is not enough to reverse this deposit.");
    deposit.status = "reversed";
    wallet.available = roundMoney(wallet.available - deposit.amount);
    sync(wallet);
    addTx(state, { clientId: deposit.clientId, type: "reversal", amount: deposit.amount, reference: reference("REV"), description: `Reversal of ${deposit.reference}`, direction: "debit" });
    notify(state, deposit.clientId, "payments", "Deposit reversed", deposit.reference, admin.id);
  }
  if (note.trim()) deposit.note = note.trim();
  audit(state, admin, "Deposit updated", deposit.reference, previous, deposit.status, note.trim());
  return ok();
}

const withdrawalFlow: Partial<Record<WithdrawalStatus, WithdrawalStatus[]>> = {
  pending: ["under_review", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["processing", "rejected"],
  processing: ["completed", "failed"],
};

export function advanceWithdrawal(state: AppState, admin: AdminUser, id: string, next: WithdrawalStatus, reason: string) {
  if (!can(admin.role, "withdrawals.review")) return fail("Your role cannot review withdrawals.");
  const row = state.withdrawals.find((item) => item.id === id);
  const wallet = row ? walletRow(state, row.clientId) : null;
  if (!row || !wallet) return fail("Withdrawal not found.");
  if (!withdrawalFlow[row.status]?.includes(next)) return fail("That status change is not available.");
  if ((next === "rejected" || next === "failed") && reason.trim().length < 8) return fail("Record a reason.");
  const total = roundMoney(row.amount + row.fee);
  const previous = row.status;
  if (next === "rejected" || next === "failed") {
    const release = Math.min(wallet.locked, total);
    wallet.locked = roundMoney(wallet.locked - release);
    wallet.available = roundMoney(wallet.available + release);
    sync(wallet);
    notify(state, row.clientId, "payments", next === "rejected" ? "Withdrawal rejected" : "Withdrawal failed", reason.trim(), admin.id);
  }
  if (next === "completed") {
    if (wallet.locked < total) return fail("Locked funds do not cover this withdrawal and its fee.");
    wallet.locked = roundMoney(wallet.locked - total);
    sync(wallet);
    addTx(state, { clientId: row.clientId, type: "withdrawal", amount: row.amount, reference: row.reference, description: `Withdrawal to ${row.bankName}`, direction: "debit" });
    const feeRef = reference("FEE");
    addTx(state, { clientId: row.clientId, type: "fee", amount: row.fee, reference: feeRef, description: "Withdrawal fee", direction: "debit" });
    state.clientFees.unshift({ id: uid(), clientId: row.clientId, name: "Withdrawal fee", amount: row.fee, method: "Wallet", reference: feeRef, status: "successful", createdAt: Date.now() });
    notify(state, row.clientId, "payments", "Withdrawal completed", `${row.reference} was paid to the verified bank account.`, admin.id);
  }
  row.status = next;
  row.reason = reason.trim();
  row.reviewedBy = admin.id;
  audit(state, admin, next === "rejected" ? "Withdrawal rejected" : "Withdrawal updated", row.reference, previous, next, reason.trim());
  return ok();
}

export type OpportunityInput = Omit<Opportunity, "id" | "outsideCapital" | "outsideInvestors" | "status" | "createdBy" | "approvedBy" | "publishedAt" | "documents">;

export function saveOpportunity(state: AppState, admin: AdminUser, input: OpportunityInput, existingId = "") {
  if (!can(admin.role, "investments.manage")) return fail("Your role cannot edit investment opportunities.");
  const issue = validateOpportunity(input);
  if (issue) return fail(issue);
  if (existingId) {
    const current = state.opportunities.find((item) => item.id === existingId);
    if (!current) return fail("Opportunity not found.");
    if (current.status !== "draft") return fail("Only a draft can be edited.");
    const previous = current.name;
    Object.assign(current, input, {
      documents: [
        { title: "Risk disclosure", body: input.risk },
        { title: "Structure note", body: input.shariah },
      ],
    });
    audit(state, admin, "Investment edited", current.name, previous, current.status);
    return ok({ id: current.id });
  }
  const created: Opportunity = {
    ...input,
    id: uid(),
    outsideCapital: 0,
    outsideInvestors: 0,
    status: "draft",
    createdBy: admin.id,
    approvedBy: "",
    publishedAt: null,
    documents: [
      { title: "Risk disclosure", body: input.risk },
      { title: "Structure note", body: input.shariah },
    ],
  };
  state.opportunities.unshift(created);
  audit(state, admin, "Investment created", created.name, "", "draft");
  return ok({ id: created.id });
}

function validateOpportunity(input: OpportunityInput) {
  if (input.name.trim().length < 4) return "Enter the investment name.";
  if (input.description.trim().length < 20) return "Describe the venture or the asset.";
  if (!(input.min > 0) || input.max < input.min || input.target < input.min) return "Check the minimum, maximum, and target.";
  if (input.kind === "mudarabah" && input.investorShare + input.managerShare !== 100) return "The profit-sharing split must add up to 100%.";
  if (!input.risk.trim() || !input.shariah.trim()) return "Risk information and the Shariah structure are required.";
  if (input.kind === "ijarah" && (!input.assetType.trim() || !(input.assetValue > 0) || !input.rentalSchedule.trim())) return "Asset type, asset value, and the rental schedule are required.";
  if (!input.startDate || !input.maturityDate || input.maturityDate <= input.startDate) return "Maturity must come after the start date.";
  if (/interest/i.test(`${input.shariah} ${input.terms}`)) return "Do not describe the return as interest.";
  return "";
}

export type OpportunityAction = "submit" | "approve" | "publish" | "unpublish" | "funding" | "fully_funded" | "active" | "lease_active" | "matured" | "completed" | "suspended" | "cancelled" | "resume";

export function actOnOpportunity(state: AppState, admin: AdminUser, id: string, action: OpportunityAction, reason: string) {
  const opp = state.opportunities.find((item) => item.id === id);
  if (!opp) return fail("Opportunity not found.");
  const previous = opp.status;
  if (action === "submit") {
    if (!can(admin.role, "investments.manage")) return fail("Your role cannot submit an opportunity.");
    if (opp.status !== "draft") return fail("Only a draft can be submitted.");
    opp.status = "pending_review";
  } else if (action === "approve") {
    if (!can(admin.role, "investments.approve")) return fail("Your role cannot approve an opportunity.");
    if (opp.status !== "pending_review") return fail("This opportunity is not waiting for approval.");
    if (opp.createdBy === admin.id && admin.role !== "super_admin") return fail("Someone else must approve an opportunity you created.");
    opp.status = "approved";
    opp.approvedBy = admin.id;
  } else if (action === "publish") {
    if (!can(admin.role, "investments.publish")) return fail("Your role cannot publish an opportunity.");
    if (opp.status !== "approved") return fail("Publish only after the opportunity has been approved.");
    opp.status = "published";
    opp.publishedAt = Date.now();
  } else if (action === "unpublish") {
    if (!can(admin.role, "investments.publish")) return fail("Your role cannot unpublish an opportunity.");
    if (opp.status !== "published" && opp.status !== "funding") return fail("Only a published opportunity can be unpublished.");
    opp.status = "approved";
  } else if (action === "suspended" || action === "cancelled") {
    if (!can(admin.role, "investments.manage")) return fail("Your role cannot change this opportunity.");
    if (reason.trim().length < 8) return fail("Record a reason.");
    if (["completed", "cancelled"].includes(opp.status)) return fail("This opportunity is already closed.");
    opp.status = action;
  } else if (action === "resume") {
    if (!can(admin.role, "investments.manage")) return fail("Your role cannot change this opportunity.");
    if (opp.status !== "suspended") return fail("Only a suspended opportunity can be resumed.");
    opp.status = opp.kind === "ijarah" && opp.publishedAt ? "lease_active" : "funding";
  } else {
    if (!can(admin.role, "investments.manage")) return fail("Your role cannot change this opportunity.");
    const allowed: Partial<Record<string, string[]>> = {
      published: ["funding"],
      funding: ["fully_funded", "active"],
      fully_funded: ["active", "lease_active"],
      active: ["lease_active", "matured"],
      lease_active: ["matured"],
      matured: ["completed"],
    };
    if (action === "lease_active" && opp.kind !== "ijarah") return fail("Lease active applies to Ijarah.");
    if (!allowed[opp.status]?.includes(action)) return fail("That status change is not available.");
    opp.status = action;
  }
  audit(state, admin, "Investment status", opp.name, previous, opp.status, reason.trim());
  return ok();
}

export function prepareDistribution(state: AppState, admin: AdminUser, opportunityId: string, performanceAmount: number, performanceNote: string) {
  if (!can(admin.role, "distributions.prepare")) return fail("Your role cannot prepare a distribution.");
  const opp = state.opportunities.find((item) => item.id === opportunityId);
  if (!opp) return fail("Opportunity not found.");
  if (!["funding", "fully_funded", "active", "lease_active", "matured"].includes(opp.status)) return fail("Prepare a distribution only after the opportunity is live.");
  if (performanceAmount < 0) return fail("Enter the profit or rent actually collected. Use 0 when there is none.");
  if (performanceNote.trim().length < 8) return fail("Describe the performance this distribution is based on.");
  const preview = allocationPreview(state, opp, performanceAmount);
  if (preview.holdings.length === 0) return fail("No recorded client capital is available to distribute.");
  const lines = preview.lines.map((item) => ({
    id: uid(),
    clientId: item.holding.clientId,
    holdingId: item.holding.id,
    amount: item.amount,
    reference: reference(opp.kind === "mudarabah" ? "PRF" : "RNT"),
  }));
  const drift = roundMoney(preview.investorPool - lines.reduce((sum, item) => sum + item.amount, 0));
  if (lines.length > 0) lines[lines.length - 1].amount = roundMoney(lines[lines.length - 1].amount + drift);
  const id = uid();
  state.distributions.unshift({
    id,
    kind: opp.kind === "mudarabah" ? "mudarabah_profit" : "ijarah_rental",
    opportunityId,
    performanceAmount,
    investorPool: preview.investorPool,
    performanceNote: performanceNote.trim(),
    status: "draft",
    lines,
    preparedBy: admin.id,
    approvedBy: "",
    reason: "",
    createdAt: Date.now(),
    executedAt: null,
  });
  audit(state, admin, "Distribution prepared", opp.name, "", "draft", performanceNote.trim());
  return ok({ id });
}

export function actOnDistribution(state: AppState, admin: AdminUser, id: string, action: "submit" | "approve" | "reject" | "execute" | "reverse", reason: string) {
  const batch = state.distributions.find((item) => item.id === id);
  const opp = batch ? state.opportunities.find((item) => item.id === batch.opportunityId) : undefined;
  if (!batch || !opp) return fail("Distribution not found.");
  const previous = batch.status;
  if (action === "submit") {
    if (!can(admin.role, "distributions.prepare")) return fail("Your role cannot submit a distribution.");
    if (batch.status !== "draft") return fail("Only a draft can be submitted.");
    batch.status = "pending_approval";
  } else if (action === "approve" || action === "reject") {
    if (!can(admin.role, "distributions.decide")) return fail("Your role cannot decide a distribution.");
    if (batch.status !== "pending_approval") return fail("This distribution is not waiting for approval.");
    if (batch.preparedBy === admin.id && admin.role !== "super_admin") return fail("Someone else must approve a distribution you prepared.");
    if (action === "reject" && reason.trim().length < 8) return fail("Record a reason.");
    batch.status = action === "approve" ? "approved" : "failed";
    batch.approvedBy = admin.id;
    batch.reason = reason.trim();
  } else if (action === "execute") {
    if (!can(admin.role, "distributions.decide")) return fail("Your role cannot execute a distribution.");
    if (batch.status !== "approved") return fail("Approve the distribution before it is paid.");
    for (const line of batch.lines) {
      const wallet = walletRow(state, line.clientId);
      if (!wallet) return fail("A client wallet is missing.");
      wallet.available = roundMoney(wallet.available + line.amount);
      sync(wallet);
      addTx(state, {
        clientId: line.clientId,
        type: batch.kind === "mudarabah_profit" ? "mudarabah_profit" : "ijarah_rental",
        amount: line.amount,
        reference: line.reference,
        description: `${opp.name}. Paid from recorded performance, not as interest.`,
        direction: "credit",
      });
      notify(state, line.clientId, "investments", batch.kind === "mudarabah_profit" ? "Profit distributed" : "Rental distributed", `${opp.name}: ${line.reference}`, admin.id);
    }
    batch.status = "completed";
    batch.executedAt = Date.now();
  } else {
    if (!can(admin.role, "distributions.decide")) return fail("Your role cannot reverse a distribution.");
    if (batch.status !== "completed") return fail("Only a completed distribution can be reversed.");
    if (reason.trim().length < 8) return fail("Record a reason.");
    for (const line of batch.lines) {
      const wallet = walletRow(state, line.clientId);
      if (!wallet || wallet.available < line.amount) return fail("A client no longer has enough available balance to reverse this distribution.");
    }
    for (const line of batch.lines) {
      const wallet = walletRow(state, line.clientId);
      if (!wallet) continue;
      wallet.available = roundMoney(wallet.available - line.amount);
      sync(wallet);
      addTx(state, { clientId: line.clientId, type: "reversal", amount: line.amount, reference: reference("REV"), description: `Reversal of ${line.reference}`, direction: "debit" });
    }
    batch.status = "reversed";
    batch.reason = reason.trim();
  }
  audit(state, admin, "Distribution updated", opp.name, previous, batch.status, reason.trim());
  return ok();
}

export function sendNotification(state: AppState, admin: AdminUser, input: { clientId: string; opportunityId: string; category: string; title: string; message: string }) {
  if (!can(admin.role, "notifications.send")) return fail("Your role cannot send notifications.");
  if (input.title.trim().length < 4 || input.message.trim().length < 8) return fail("Enter a title and a message.");
  const ids = input.opportunityId
    ? [...new Set(state.holdings.filter((item) => item.opportunityId === input.opportunityId).map((item) => item.clientId))]
    : input.clientId
      ? [input.clientId]
      : [];
  if (ids.length === 0) return fail("Choose a client or an investment with recorded clients.");
  for (const clientId of ids) notify(state, clientId, input.category || "account", input.title.trim(), input.message.trim(), admin.id);
  audit(state, admin, "Notification sent", input.opportunityId || input.clientId, "", input.title.trim());
  return ok({ count: ids.length });
}

export function updateTicket(state: AppState, admin: AdminUser, id: string, input: { status?: AppState["tickets"][number]["status"]; priority?: AppState["tickets"][number]["priority"]; assignedTo?: string; reply?: string; internal?: string }) {
  if (!can(admin.role, "tickets.manage")) return fail("Your role cannot manage tickets.");
  const ticket = state.tickets.find((item) => item.id === id);
  if (!ticket) return fail("Ticket not found.");
  const previous = ticket.status;
  if (input.status) ticket.status = input.status;
  if (input.priority) ticket.priority = input.priority;
  if (input.assignedTo !== undefined) {
    ticket.assignedTo = input.assignedTo;
    if (input.assignedTo && ticket.status === "open") ticket.status = "assigned";
  }
  if (input.reply?.trim()) {
    ticket.messages.push({ id: uid(), author: admin.name, kind: "staff", body: input.reply.trim(), at: Date.now() });
    notify(state, ticket.clientId, "account", "Support reply", input.reply.trim(), admin.id);
  }
  if (input.internal?.trim()) ticket.messages.push({ id: uid(), author: admin.name, kind: "internal", body: input.internal.trim(), at: Date.now() });
  audit(state, admin, "Ticket updated", ticket.id, previous, ticket.status);
  return ok();
}

export function addAgreementVersion(state: AppState, admin: AdminUser, type: string, name: string, body: string) {
  if (!can(admin.role, "investments.manage")) return fail("Your role cannot manage agreements.");
  if (name.trim().length < 4 || body.trim().length < 20) return fail("Enter the agreement name and the full terms.");
  if (/interest/i.test(body)) return fail("Do not describe the return as interest.");
  const same = state.agreements.filter((item) => item.type === type);
  for (const row of same) if (row.status === "active") row.status = "retired";
  const tenths = Math.round(Math.max(0, ...same.map((item) => Number(item.version))) * 10) + 1;
  state.agreements.unshift({
    id: uid(),
    name: name.trim(),
    type,
    version: (tenths / 10).toFixed(1),
    effectiveAt: Date.now(),
    status: "active",
    body: body.trim(),
    createdBy: admin.id,
    approvedBy: admin.id,
  });
  audit(state, admin, "Agreement version added", name.trim(), "", (tenths / 10).toFixed(1));
  return ok();
}

export function updateSettings(state: AppState, admin: AdminUser, next: Settings) {
  if (!can(admin.role, "settings.manage")) return fail("Your role cannot change platform settings.");
  if (!next.platformName.trim() || !next.supportEmail.includes("@")) return fail("Enter the platform name and a support email.");
  if (next.sessionMinutes < 15 || next.sessionMinutes > 1440) return fail("Session timeout must be between 15 and 1440 minutes.");
  if (next.passwordMinLength < 8) return fail("Passwords must be at least 8 characters.");
  const previous = `${state.settings.platformName} · 2FA ${state.settings.require2fa ? "required" : "optional"}`;
  state.settings = { ...next, platformName: next.platformName.trim(), supportEmail: next.supportEmail.trim(), paymentMethods: next.paymentMethods.map((item) => item.trim()).filter(Boolean) };
  audit(state, admin, "Settings changed", "Platform", previous, `${state.settings.platformName} · 2FA ${state.settings.require2fa ? "required" : "optional"}`);
  return ok();
}

export function recordExport(state: AppState, admin: AdminUser, report: string) {
  if (!can(admin.role, "reports.export")) return fail("Your role cannot export reports.");
  audit(state, admin, "Report exported", report, "", report);
  return ok();
}
