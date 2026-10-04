import { digest, fullName, uid } from "./format";
import { ONBOARDING_FEE_NAME } from "./labels";
import type { AdminUser, AppState, Client, KycRecord, Opportunity, Personal, Role, VerifyPart, VerifyStatus } from "./types";

export const STAFF_PASSWORD = "Admin123!";

export const STAFF_ACCOUNTS: { id: string; name: string; email: string; role: Role }[] = [
  { id: "adm-ada", name: "Ada Okonkwo", email: "admin@tefuinvestment.com", role: "super_admin" },
  { id: "adm-ibrahim", name: "Ibrahim Lawal", email: "compliance@tefuinvestment.com", role: "compliance_admin" },
  { id: "adm-zainab", name: "Zainab Yusuf", email: "invest@tefuinvestment.com", role: "investment_admin" },
  { id: "adm-chinedu", name: "Chinedu Okafor", email: "finance@tefuinvestment.com", role: "finance_admin" },
  { id: "adm-maryam", name: "Maryam Bello", email: "support@tefuinvestment.com", role: "support_admin" },
];

const DAY = 86400000;

function verify(status: VerifyStatus, reference = "", response = "", verifiedAt: number | null = null, match = ""): VerifyPart {
  return { status, reference, response, verifiedAt, match };
}

function person(client: Client, extra: Partial<Personal>): Personal {
  return {
    fullName: fullName(client),
    dob: "",
    gender: "",
    nationality: "Nigerian",
    address: "",
    state: "",
    lga: "",
    country: "Nigeria",
    phone: client.phone,
    email: client.email,
    ...extra,
  };
}

export async function createSeed(): Promise<AppState> {
  const now = Date.now();
  const admins: AdminUser[] = [];
  for (const account of STAFF_ACCOUNTS) {
    const passwordSalt = uid();
    admins.push({
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      status: "active",
      passwordSalt,
      passwordHash: await digest(passwordSalt, STAFF_PASSWORD),
      twoFactor: false,
      lastLogin: account.id === "adm-ada" ? now - 2 * 3600000 : null,
      createdAt: now - 40 * DAY,
      failedLogins: 0,
      lockedUntil: 0,
    });
  }
  return build(now, admins);
}

export async function ensureStaffLogins(state: AppState) {
  let changed = false;
  for (const account of STAFF_ACCOUNTS) {
    const admin = state.admins.find((item) => item.id === account.id);
    if (!admin) continue;
    const currentHash = await digest(admin.passwordSalt, STAFF_PASSWORD);
    if (admin.email === account.email && admin.passwordHash === currentHash) continue;
    admin.email = account.email;
    admin.passwordSalt = uid();
    admin.passwordHash = await digest(admin.passwordSalt, STAFF_PASSWORD);
    admin.failedLogins = 0;
    admin.lockedUntil = 0;
    changed = true;
  }
  if (state.settings.supportEmail === "support@tefu.invest") {
    state.settings.supportEmail = "support@tefuinvestment.com";
    changed = true;
  }
  return changed;
}

