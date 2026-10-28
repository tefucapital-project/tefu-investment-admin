export type Role = "super_admin" | "compliance_admin" | "investment_admin" | "finance_admin" | "support_admin";

export type Permission =
  | "admins.manage"
  | "clients.view"
  | "clients.manage"
  | "kyc.review"
  | "kyc.decide"
  | "fees.view"
  | "fees.manage"
  | "wallets.view"
  | "wallets.adjust"
  | "deposits.manage"
  | "withdrawals.review"
  | "transactions.view"
  | "investments.manage"
  | "investments.approve"
  | "investments.publish"
  | "distributions.prepare"
  | "distributions.decide"
  | "reports.view"
  | "reports.export"
  | "audit.view"
  | "settings.manage"
  | "tickets.manage"
  | "notifications.send"
  | "documents.review"
  | "reconciliation.view";

export type AccountStatus =
  | "registered"
  | "otp_pending"
  | "kyc_locked"
  | "kyc_in_progress"
  | "kyc_pending_review"
  | "kyc_approved"
  | "kyc_rejected"
  | "active"
  | "suspended";

export type KycStatus = "not_started" | "in_progress" | "pending_review" | "approved" | "rejected" | "requires_update";

export type VerifyStatus = "not_started" | "pending" | "verified" | "failed" | "requires_update";

export type DocStatus = "not_submitted" | "pending" | "approved" | "rejected" | "requires_update";

export type PayStatus = "pending" | "processing" | "successful" | "failed" | "reversed" | "refunded";

export type WithdrawalStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "rejected"
  | "reversed";

export type OppStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "funding"
  | "fully_funded"
  | "active"
  | "lease_active"
  | "matured"
  | "completed"
  | "suspended"
  | "cancelled";

export type HoldingStatus = "pending" | "active" | "completed" | "matured" | "suspended";

export type DistributionStatus = "draft" | "pending_approval" | "approved" | "processing" | "completed" | "failed" | "reversed";

export type TicketStatus = "open" | "assigned" | "in_progress" | "waiting_for_client" | "resolved" | "closed";

export type TxType =
  | "client_onboarding_fee"
  | "deposit"
  | "withdrawal"
  | "mudarabah_investment"
  | "ijarah_investment"
  | "mudarabah_profit"
  | "ijarah_rental"
  | "refund"
  | "reversal"
  | "fee"
  | "wallet_adjustment";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  passwordSalt: string;
  passwordHash: string;
  twoFactor: boolean;
  lastLogin: number | null;
  createdAt: number;
  failedLogins: number;
  lockedUntil: number;
};

export type AdminSession = {
  id: string;
  adminId: string;
  device: string;
  createdAt: number;
  expiresAt: number;
};

export type Client = {
  id: string;
  memberCode?: string | null;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  accountStatus: AccountStatus;
  registeredAt: number;
  lastActivity: number;
  lastLogin: number | null;
  activatedAt: number | null;
};

export type Personal = {
  fullName: string;
  dob: string;
  gender: string;
  nationality: string;
  address: string;
  state: string;
  lga: string;
  country: string;
  phone: string;
  email: string;
};

export type VerifyPart = {
  status: VerifyStatus;
  reference: string;
  response: string;
  verifiedAt: number | null;
  match: string;
};

export type KycRecord = {
  clientId: string;
  status: KycStatus;
  personal: Personal;
  nin: VerifyPart;
  bvn: VerifyPart;
  bank: { bank: string; accountNumber: string; accountName: string; status: VerifyStatus };
  document: { type: string; status: DocStatus; uploadedAt: number | null; reviewNote: string; reviewedBy: string; reviewedAt: number | null };
  selfie: { status: DocStatus; uploadedAt: number | null; reviewNote: string; reviewedBy: string; reviewedAt: number | null };
  submittedAt: number | null;
  reviewedAt: number | null;
  reviewedBy: string;
  rejectionReason: string;
  updateRequest: string;
  history: { at: number; action: string; by: string; note: string }[];
};

export type Wallet = {
  clientId: string;
  balance: number;
  available: number;
  locked: number;
};

