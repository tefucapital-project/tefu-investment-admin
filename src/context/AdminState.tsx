import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyPassword, createAdminUser, loginAdmin, logoutAdmin, verifyAdminCode } from "../lib/engine";
import { digest, passwordIssue, uid } from "../lib/format";
import { api, clearTokens, hasToken, readProfile, saveProfile, saveTokens, type AdminApiProfile } from "../lib/api";
import { applyLiveClients, liveAdminUser, type LiveClient } from "../lib/live";
import { can } from "../lib/permissions";
import { createSeed, ensureStaffLogins } from "../lib/seed";
import { clearStoredState, loadState, persist, readSessionId, writeSessionId } from "../lib/storage";
import type { ActionResult, AdminUser, AppState, Permission, Role } from "../lib/types";

type AdminValue = {
  ready: boolean;
  state: AppState | null;
  admin: AdminUser | null;
  sessionId: string;
  liveMode: boolean;
  allowed: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<ActionResult<{ needsCode: boolean; preview: string; sessionId: string }>>;
  verifyCode: (code: string) => Promise<ActionResult<{ sessionId: string }>>;
  logout: () => void;
  commit: <T>(mutator: (draft: AppState, actor: AdminUser) => ActionResult<T>) => ActionResult<T>;
  changePassword: (current: string, next: string) => Promise<ActionResult>;
  createAdmin: (input: { name: string; email: string; role: Role; password: string }) => Promise<ActionResult>;
  refreshClients: () => Promise<void>;
  decideKycLive: (input: {
    recordId: string;
    decision: "approve" | "reject" | "update";
    reason: string;
  }) => Promise<ActionResult>;
  resetDemo: () => void;
};

const AdminContext = createContext<AdminValue | null>(null);
const LIVE_SESSION = "live-admin-session";

function actorIn(state: AppState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId && item.expiresAt > Date.now());
  if (!session) return null;
  return state.admins.find((item) => item.id === session.adminId && item.status === "active") ?? null;
}

