import type { Role } from "./types";

export const ONBOARDING_FEE_NAME = "Client Onboarding Fee";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  compliance_admin: "Compliance Admin",
  investment_admin: "Investment Admin",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
};

const LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  compliance_admin: "Compliance Admin",
  investment_admin: "Investment Admin",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
  registered: "Registered",
  otp_pending: "OTP pending",
  kyc_locked: "KYC locked",
  kyc_in_progress: "KYC in progress",
  kyc_pending_review: "KYC pending review",
  kyc_approved: "KYC approved",
  kyc_rejected: "KYC rejected",
  not_started: "Not started",
  in_progress: "In progress",
  pending_review: "Pending review",
  requires_update: "Requires update",
  not_submitted: "Not submitted",
  under_review: "Under review",
  fully_funded: "Fully funded",
  lease_active: "Lease active",
  pending_approval: "Pending approval",
  waiting_for_client: "Waiting for client",
  in_progress_ticket: "In progress",
  client_onboarding_fee: "Client Onboarding Fee",
  mudarabah_investment: "Mudarabah investment",
  ijarah_investment: "Ijarah investment",
  mudarabah_profit: "Mudarabah profit",
  ijarah_rental: "Ijarah rental",
  wallet_adjustment: "Wallet adjustment",
  mudarabah_profit_batch: "Mudarabah profit",
  ijarah_rental_batch: "Ijarah rental",
};

export function label(value: string) {
  if (value === "client_onboarding_fee") return ONBOARDING_FEE_NAME;
  return LABELS[value] ?? value.replaceAll("_", " ");
}

export function tone(status: string) {
  if (["approved", "successful", "completed", "active", "verified", "published", "funding", "resolved", "lease_active", "fully_funded"].includes(status)) return "ok";
  if (["rejected", "failed", "suspended", "cancelled", "reversed", "refunded"].includes(status)) return "danger";
  if (["pending", "pending_review", "pending_approval", "under_review", "processing", "requires_update", "draft", "in_progress", "assigned", "waiting_for_client", "kyc_pending_review", "kyc_in_progress", "kyc_locked", "otp_pending"].includes(status)) return "warn";
  return "muted";
}
