import type { AccountStatus, AdminUser, AppState, Client, KycRecord, KycStatus, Role, VerifyStatus, Wallet } from "./types";

export type LiveClient = {
  id: string;
  memberCode?: string | null;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  phone: string;
  accountStatus: string;
  createdAt: string;
  updatedAt?: string;
  kycStatus: string;
  kyc: {
    status: string;
    personalStatus?: string;
    ninStatus?: string;
    bvnStatus?: string;
    bankStatus?: string;
    documentStatus?: string;
    identityStatus?: string;
    dateOfBirth?: string;
    gender?: string;
    nationality?: string;
    address?: string;
    state?: string;
    lga?: string;
    ninLast4?: string;
    ninReference?: string;
    bvnLast4?: string;
    bvnReference?: string;
    rejectionReason?: string;
    updateReason?: string;
    submittedAt?: string | null;
    reviewedAt?: string | null;
    reviewedById?: string;
    bank?: { bankName: string; accountNumber: string; accountName: string; status: string } | null;
  } | null;
  wallet: { available: number; locked: number; balance: number };
  invested: number;
};

const ROLE_MAP: Record<string, Role> = {
  SUPER_ADMIN: "super_admin",
  COMPLIANCE_ADMIN: "compliance_admin",
  INVESTMENT_ADMIN: "investment_admin",
  FINANCE_ADMIN: "finance_admin",
  SUPPORT_ADMIN: "support_admin",
};

const ACCOUNT_MAP: Record<string, AccountStatus> = {
  OTP_PENDING: "otp_pending",
  REGISTERED: "registered",
  KYC_LOCKED: "kyc_locked",
  KYC_IN_PROGRESS: "kyc_in_progress",
  KYC_PENDING_REVIEW: "kyc_pending_review",
  KYC_APPROVED: "kyc_approved",
  KYC_REJECTED: "kyc_rejected",
  KYC_UPDATE_REQUIRED: "kyc_in_progress",
  ACTIVE: "active",
  SUSPENDED: "suspended",
};

const KYC_MAP: Record<string, KycStatus> = {
  KYC_LOCKED: "not_started",
  OTP_PENDING: "not_started",
  KYC_IN_PROGRESS: "in_progress",
  KYC_PENDING_REVIEW: "pending_review",
  KYC_APPROVED: "approved",
  KYC_REJECTED: "rejected",
  KYC_UPDATE_REQUIRED: "requires_update",
  ACTIVE: "approved",
  SUSPENDED: "approved",
};

const VERIFY_MAP: Record<string, VerifyStatus> = {
  NOT_STARTED: "not_started",
  PENDING: "pending",
  VERIFIED: "verified",
  COMPLETE: "verified",
  FAILED: "failed",
  REQUIRES_UPDATE: "requires_update",
};

export function mapAdminRole(role: string | null | undefined): Role {
  return ROLE_MAP[role ?? ""] ?? "support_admin";
}

export function liveAdminUser(input: { id: string; name: string; email: string; role: string }): AdminUser {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    role: mapAdminRole(input.role),
    status: "active",
    passwordSalt: "live",
    passwordHash: "live",
    twoFactor: false,
    lastLogin: Date.now(),
    createdAt: Date.now(),
    failedLogins: 0,
    lockedUntil: 0,
  };
}

function mapAccount(status: string): AccountStatus {
  return ACCOUNT_MAP[status] ?? "registered";
}

function mapKycStatus(status: string): KycStatus {
  return KYC_MAP[status] ?? "not_started";
}

function mapVerify(status?: string): VerifyStatus {
  return VERIFY_MAP[status ?? "NOT_STARTED"] ?? "not_started";
}

function emptyVerify(status?: string, reference = ""): KycRecord["nin"] {
  return { status: mapVerify(status), reference, response: "", verifiedAt: null, match: "" };
}