function attachLiveAdmin(state: AppState, profile: AdminApiProfile) {
  const admin = liveAdminUser(profile);
  const next = structuredClone(state);
  const existing = next.admins.findIndex((item) => item.id === admin.id || item.email === admin.email);
  if (existing >= 0) next.admins[existing] = admin;
  else next.admins.unshift(admin);
  next.sessions = [
    { id: LIVE_SESSION, adminId: admin.id, device: "api", createdAt: Date.now(), expiresAt: Date.now() + 12 * 60 * 60 * 1000 },
    ...next.sessions.filter((item) => item.id !== LIVE_SESSION),
  ];
  next.settings.require2fa = false;
  return { state: next, admin };
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [liveMode, setLiveMode] = useState(false);

  function save(next: AppState, nextSession = sessionId) {
    persist(next);
    setState(next);
    setSessionId(nextSession);
    writeSessionId(nextSession);
  }

  async function pullClients(base: AppState) {
    const result = await api<LiveClient[]>("/clients");
    return applyLiveClients(base, result.data);
  }

  const refreshClients = useCallback(async () => {
    if (!hasToken()) return;
    try {
      const base = loadState() ?? (await createSeed());
      const next = await pullClients(base);
      const nextSession = readSessionId() || LIVE_SESSION;
      persist(next);
      setState(next);
      setSessionId(nextSession);
      writeSessionId(nextSession);
      setLiveMode(true);
    } catch {
      /* keep current view if refresh fails */
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      let next = loadState();
      if (!next) {
        next = await createSeed();
        if (loadState()) next = loadState() as AppState;
        else persist(next);
      }
      if (await ensureStaffLogins(next)) persist(next);

      if (hasToken()) {
        try {
          const me = await api<AdminApiProfile>("/me");
          saveProfile(me.data);
          const attached = attachLiveAdmin(next, me.data);
          next = await pullClients(attached.state);
          if (cancel) return;
          setLiveMode(true);
          save(next, LIVE_SESSION);
          setReady(true);
          return;
        } catch {
          clearTokens();
          setLiveMode(false);
        }
      }

      if (cancel) return;
      const stored = readSessionId();
      const profile = readProfile();
      if (profile && stored === LIVE_SESSION) {
        clearTokens();
      }
      setState(next);
      setSessionId(actorIn(next, stored) ? stored : "");
      if (!actorIn(next, stored)) writeSessionId("");
      setReady(true);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const admin = useMemo(() => (state && sessionId ? actorIn(state, sessionId) : null), [state, sessionId]);

  async function login(email: string, password: string) {
    if (!state) return { ok: false as const, error: "The console is still opening." };
    try {
      const result = await api<{ accessToken: string; refreshToken: string; role: string; name: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveTokens(result.data.accessToken, result.data.refreshToken);
      const profile: AdminApiProfile = {
        id: `admin-${email.toLowerCase()}`,
        email: email.toLowerCase(),
        name: result.data.name,
        role: result.data.role,
      };
      try {
        const me = await api<AdminApiProfile>("/me");
        profile.id = me.data.id;
        profile.name = me.data.name;
        profile.role = me.data.role;
        profile.email = me.data.email;
      } catch {
        /* login payload is enough to continue */
      }
      saveProfile(profile);
      const attached = attachLiveAdmin(state, profile);
      const withClients = await pullClients(attached.state);
      setLiveMode(true);
      save(withClients, LIVE_SESSION);
      return { ok: true as const, data: { needsCode: false, preview: "", sessionId: LIVE_SESSION } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in failed.";
      if (/fetch|network|failed to fetch/i.test(message) || (error as { status?: number }).status === undefined) {
        const draft = structuredClone(state);
        const result = await loginAdmin(draft, email, password);
        const nextSession = result.ok && result.data?.sessionId ? result.data.sessionId : sessionId;
        setLiveMode(false);
        save(draft, result.ok && result.data?.sessionId ? nextSession : sessionId);
        return result;
      }
      return { ok: false as const, error: message };
    }
  }

  async function verifyCode(code: string) {
    if (!state) return { ok: false as const, error: "The console is still opening." };
    const draft = structuredClone(state);
    const result = await verifyAdminCode(draft, code);
    save(draft, result.ok && result.data ? result.data.sessionId : "");
    return result;
  }

  function logout() {
    if (!state || !admin) return;
    if (liveMode || hasToken()) {
      void api("/auth/logout", { method: "POST" }).catch(() => undefined);
      clearTokens();
      setLiveMode(false);
      writeSessionId("");
      setSessionId("");
      return;
    }
    const draft = structuredClone(state);
    const actor = draft.admins.find((item) => item.id === admin.id);
    if (!actor) return;
    logoutAdmin(draft, actor, sessionId);
    save(draft, "");
  }

  function commit<T>(mutator: (draft: AppState, actor: AdminUser) => ActionResult<T>): ActionResult<T> {
    if (!state || !admin) return { ok: false, error: "Sign in to continue." };
    if (liveMode) {
      return { ok: false, error: "This action still uses the local demo engine. Client data is live from the API." };
    }
    const draft = structuredClone(state);
    const actor = draft.admins.find((item) => item.id === admin.id);
    if (!actor) return { ok: false, error: "Sign in to continue." };
    const result = mutator(draft, actor);
    if (result.ok) save(draft);
    return result;
  }

  async function changePassword(current: string, next: string) {
    if (!state || !admin) return { ok: false as const, error: "Sign in to continue." };
    if (liveMode) return { ok: false as const, error: "Change the admin password from the seeded staff account or database for now." };
    const issue = passwordIssue(next, state.settings.passwordMinLength);
    if (issue) return { ok: false as const, error: issue };
    const currentHash = await digest(admin.passwordSalt, current);
    if (currentHash !== admin.passwordHash) return { ok: false as const, error: "The current password is not correct." };
    const salt = uid();
    const hash = await digest(salt, next);
    return commit((draft, actor) => applyPassword(draft, actor, sessionId, salt, hash));
  }

  async function createAdmin(input: { name: string; email: string; role: Role; password: string }) {
    if (!state) return { ok: false as const, error: "Sign in to continue." };
    if (liveMode) {
      try {
        const [firstName, ...rest] = input.name.trim().split(/\s+/);
        await api("/admins", {
          method: "POST",
          body: JSON.stringify({
            firstName: firstName || "Staff",
            lastName: rest.join(" ") || "Admin",
            email: input.email,
            password: input.password,
            role: input.role.toUpperCase(),
          }),
        });
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : "Could not create admin." };
      }
    }
    const issue = passwordIssue(input.password, state.settings.passwordMinLength);
    if (issue) return { ok: false as const, error: issue };
    const passwordSalt = uid();
    const passwordHash = await digest(passwordSalt, input.password);
    return commit((draft, actor) => createAdminUser(draft, actor, { ...input, passwordSalt, passwordHash }));
  }

  function resetDemo() {
    clearTokens();
    clearStoredState();
    window.location.assign("/login");
  }

  async function decideKycLive(input: {
    recordId: string;
    decision: "approve" | "reject" | "update";
    reason: string;
  }) {
    if (!input.recordId) return { ok: false as const, error: "Missing KYC record id. Refresh the client list and try again." };
    if (input.decision !== "approve" && input.reason.trim().length < 3) {
      return { ok: false as const, error: "Enter a reason for this decision." };
    }
    try {
      const path =
        input.decision === "approve"
          ? `/kyc/${input.recordId}/approve`
          : input.decision === "reject"
            ? `/kyc/${input.recordId}/reject`
            : `/kyc/${input.recordId}/request-update`;
      await api(path, {
        method: "POST",
        body: JSON.stringify(input.decision === "approve" ? {} : { reason: input.reason.trim() }),
      });
      await refreshClients();
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "KYC decision failed." };
    }
  }

  const value: AdminValue = {
    ready,
    state,
    admin,
    sessionId,
    liveMode,
    allowed: (permission) => (admin ? can(admin.role, permission) : false),
    login,
    verifyCode,
    logout,
    commit,
    changePassword,
    createAdmin,
    refreshClients,
    decideKycLive,
    resetDemo,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
