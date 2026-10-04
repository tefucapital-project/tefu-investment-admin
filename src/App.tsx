import { Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/shell";
import { AdminProvider } from "./context/AdminState";
import { LoginPage } from "./pages/auth";
import { ClientProfilePage, ClientsPage } from "./pages/clients";
import { DashboardPage } from "./pages/dashboard";
import { AgreementsPage, DistributionDetailPage, DistributionFormPage, DistributionsPage, HoldingDetailPage, HoldingsPage, OpportunityDetailPage, OpportunityFormPage, OpportunityListPage } from "./pages/invest";
import { DocumentsPage, KycQueuePage, KycReviewPage } from "./pages/kyc";
import { DepositsPage, FeesPage, ReconciliationPage, TransactionsPage, WalletDetailPage, WalletsPage, WithdrawalsPage } from "./pages/money";
import { NotificationsPage, ReportsPage, SupportPage, TicketPage } from "./pages/ops";
import { AdminsPage, AuditPage, SecurityPage, SettingsPage } from "./pages/system";

export default function App() {
  return (
    <AdminProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientProfilePage />} />
          <Route path="/kyc" element={<KycQueuePage />} />
          <Route path="/kyc/:clientId" element={<KycReviewPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/fees" element={<FeesPage />} />
          <Route path="/wallets" element={<WalletsPage />} />
          <Route path="/wallets/:clientId" element={<WalletDetailPage />} />
          <Route path="/deposits" element={<DepositsPage />} />
          <Route path="/withdrawals" element={<WithdrawalsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/reconciliation" element={<ReconciliationPage />} />
          <Route path="/mudarabah" element={<OpportunityListPage kind="mudarabah" />} />
          <Route path="/mudarabah/new" element={<OpportunityFormPage kind="mudarabah" />} />
          <Route path="/mudarabah/:id/edit" element={<OpportunityFormPage kind="mudarabah" />} />
          <Route path="/mudarabah/:id" element={<OpportunityDetailPage />} />
          <Route path="/ijarah" element={<OpportunityListPage kind="ijarah" />} />
          <Route path="/ijarah/new" element={<OpportunityFormPage kind="ijarah" />} />
          <Route path="/ijarah/:id/edit" element={<OpportunityFormPage kind="ijarah" />} />
          <Route path="/ijarah/:id" element={<OpportunityDetailPage />} />
          <Route path="/investments" element={<HoldingsPage />} />
          <Route path="/investments/:holdingId" element={<HoldingDetailPage />} />
          <Route path="/distributions" element={<DistributionsPage />} />
          <Route path="/distributions/new" element={<DistributionFormPage />} />
          <Route path="/distributions/:id" element={<DistributionDetailPage />} />
          <Route path="/agreements" element={<AgreementsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/support/:ticketId" element={<TicketPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admins" element={<AdminsPage />} />
          <Route path="/security" element={<SecurityPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
}