export function mapLiveClient(row: LiveClient): { client: Client; kyc: KycRecord; wallet: Wallet; invested: number } {
  const registeredAt = Date.parse(row.createdAt) || Date.now();
  const lastActivity = Date.parse(row.updatedAt ?? row.createdAt) || registeredAt;
  const client: Client = {
    id: row.id,
    memberCode: row.memberCode ?? null,
    firstName: row.firstName,
    middleName: row.middleName ?? "",
    lastName: row.lastName,
    email: row.email,
    phone: row.phone || "",
    accountStatus: mapAccount(row.accountStatus),
    registeredAt,
    lastActivity,
    lastLogin: null,
    activatedAt: row.accountStatus === "ACTIVE" ? registeredAt : null,
  };
  const kycSource = row.kyc;
  const kyc: KycRecord = {
    clientId: row.id,
    status: mapKycStatus(kycSource?.status ?? row.kycStatus),
    personal: {
      fullName: `${row.firstName} ${row.lastName}`.trim(),
      dob: kycSource?.dateOfBirth ?? "",
      gender: kycSource?.gender ?? "",
      nationality: kycSource?.nationality || "Nigerian",
      address: kycSource?.address ?? "",
      state: kycSource?.state ?? "",
      lga: kycSource?.lga ?? "",
      country: "Nigeria",
      phone: row.phone || "",
      email: row.email,
    },
    nin: emptyVerify(kycSource?.ninStatus, kycSource?.ninReference || (kycSource?.ninLast4 ? `••••${kycSource.ninLast4}` : "")),
    bvn: emptyVerify(kycSource?.bvnStatus, kycSource?.bvnReference || (kycSource?.bvnLast4 ? `••••${kycSource.bvnLast4}` : "")),
    bank: {
      bank: kycSource?.bank?.bankName ?? "",
      accountNumber: kycSource?.bank?.accountNumber ?? "",
      accountName: kycSource?.bank?.accountName ?? "",
      status: mapVerify(kycSource?.bank?.status ?? kycSource?.bankStatus),
    },
    document: {
      type: "",
      status: mapVerify(kycSource?.documentStatus) === "verified" ? "approved" : mapVerify(kycSource?.documentStatus) === "failed" ? "rejected" : mapVerify(kycSource?.documentStatus) === "requires_update" ? "requires_update" : mapVerify(kycSource?.documentStatus) === "pending" ? "pending" : "not_submitted",
      uploadedAt: null,
      reviewNote: "",
      reviewedBy: "",
      reviewedAt: null,
    },
    selfie: {
      status: mapVerify(kycSource?.identityStatus) === "verified" ? "approved" : mapVerify(kycSource?.identityStatus) === "failed" ? "rejected" : mapVerify(kycSource?.identityStatus) === "requires_update" ? "requires_update" : mapVerify(kycSource?.identityStatus) === "pending" ? "pending" : "not_submitted",
      uploadedAt: null,
      reviewNote: "",
      reviewedBy: "",
      reviewedAt: null,
    },
    submittedAt: kycSource?.submittedAt ? Date.parse(kycSource.submittedAt) : null,
    reviewedAt: kycSource?.reviewedAt ? Date.parse(kycSource.reviewedAt) : null,
    reviewedBy: kycSource?.reviewedById ?? "",
    rejectionReason: kycSource?.rejectionReason ?? "",
    updateRequest: kycSource?.updateReason ?? "",
    history: [],
  };
  const wallet: Wallet = {
    clientId: row.id,
    balance: row.wallet?.balance ?? 0,
    available: row.wallet?.available ?? 0,
    locked: row.wallet?.locked ?? 0,
  };
  return { client, kyc, wallet, invested: row.invested ?? 0 };
}

export function applyLiveClients(state: AppState, rows: LiveClient[]): AppState {
  const mapped = rows.map(mapLiveClient);
  const holdings = mapped
    .filter((item) => item.invested > 0)
    .map((item) => ({
      id: `live-hold-${item.client.id}`,
      clientId: item.client.id,
      opportunityId: "live",
      amount: item.invested,
      fee: 0,
      status: "active" as const,
      investedAt: item.client.registeredAt,
      startDate: item.client.registeredAt,
      maturityDate: item.client.registeredAt,
      reference: `INV-${item.client.id.slice(-6).toUpperCase()}`,
    }));
  return {
    ...state,
    clients: mapped.map((item) => item.client),
    kyc: mapped.map((item) => item.kyc),
    wallets: mapped.map((item) => item.wallet),
    holdings: [...state.holdings.filter((item) => item.opportunityId !== "live"), ...holdings],
  };
}