export type LedgerTx = {
  id: string;
  clientId: string;
  type: TxType;
  amount: number;
  reference: string;
  status: string;
  description: string;
  direction: "credit" | "debit" | "neutral";
  createdAt: number;
};

export type Deposit = {
  id: string;
  clientId: string;
  amount: number;
  method: string;
  reference: string;
  status: PayStatus;
  note: string;
  createdAt: number;
};

export type Withdrawal = {
  id: string;
  clientId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  fee: number;
  availableAtRequest: number;
  status: WithdrawalStatus;
  reference: string;
  reason: string;
  reviewedBy: string;
  createdAt: number;
};

export type ClientFee = {
  id: string;
  clientId: string;
  name: string;
  amount: number;
  method: string;
  reference: string;
  status: PayStatus;
  createdAt: number;
};

export type FeeSetting = {
  id: string;
  name: string;
  description: string;
  method: "fixed" | "percent";
  amount: number;
  status: "active" | "inactive";
  effectiveAt: number;
  updatedBy: string;
};

export type Opportunity = {
  id: string;
  kind: "mudarabah" | "ijarah";
  name: string;
  summary: string;
  description: string;
  project: string;
  min: number;
  max: number;
  target: number;
  outsideCapital: number;
  outsideInvestors: number;
  durationDays: number;
  startDate: string;
  maturityDate: string;
  investorShare: number;
  managerShare: number;
  risk: string;
  terms: string;
  shariah: string;
  assetType: string;
  assetValue: number;
  leaseStructure: string;
  rentalSchedule: string;
  takaful: string;
  status: OppStatus;
  createdBy: string;
  approvedBy: string;
  publishedAt: number | null;
  documents: { title: string; body: string }[];
};

export type Holding = {
  id: string;
  clientId: string;
  opportunityId: string;
  amount: number;
  fee: number;
  status: HoldingStatus;
  investedAt: number;
  startDate: number;
  maturityDate: number;
  reference: string;
};

export type DistributionLine = {
  id: string;
  clientId: string;
  holdingId: string;
  amount: number;
  reference: string;
};

export type DistributionBatch = {
  id: string;
  kind: "mudarabah_profit" | "ijarah_rental";
  opportunityId: string;
  performanceAmount: number;
  investorPool: number;
  performanceNote: string;
  status: DistributionStatus;
  lines: DistributionLine[];
  preparedBy: string;
  approvedBy: string;
  reason: string;
  createdAt: number;
  executedAt: number | null;
};

export type Agreement = {
  id: string;
  name: string;
  type: string;
  version: string;
  effectiveAt: number;
  status: "draft" | "active" | "retired";
  body: string;
  createdBy: string;
  approvedBy: string;
};

export type ClientNotice = {
  id: string;
  clientId: string;
  category: string;
  title: string;
  message: string;
  createdAt: number;
  createdBy: string;
};

export type TicketMessage = {
  id: string;
  author: string;
  kind: "client" | "staff" | "internal";
  body: string;
  at: number;
};

export type Ticket = {
  id: string;
  clientId: string;
  subject: string;
  category: string;
  priority: "low" | "normal" | "high";
  status: TicketStatus;
  assignedTo: string;
  createdAt: number;
  messages: TicketMessage[];
};

export type AuditEntry = {
  id: string;
  adminId: string;
  adminName: string;
  role: Role;
  action: string;
  target: string;
  previousValue: string;
  newValue: string;
  reason: string;
  createdAt: number;
  session: string;
};

export type Settings = {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  paymentMethods: string[];
  sessionMinutes: number;
  require2fa: boolean;
  passwordMinLength: number;
};

export type PendingOtp = {
  adminId: string;
  hash: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  preview: string;
};

export type AppState = {
  admins: AdminUser[];
  sessions: AdminSession[];
  clients: Client[];
  kyc: KycRecord[];
  wallets: Wallet[];
  transactions: LedgerTx[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  clientFees: ClientFee[];
  feeSettings: FeeSetting[];
  opportunities: Opportunity[];
  holdings: Holding[];
  distributions: DistributionBatch[];
  agreements: Agreement[];
  notifications: ClientNotice[];
  tickets: Ticket[];
  audit: AuditEntry[];
  settings: Settings;
  otp: PendingOtp | null;
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
