import type { Permission, Role } from "./types";

const ALL: Permission[] = [
  "admins.manage",
  "clients.view",
  "clients.manage",
  "kyc.review",
  "kyc.decide",
  "fees.view",
  "fees.manage",
  "wallets.view",
  "wallets.adjust",
  "deposits.manage",
  "withdrawals.review",
  "transactions.view",
  "investments.manage",
  "investments.approve",
  "investments.publish",
  "distributions.prepare",
  "distributions.decide",
  "reports.view",
  "reports.export",
  "audit.view",
  "settings.manage",
  "tickets.manage",
  "notifications.send",
  "documents.review",
  "reconciliation.view",
];

const GRANTS: Record<Role, Permission[]> = {
  super_admin: ALL,
  compliance_admin: ["clients.view", "kyc.review", "kyc.decide", "documents.review"],
  investment_admin: ["clients.view", "investments.manage", "investments.publish", "distributions.prepare", "reports.view"],
  finance_admin: [
    "clients.view",
    "fees.view",
    "fees.manage",
    "wallets.view",
    "wallets.adjust",
    "deposits.manage",
    "withdrawals.review",
    "transactions.view",
    "distributions.decide",
    "reports.view",
    "reports.export",
    "reconciliation.view",
  ],
  support_admin: ["clients.view", "tickets.manage", "notifications.send", "transactions.view"],
};

export function can(role: Role, permission: Permission) {
  return GRANTS[role].includes(permission);
}

export function seesFullBank(role: Role) {
  return role === "super_admin" || role === "finance_admin" || role === "compliance_admin";
}
