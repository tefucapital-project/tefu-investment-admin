import { Bell, Briefcase, Building2, Coins, FolderOpen, LayoutDashboard, LifeBuoy, Lock, LogOut, Menu, PieChart, Receipt, Shield, Sprout, Users, Wallet, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAdmin } from "../context/AdminState";
import { ROLE_LABEL } from "../lib/labels";
import type { Permission } from "../lib/types";

const links: { to: string; label: string; icon: typeof Users; permission?: Permission | Permission[] }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users, permission: "clients.view" },
  { to: "/kyc", label: "KYC", icon: Shield, permission: "kyc.review" },
  { to: "/documents", label: "Documents", icon: FolderOpen, permission: "documents.review" },
  { to: "/fees", label: "Client fees", icon: Receipt, permission: "fees.view" },
  { to: "/wallets", label: "Wallets", icon: Wallet, permission: "wallets.view" },
  { to: "/deposits", label: "Deposits", icon: Receipt, permission: "deposits.manage" },
  { to: "/withdrawals", label: "Withdrawals", icon: Wallet, permission: "withdrawals.review" },
  { to: "/transactions", label: "Transactions", icon: Receipt, permission: "transactions.view" },
  { to: "/reconciliation", label: "Reconciliation", icon: PieChart, permission: "reconciliation.view" },
  { to: "/mudarabah", label: "Mudarabah", icon: Sprout, permission: "investments.manage" },
  { to: "/ijarah", label: "Ijarah", icon: Building2, permission: "investments.manage" },
  { to: "/investments", label: "Investments", icon: Briefcase, permission: "investments.manage" },
  { to: "/distributions", label: "Distributions", icon: Coins, permission: ["distributions.prepare", "distributions.decide"] },
  { to: "/agreements", label: "Agreements", icon: FolderOpen, permission: "investments.manage" },
  { to: "/notifications", label: "Notifications", icon: Bell, permission: "notifications.send" },
  { to: "/support", label: "Support", icon: LifeBuoy, permission: "tickets.manage" },
  { to: "/reports", label: "Reports", icon: PieChart, permission: "reports.view" },
  { to: "/audit", label: "Audit log", icon: Shield, permission: "audit.view" },
  { to: "/settings", label: "Settings", icon: Lock, permission: "settings.manage" },
  { to: "/admins", label: "Admins", icon: Users, permission: "admins.manage" },
  { to: "/security", label: "Security", icon: Lock },
];

function allowedLink(permission: Permission | Permission[] | undefined, allowed: (permission: Permission) => boolean) {
  if (!permission) return true;
  const list = Array.isArray(permission) ? permission : [permission];
  return list.some((item) => allowed(item));
}

export function AdminLayout() {
  const { ready, admin } = useAdmin();
  if (!ready) return <p className="p-8 text-sm text-muted">Opening the console…</p>;
  if (!admin) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { admin, allowed, logout } = useAdmin();
  const [open, setOpen] = useState(false);
  if (!admin) return null;
  const items = links.filter((item) => allowedLink(item.permission, allowed));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="forest-panel hidden text-gold2 lg:block">
        <div className="sticky top-0 flex h-screen flex-col px-4 py-6">
          <p className="px-2 font-serif text-2xl">Tefu</p>
          <p className="px-2 text-xs text-gold2/70">Staff console</p>
          <nav className="mt-6 flex-1 space-y-1 overflow-auto">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex items-center gap-2 rounded-2xl px-3 py-2 text-sm ${isActive ? "bg-white/10" : "text-gold2/80 hover:bg-white/5"}`}>
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-white/10 px-2 pt-4 text-xs">
            <p>{admin.name}</p>
            <p className="text-gold2/70">{ROLE_LABEL[admin.role]}</p>
            <button className="mt-3 inline-flex items-center gap-2 text-sm" onClick={logout} type="button"><LogOut size={14} /> Sign out</button>
          </div>
        </div>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-line bg-paper px-4 py-3 lg:px-8">
          <button className="lg:hidden" type="button" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <p className="text-sm text-muted">{ROLE_LABEL[admin.role]}</p>
          <p className="text-sm">{admin.name}</p>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
        <p className="px-4 pb-8 text-xs text-muted lg:px-8">Staff only. Records stay in this browser. Profit and rental follow actual performance.</p>
      </div>
      {open ? (
        <div className="fixed inset-0 z-20 bg-forest/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="forest-panel h-full w-72 overflow-auto p-4 text-gold2" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            <nav className="mt-4 space-y-1">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"} onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-2 text-sm">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