function build(now: number, admins: AdminUser[]): AppState {
  const clients: Client[] = [
    client("cl-amina", "Amina", "Sefi", "Bello", "amina.bello@example.com", "08031234567", "active", now - 18 * DAY, now - 3600000, now - 20 * DAY),
    client("cl-ngozi", "Ngozi", "", "Eze", "ngozi.eze@example.com", "08039887766", "active", now - 12 * DAY, now - 5 * 3600000, now - 14 * DAY),
    client("cl-halima", "Halima", "", "Sani", "halima.sani@example.com", "08045551212", "active", now - 9 * DAY, now - 26 * 3600000, now - 10 * DAY),
    client("cl-ibrahim", "Ibrahim", "Musa", "Danladi", "ibrahim.danladi@example.com", "08027654321", "kyc_pending_review", now - 4 * DAY, now - 3 * 3600000, null),
    client("cl-seyi", "Seyi", "", "Okonkwo", "seyi.okonkwo@example.com", "08160001122", "kyc_pending_review", now - 6 * DAY, now - 8 * 3600000, null),
    client("cl-chioma", "Chioma", "", "Adeyemi", "chioma.adeyemi@example.com", "07031239876", "kyc_in_progress", now - 3 * DAY, now - 2 * 3600000, null),
    client("cl-fatima", "Fatima", "", "Bello", "fatima.bello@example.com", "08091112233", "kyc_in_progress", now - 7 * DAY, now - DAY, null),
    client("cl-yusuf", "Yusuf", "", "Danjuma", "yusuf.danjuma@example.com", "08123450987", "kyc_locked", now - DAY, now - 4 * 3600000, null),
    client("cl-tunde", "Tunde", "", "Bakare", "tunde.bakare@example.com", "08056667788", "suspended", now - 30 * DAY, now - 2 * DAY, now - 28 * DAY),
  ];

  const kyc: KycRecord[] = [
    approvedKyc(clients[0], now - 16 * DAY, "1994-04-12", "Female", "14 Adeola Odeku, Victoria Island", "Lagos", "Eti-Osa", "Guaranty Trust Bank", "0123456789", "AMINA SEFI BELLO", "NIN-AMINA-1", "BVN-AMINA-1"),
    approvedKyc(clients[1], now - 11 * DAY, "1991-08-03", "Female", "8 Wetheral Road", "Enugu", "Enugu North", "Access Bank", "1234567890", "NGOZI EZE", "NIN-NGOZI-1", "BVN-NGOZI-1"),
    approvedKyc(clients[2], now - 8 * DAY, "1988-01-19", "Female", "22 Ahmadu Bello Way", "Kaduna", "Kaduna North", "Zenith Bank", "2211003344", "HALIMA SANI", "NIN-HALIMA-1", "BVN-HALIMA-1"),
    reviewKyc(clients[3], now - 5 * 3600000),
    failedNinKyc(clients[4], now - 20 * 3600000),
    partialKyc(clients[5]),
    updateKyc(clients[6], now - 2 * DAY),
    emptyKyc(clients[7]),
    approvedKyc(clients[8], now - 25 * DAY, "1984-11-02", "Male", "3 Isaac John Street, Ikeja", "Lagos", "Ikeja", "United Bank for Africa", "9988776655", "TUNDE BAKARE", "NIN-TUNDE-1", "BVN-TUNDE-1"),
  ];

  const opportunities: Opportunity[] = [
    opp({
      id: "mud-grains",
      kind: "mudarabah",
      name: "Kano Grains Trading Pool",
      summary: "A mudarabah that buys and sells millet, maize, and rice.",
      description: "Capital is pooled to purchase grains for resale. Profit is shared only when the books show a profit at maturity.",
      project: "Grain purchase and resale through Kano wholesalers.",
      min: 50000,
      max: 2000000,
      target: 25000000,
      outsideCapital: 14750000,
      outsideInvestors: 41,
      durationDays: 180,
      startDate: "2026-09-01",
      maturityDate: "2027-03-30",
      investorShare: 70,
      managerShare: 30,
      risk: "Commodity prices can fall. Capital can be lost. The ratio applies only when a profit exists.",
      terms: "Investor 70% and manager 30% of actual profit. Loss is borne by capital unless the manager breached the mandate.",
      shariah: "Mudarabah. This is not a loan and the profit is not interest.",
      status: "funding",
      createdBy: "adm-zainab",
      approvedBy: "adm-ada",
      publishedAt: now - 24 * DAY,
    }),
    opp({
      id: "ij-solar",
      kind: "ijarah",
      name: "School Solar Installation",
      summary: "Solar equipment leased to an educational trust in Ibadan.",
      description: "Participants fund identified solar equipment. The trust pays rent for use. Distributions follow rent actually collected.",
      project: "Rooftop solar leased to a school trust.",
      min: 25000,
      max: 2000000,
      target: 12000000,
      outsideCapital: 3325000,
      outsideInvestors: 18,
      durationDays: 1825,
      startDate: "2026-08-01",
      maturityDate: "2031-08-01",
      investorShare: 100,
      managerShare: 0,
      risk: "The trust may delay rent. Equipment can fail. Rental is not guaranteed.",
      terms: "Rent is distributed only when it is collected. Nothing on this contract is a promised yield.",
      shariah: "Ijarah of identified equipment. Payments are rental, not interest on a loan.",
      assetType: "Solar equipment",
      assetValue: 12000000,
      leaseStructure: "Operating lease of specified rooftop equipment.",
      rentalSchedule: "Monthly, when the lessee's rent is collected.",
      takaful: "Equipment takaful covers defined physical damage. It does not insure the rental stream.",
      status: "funding",
      createdBy: "adm-zainab",
      approvedBy: "adm-ada",
      publishedAt: now - 40 * DAY,
    }),
    opp({
      id: "mud-logistics",
      kind: "mudarabah",
      name: "Lagos Logistics Fleet",
      summary: "A fully funded haulage mudarabah. No new capital is accepted.",
      description: "Existing capital funds haulage contracts. The opportunity is closed to new investment.",
      project: "Contract haulage.",
      min: 100000,
      max: 5000000,
      target: 40000000,
      outsideCapital: 40000000,
      outsideInvestors: 22,
      durationDays: 270,
      startDate: "2026-06-01",
      maturityDate: "2027-02-26",
      investorShare: 60,
      managerShare: 40,
      risk: "This opportunity cannot take further investments.",
      terms: "Closed to new capital.",
      shariah: "Mudarabah. Closing the pool does not turn the contract into interest.",
      status: "fully_funded",
      createdBy: "adm-zainab",
      approvedBy: "adm-ada",
      publishedAt: now - 80 * DAY,
    }),
    opp({
      id: "ij-cold",
      kind: "ijarah",
      name: "Abuja Cold-Chain Warehouse",
      summary: "A leased warehouse with rental distributions from collected rent.",
      description: "The asset is a cold-chain warehouse leased to a food distributor.",
      project: "Cold storage lease.",
      min: 250000,
      max: 10000000,
      target: 80000000,
      outsideCapital: 22000000,
      outsideInvestors: 9,
      durationDays: 1460,
      startDate: "2026-04-01",
      maturityDate: "2030-04-01",
      investorShare: 100,
      managerShare: 0,
      risk: "Tenant default can interrupt rent. The lease is not a fixed-income security.",
      terms: "Quarterly rental, only from rent collected under the lease.",
      shariah: "Ijarah of a specified property. Rental is not a coupon.",
      assetType: "Warehouse",
      assetValue: 80000000,
      leaseStructure: "Lease of an identified cold-chain warehouse.",
      rentalSchedule: "Quarterly, from rent actually collected.",
      takaful: "Building takaful covers fire and defined structural risks. It is not income protection.",
      status: "lease_active",
      createdBy: "adm-zainab",
      approvedBy: "adm-ada",
      publishedAt: now - 100 * DAY,
    }),
    opp({
      id: "mud-sesame",
      kind: "mudarabah",
      name: "Kaduna Sesame Pool",
      summary: "Draft capital for a sesame trading mudarabah, waiting for approval.",
      description: "The manager would buy and sell sesame within an agreed mandate. Profit is shared at maturity if the venture makes a profit.",
      project: "Sesame purchase and export preparation.",
      min: 100000,
      max: 3000000,
      target: 18000000,
      durationDays: 240,
      startDate: "2026-10-15",
      maturityDate: "2027-06-12",
      investorShare: 65,
      managerShare: 35,
      risk: "Crop prices move. A loss is possible. No rate is promised.",
      terms: "Investor 65% and manager 35% of actual profit.",
      shariah: "Mudarabah. Publication waits for approval. The structure is not interest.",
      status: "pending_review",
      createdBy: "adm-zainab",
      approvedBy: "",
    }),
    opp({
      id: "mud-cocoa",
      kind: "mudarabah",
      name: "Ibadan Cocoa Trade",
      summary: "A draft mudarabah that is not yet submitted for review.",
      description: "Cocoa aggregation for resale. Still being documented.",
      project: "Cocoa aggregation.",
      min: 75000,
      max: 2000000,
      target: 9000000,
      durationDays: 150,
      startDate: "2026-11-01",
      maturityDate: "2027-03-31",
      investorShare: 70,
      managerShare: 30,
      risk: "Price and storage risk. Capital is at risk.",
      terms: "Investor 70% of actual profit.",
      shariah: "Mudarabah. This draft is not visible to clients.",
      status: "draft",
      createdBy: "adm-zainab",
      approvedBy: "",
    }),
    opp({
      id: "ij-clinic",
      kind: "ijarah",
      name: "Diagnostic Clinic Equipment",
      summary: "Equipment lease awaiting approval before publication.",
      description: "Diagnostic equipment would be leased to a clinic in Kano. Participants would own the leasing position, not a loan to the clinic.",
      project: "Medical equipment lease.",
      min: 100000,
      max: 5000000,
      target: 45000000,
      durationDays: 1095,
      startDate: "2026-11-01",
      maturityDate: "2029-11-01",
      investorShare: 100,
      managerShare: 0,
      risk: "The lessee may pay late. Rental amounts are not guaranteed.",
      terms: "Monthly rental from amounts actually collected.",
      shariah: "Ijarah. The contract is a lease of an identified asset, not interest on a loan.",
      assetType: "Medical equipment",
      assetValue: 45000000,
      leaseStructure: "Lease of specified diagnostic equipment.",
      rentalSchedule: "Monthly, from rent actually collected.",
      takaful: "Takaful against specified physical loss. It does not guarantee rental.",
      status: "pending_review",
      createdBy: "adm-zainab",
      approvedBy: "",
    }),
  ];

  return {
    admins,
    sessions: [],
    clients,
    kyc,
    wallets: [
      { clientId: "cl-amina", balance: 96650, available: 96650, locked: 0 },
      { clientId: "cl-ngozi", balance: 75000, available: 75000, locked: 0 },
      { clientId: "cl-halima", balance: 400000, available: 374900, locked: 25100 },
      { clientId: "cl-ibrahim", balance: 0, available: 0, locked: 0 },
      { clientId: "cl-seyi", balance: 0, available: 0, locked: 0 },
      { clientId: "cl-chioma", balance: 0, available: 0, locked: 0 },
      { clientId: "cl-fatima", balance: 0, available: 0, locked: 0 },
      { clientId: "cl-yusuf", balance: 0, available: 0, locked: 0 },
      { clientId: "cl-tunde", balance: 20000, available: 20000, locked: 0 },
    ],
    transactions: [
      tx("cl-amina", "deposit", 200000, "DEP-AMINA-1", "successful", "Wallet deposit confirmed", "credit", now - 15 * DAY),
      tx("cl-amina", "mudarabah_investment", 50000, "MDR-AMINA-1", "successful", "Kano Grains Trading Pool", "debit", now - 14 * DAY),
      tx("cl-amina", "fee", 250, "FEE-AMINA-ARR", "successful", "Arrangement fee for the mudarabah contract", "debit", now - 14 * DAY),
      tx("cl-amina", "ijarah_investment", 50000, "IJR-AMINA-1", "successful", "School Solar Installation", "debit", now - 13 * DAY),
      tx("cl-amina", "withdrawal", 10000, "WDR-AMINA-1", "successful", "Withdrawal to Guaranty Trust Bank", "debit", now - 10 * DAY),
      tx("cl-amina", "fee", 100, "FEE-AMINA-WDR", "successful", "Withdrawal fee", "debit", now - 10 * DAY),
      tx("cl-amina", "mudarabah_profit", 7000, "PRF-AMINA-1", "successful", "Mudarabah profit from recorded performance", "credit", now - 6 * DAY),
      tx("cl-amina", "client_onboarding_fee", 5000, "COF-AMINA-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 17 * DAY),
      tx("cl-ngozi", "deposit", 100000, "DEP-NGOZI-1", "successful", "Wallet deposit confirmed", "credit", now - 10 * DAY),
      tx("cl-ngozi", "ijarah_investment", 25000, "IJR-NGOZI-1", "successful", "School Solar Installation", "debit", now - 9 * DAY),
      tx("cl-ngozi", "client_onboarding_fee", 5000, "COF-NGOZI-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 12 * DAY),
      tx("cl-halima", "deposit", 400000, "DEP-HALIMA-1", "successful", "Wallet deposit confirmed", "credit", now - 8 * DAY),
      tx("cl-halima", "client_onboarding_fee", 5000, "COF-HALIMA-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 9 * DAY),
      tx("cl-tunde", "deposit", 20000, "DEP-TUNDE-1", "successful", "Wallet deposit confirmed", "credit", now - 20 * DAY),
      tx("cl-tunde", "client_onboarding_fee", 5000, "COF-TUNDE-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 29 * DAY),
      tx("cl-tunde", "reversal", 100, "DUP-REF-100", "failed", "Duplicate reference left for reconciliation", "neutral", now - 3 * DAY),
      tx("cl-tunde", "fee", 100, "DUP-REF-100", "failed", "Second record sharing DUP-REF-100", "neutral", now - 3 * DAY),
      tx("cl-chioma", "client_onboarding_fee", 5000, "COF-CHIOMA-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 3 * DAY),
      tx("cl-ibrahim", "client_onboarding_fee", 5000, "COF-IBRAHIM-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 4 * DAY),
      tx("cl-seyi", "client_onboarding_fee", 5000, "COF-SEYI-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 6 * DAY),
      tx("cl-fatima", "client_onboarding_fee", 5000, "COF-FATIMA-1", "successful", ONBOARDING_FEE_NAME, "neutral", now - 7 * DAY),
    ],
    deposits: [
      { id: "dep-amina", clientId: "cl-amina", amount: 200000, method: "Debit card", reference: "DEP-AMINA-1", status: "successful", note: "", createdAt: now - 15 * DAY },
      { id: "dep-ngozi", clientId: "cl-ngozi", amount: 100000, method: "Bank transfer", reference: "DEP-NGOZI-1", status: "successful", note: "", createdAt: now - 10 * DAY },
      { id: "dep-halima", clientId: "cl-halima", amount: 400000, method: "Bank transfer", reference: "DEP-HALIMA-1", status: "successful", note: "", createdAt: now - 8 * DAY },
      { id: "dep-tunde", clientId: "cl-tunde", amount: 20000, method: "Debit card", reference: "DEP-TUNDE-1", status: "successful", note: "", createdAt: now - 20 * DAY },
      { id: "dep-tunde-miss", clientId: "cl-tunde", amount: 5000, method: "Bank transfer", reference: "DEP-TUNDE-MISS", status: "successful", note: "Gateway reported success. Wallet credit is missing.", createdAt: now - 2 * DAY },
      { id: "dep-chioma", clientId: "cl-chioma", amount: 15000, method: "Debit card", reference: "DEP-CHIOMA-FAIL", status: "failed", note: "Issuer declined the charge.", createdAt: now - 3600000 },
      { id: "dep-yusuf", clientId: "cl-yusuf", amount: 25000, method: "Bank transfer", reference: "DEP-YUSUF-PEND", status: "pending", note: "Transfer reference not matched yet.", createdAt: now - 6 * 3600000 },
    ],
    withdrawals: [
      {
        id: "wd-amina",
        clientId: "cl-amina",
        bankName: "Guaranty Trust Bank",
        accountName: "AMINA SEFI BELLO",
        accountNumber: "0123456789",
        amount: 10000,
        fee: 100,
        availableAtRequest: 106750,
        status: "completed",
        reference: "WDR-AMINA-1",
        reason: "",
        reviewedBy: "adm-chinedu",
        createdAt: now - 10 * DAY,
      },
      {
        id: "wd-halima",
        clientId: "cl-halima",
        bankName: "Zenith Bank",
        accountName: "HALIMA SANI",
        accountNumber: "2211003344",
        amount: 25000,
        fee: 100,
        availableAtRequest: 400000,
        status: "pending",
        reference: "WDR-HALIMA-1",
        reason: "",
        reviewedBy: "",
        createdAt: now - 26 * 3600000,
      },
    ],
    clientFees: [
      fee("cl-amina", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-AMINA-1", "successful", now - 17 * DAY),
      fee("cl-amina", "Arrangement fee", 250, "Wallet", "FEE-AMINA-ARR", "successful", now - 14 * DAY),
      fee("cl-amina", "Withdrawal fee", 100, "Wallet", "FEE-AMINA-WDR", "successful", now - 10 * DAY),
      fee("cl-ngozi", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-NGOZI-1", "successful", now - 12 * DAY),
      fee("cl-halima", ONBOARDING_FEE_NAME, 5000, "Bank transfer", "COF-HALIMA-1", "successful", now - 9 * DAY),
      fee("cl-ibrahim", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-IBRAHIM-1", "successful", now - 4 * DAY),
      fee("cl-seyi", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-SEYI-1", "successful", now - 6 * DAY),
      fee("cl-chioma", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-CHIOMA-1", "successful", now - 3 * DAY),
      fee("cl-fatima", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-FATIMA-1", "successful", now - 7 * DAY),
      fee("cl-yusuf", ONBOARDING_FEE_NAME, 5000, "Bank transfer", "COF-YUSUF-FAIL", "failed", now - 20 * 3600000),
      fee("cl-yusuf", ONBOARDING_FEE_NAME, 5000, "Bank transfer", "COF-YUSUF-PEND", "pending", now - 6 * 3600000),
      fee("cl-tunde", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-TUNDE-1", "successful", now - 29 * DAY),
      fee("cl-tunde", ONBOARDING_FEE_NAME, 5000, "Debit card", "COF-TUNDE-REV", "reversed", now - 21 * DAY),
    ],
    feeSettings: [
      { id: "fee-onboarding", name: ONBOARDING_FEE_NAME, description: "Required before KYC can begin. A failed or pending payment does not unlock KYC.", method: "fixed", amount: 5000, status: "active", effectiveAt: now - 60 * DAY, updatedBy: "adm-ada" },
      { id: "fee-withdrawal", name: "Withdrawal fee", description: "Charged when available funds are sent to a verified bank account.", method: "fixed", amount: 100, status: "active", effectiveAt: now - 60 * DAY, updatedBy: "adm-ada" },
      { id: "fee-mudarabah", name: "Mudarabah arrangement fee", description: "Administration of the mudarabah contract. This is not interest and it is not a share of profit.", method: "percent", amount: 0.5, status: "active", effectiveAt: now - 60 * DAY, updatedBy: "adm-ada" },
      { id: "fee-ijarah", name: "Ijarah arrangement fee", description: "No arrangement fee is charged on Ijarah participation.", method: "fixed", amount: 0, status: "active", effectiveAt: now - 60 * DAY, updatedBy: "adm-ada" },
    ],
    opportunities,
    holdings: [
      { id: "h-amina-grains", clientId: "cl-amina", opportunityId: "mud-grains", amount: 50000, fee: 250, status: "active", investedAt: now - 14 * DAY, startDate: now - 14 * DAY, maturityDate: now + 166 * DAY, reference: "MDR-AMINA-1" },
      { id: "h-amina-solar", clientId: "cl-amina", opportunityId: "ij-solar", amount: 50000, fee: 0, status: "active", investedAt: now - 13 * DAY, startDate: now - 13 * DAY, maturityDate: now + 1700 * DAY, reference: "IJR-AMINA-1" },
      { id: "h-ngozi-solar", clientId: "cl-ngozi", opportunityId: "ij-solar", amount: 25000, fee: 0, status: "active", investedAt: now - 9 * DAY, startDate: now - 9 * DAY, maturityDate: now + 1700 * DAY, reference: "IJR-NGOZI-1" },
    ],
    distributions: [
      {
        id: "dist-grains-1",
        kind: "mudarabah_profit",
        opportunityId: "mud-grains",
        performanceAmount: 10000,
        investorPool: 7000,
        performanceNote: "Grain resale for this cycle closed with a profit of 10000. Investor share is 70% under the agreement.",
        status: "completed",
        lines: [{ id: "line-amina-1", clientId: "cl-amina", holdingId: "h-amina-grains", amount: 7000, reference: "PRF-AMINA-1" }],
        preparedBy: "adm-zainab",
        approvedBy: "adm-chinedu",
        reason: "",
        createdAt: now - 7 * DAY,
        executedAt: now - 6 * DAY,
      },
      {
        id: "dist-solar-draft",
        kind: "ijarah_rental",
        opportunityId: "ij-solar",
        performanceAmount: 9000,
        investorPool: 9000,
        performanceNote: "September rent collected from the school trust. Split across recorded capital only.",
        status: "draft",
        lines: [
          { id: "line-amina-solar", clientId: "cl-amina", holdingId: "h-amina-solar", amount: 6000, reference: "RNT-AMINA-SEP" },
          { id: "line-ngozi-solar", clientId: "cl-ngozi", holdingId: "h-ngozi-solar", amount: 3000, reference: "RNT-NGOZI-SEP" },
        ],
        preparedBy: "adm-zainab",
        approvedBy: "",
        reason: "",
        createdAt: now - 5 * 3600000,
        executedAt: null,
      },
    ],
    agreements: [
      agreement("agr-mud-11", "Mudarabah participation agreement", "mudarabah", "1.1", now - 200 * DAY, "retired", "Earlier mudarabah terms. Kept for clients who accepted this version.", "adm-zainab", "adm-ada"),
      agreement("agr-mud-12", "Mudarabah participation agreement", "mudarabah", "1.2", now - 30 * DAY, "active", "Capital is entrusted to the manager. Profit is shared at the stated ratio only when the venture makes a profit. Loss follows the mudarabah rules. This contract does not pay interest.", "adm-zainab", "adm-ada"),
      agreement("agr-ij-11", "Ijarah participation agreement", "ijarah", "1.1", now - 30 * DAY, "active", "The client participates in a lease of an identified asset. Payments are rental collected from the lessee. Rental is not interest and it is not guaranteed.", "adm-zainab", "adm-ada"),
    ],
    notifications: [
      { id: "nt-1", clientId: "cl-amina", category: "investments", title: "Profit distributed", message: "A mudarabah profit of ₦7,000.00 was credited from recorded performance. This is not interest.", createdAt: now - 6 * DAY, createdBy: "adm-chinedu" },
      { id: "nt-2", clientId: "cl-ibrahim", category: "account", title: "KYC submitted", message: "Your KYC application is waiting for review.", createdAt: now - 5 * 3600000, createdBy: "system" },
      { id: "nt-3", clientId: "cl-fatima", category: "account", title: "KYC needs an update", message: "The NIN details need to match your legal name before review can continue.", createdAt: now - 2 * DAY, createdBy: "adm-ibrahim" },
      { id: "nt-4", clientId: "cl-yusuf", category: "payments", title: "Client Onboarding Fee pending", message: "KYC stays locked until the Client Onboarding Fee is successful.", createdAt: now - 6 * 3600000, createdBy: "system" },
    ],
    tickets: [
      {
        id: "tkt-amina",
        clientId: "cl-amina",
        subject: "Wallet receipt",
        category: "Payments",
        priority: "normal",
        status: "open",
        assignedTo: "",
        createdAt: now - 3600000,
        messages: [{ id: "msg-1", author: "Amina Sefi Bello", kind: "client", body: "I need a copy of the withdrawal receipt for my records.", at: now - 3600000 }],
      },
      {
        id: "tkt-halima",
        clientId: "cl-halima",
        subject: "Withdrawal still pending",
        category: "Payments",
        priority: "high",
        status: "in_progress",
        assignedTo: "adm-maryam",
        createdAt: now - 20 * 3600000,
        messages: [
          { id: "msg-2", author: "Halima Sani", kind: "client", body: "I requested a withdrawal yesterday. Can you confirm it is in review?", at: now - 20 * 3600000 },
          { id: "msg-3", author: "Maryam Bello", kind: "staff", body: "Your request is in the finance queue. Invested funds are not part of it.", at: now - 18 * 3600000 },
          { id: "msg-4", author: "Maryam Bello", kind: "internal", body: "Waiting on finance to pick up WDR-HALIMA-1.", at: now - 18 * 3600000 },
        ],
      },
    ],
    audit: [
      auditRow("aud-1", admins[0], "Admin login", "Session", "", "Signed in", "", now - 2 * 3600000),
      auditRow("aud-2", admins[2], "Investment submitted", "Kaduna Sesame Pool", "Draft", "Pending review", "Ready for Shariah and risk review", now - 2 * DAY),
      auditRow("aud-3", admins[3], "Distribution executed", "Kano Grains Trading Pool", "Approved", "Completed", "Profit from recorded grain resale", now - 6 * DAY),
    ],
    settings: {
      platformName: "Tefu Investment",
      supportEmail: "support@tefuinvestment.com",
      supportPhone: "08090001111",
      paymentMethods: ["Debit card", "Bank transfer"],
      sessionMinutes: 480,
      require2fa: false,
      passwordMinLength: 8,
    },
    otp: null,
  };
}

function client(id: string, firstName: string, middleName: string, lastName: string, email: string, phone: string, accountStatus: Client["accountStatus"], registeredAt: number, lastActivity: number, activatedAt: number | null): Client {
  return { id, firstName, middleName, lastName, email, phone, accountStatus, registeredAt, lastActivity, lastLogin: lastActivity, activatedAt };
}

function emptyKyc(owner: Client): KycRecord {
  return {
    clientId: owner.id,
    status: "not_started",
    personal: person(owner, { fullName: "", nationality: "" }),
    nin: verify("not_started"),
    bvn: verify("not_started"),
    bank: { bank: "", accountNumber: "", accountName: "", status: "not_started" },
    document: { type: "", status: "not_submitted", uploadedAt: null, reviewNote: "", reviewedBy: "", reviewedAt: null },
    selfie: { status: "not_submitted", uploadedAt: null, reviewNote: "", reviewedBy: "", reviewedAt: null },
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: "",
    rejectionReason: "",
    updateRequest: "",
    history: [],
  };
}

function partialKyc(owner: Client): KycRecord {
  const row = emptyKyc(owner);
  row.status = "in_progress";
  row.personal = person(owner, { dob: "1996-02-14", gender: "Female", address: "11 Admiralty Way, Lekki", state: "Lagos", lga: "Eti-Osa" });
  row.nin = verify("pending", "NIN-CHIOMA-PEND", "Verification requested. Result not back yet.");
  row.history = [{ at: owner.registeredAt, action: "Personal information saved", by: "client", note: "" }];
  return row;
}

function reviewKyc(owner: Client, submittedAt: number): KycRecord {
  const row = emptyKyc(owner);
  row.status = "pending_review";
  row.personal = person(owner, { dob: "1990-06-21", gender: "Male", address: "4 Zoo Road", state: "Kano", lga: "Nassarawa" });
  row.nin = verify("verified", "NIN-IBRAHIM-1", "Name matched Ibrahim Musa Danladi.", submittedAt, "Matched");
  row.bvn = verify("verified", "BVN-IBRAHIM-1", "Name matched Ibrahim Musa Danladi.", submittedAt, "Matched");
  row.bank = { bank: "First Bank", accountNumber: "3099887766", accountName: "IBRAHIM MUSA DANLADI", status: "verified" };
  row.document = { type: "National ID", status: "pending", uploadedAt: submittedAt, reviewNote: "", reviewedBy: "", reviewedAt: null };
  row.selfie = { status: "pending", uploadedAt: submittedAt, reviewNote: "", reviewedBy: "", reviewedAt: null };
  row.submittedAt = submittedAt;
  row.history = [{ at: submittedAt, action: "Submitted for review", by: "client", note: "NIN and BVN verified. Documents are waiting for a reviewer." }];
  return row;
}

function failedNinKyc(owner: Client, submittedAt: number): KycRecord {
  const row = reviewKyc(owner, submittedAt);
  row.personal = person(owner, { dob: "1993-09-09", gender: "Male", address: "19 Aba Road", state: "Abia", lga: "Aba North" });
  row.nin = verify("failed", "NIN-SEYI-FAIL", "Returned name did not match the profile.", submittedAt, "Not matched");
  row.bvn = verify("verified", "BVN-SEYI-1", "Name matched Seyi Okonkwo.", submittedAt, "Matched");
  row.bank = { bank: "Access Bank", accountNumber: "0044556677", accountName: "SEYI OKONKWO", status: "verified" };
  row.history = [{ at: submittedAt, action: "Submitted for review", by: "client", note: "NIN verification failed." }];
  return row;
}

function updateKyc(owner: Client, at: number): KycRecord {
  const row = emptyKyc(owner);
  row.status = "requires_update";
  row.personal = person(owner, { dob: "1992-12-01", gender: "Female", address: "6 Aminu Kano Crescent", state: "FCT", lga: "Municipal" });
  row.nin = verify("requires_update", "NIN-FATIMA-1", "Date of birth did not match.", at, "Needs update");
  row.updateRequest = "Update the NIN record so the date of birth matches 1 Dec 1992.";
  row.reviewedAt = at;
  row.reviewedBy = "adm-ibrahim";
  row.history = [{ at, action: "Update requested", by: "Ibrahim Lawal", note: row.updateRequest }];
  return row;
}

function approvedKyc(owner: Client, at: number, dob: string, gender: string, address: string, state: string, lga: string, bank: string, accountNumber: string, accountName: string, ninRef: string, bvnRef: string): KycRecord {
  const row = emptyKyc(owner);
  row.status = "approved";
  row.personal = person(owner, { dob, gender, address, state, lga });
  row.nin = verify("verified", ninRef, `Name matched ${fullName(owner)}.`, at, "Matched");
  row.bvn = verify("verified", bvnRef, `Name matched ${fullName(owner)}.`, at, "Matched");
  row.bank = { bank, accountNumber, accountName, status: "verified" };
  row.document = { type: "National ID", status: "approved", uploadedAt: at - DAY, reviewNote: "Readable and consistent.", reviewedBy: "adm-ibrahim", reviewedAt: at };
  row.selfie = { status: "approved", uploadedAt: at - DAY, reviewNote: "Matches the identification document.", reviewedBy: "adm-ibrahim", reviewedAt: at };
  row.submittedAt = at - DAY;
  row.reviewedAt = at;
  row.reviewedBy = "adm-ibrahim";
  row.history = [
    { at: at - DAY, action: "Submitted for review", by: "client", note: "" },
    { at, action: "Approved", by: "Ibrahim Lawal", note: "Mandatory checks were complete." },
  ];
  return row;
}

function opp(input: Partial<Opportunity> & Pick<Opportunity, "id" | "kind" | "name" | "status">): Opportunity {
  return {
    summary: "",
    description: "",
    project: "",
    min: 0,
    max: 0,
    target: 0,
    outsideCapital: 0,
    outsideInvestors: 0,
    durationDays: 0,
    startDate: "",
    maturityDate: "",
    investorShare: 0,
    managerShare: 0,
    risk: "",
    terms: "",
    shariah: "",
    assetType: "",
    assetValue: 0,
    leaseStructure: "",
    rentalSchedule: "",
    takaful: "",
    createdBy: "",
    approvedBy: "",
    publishedAt: null,
    documents: [
      { title: "Risk disclosure", body: input.risk ?? "" },
      { title: "Structure note", body: input.shariah ?? "" },
    ],
    ...input,
  };
}

function tx(clientId: string, type: AppState["transactions"][number]["type"], amount: number, reference: string, status: string, description: string, direction: "credit" | "debit" | "neutral", createdAt: number) {
  return { id: uid(), clientId, type, amount, reference, status, description, direction, createdAt };
}

function fee(clientId: string, name: string, amount: number, method: string, reference: string, status: AppState["clientFees"][number]["status"], createdAt: number) {
  return { id: uid(), clientId, name, amount, method, reference, status, createdAt };
}

function agreement(id: string, name: string, type: string, version: string, effectiveAt: number, status: "draft" | "active" | "retired", body: string, createdBy: string, approvedBy: string) {
  return { id, name, type, version, effectiveAt, status, body, createdBy, approvedBy };
}

function auditRow(id: string, admin: AdminUser, action: string, target: string, previousValue: string, newValue: string, reason: string, createdAt: number) {
  return { id, adminId: admin.id, adminName: admin.name, role: admin.role, action, target, previousValue, newValue, reason, createdAt, session: "Seed · local" };
}
