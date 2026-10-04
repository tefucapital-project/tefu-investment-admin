import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyPassword, createAdminUser, loginAdmin, logoutAdmin, verifyAdminCode } from "../lib/engine";
import { digest, passwordIssue, uid } from "../lib/format";
import { can } from "../lib/permissions";
import { createSeed, ensureStaffLogins } from "../lib/seed";
import { clearStoredState, loadState, persist, readSessionId, writeSessionId } from "../lib/storage";
import type { ActionResult, AdminUser, AppState, Permission, Role } from "../lib/types";

type AdminValue = {
  ready: boolean;
  state: AppState | null;
  admin: AdminUser | null;
  sessionId: string;
  allowed: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<ActionResult<{ needsCode: boolean; preview: string; sessionId: string }>>;
  verifyCode: (code: string) => Promise<ActionResult<{ sessionId: string }>>;
  logout: () => void;
  commit: <T>(mutator: (draft: AppState, actor: AdminUser) => ActionResult<T>) => ActionResult<T>;
  changePassword: (current: string, next: string) => Promise<ActionResult>;
  createAdmin: (input: { name: string; email: string; role: Role; password: string }) => Promise<ActionResult>;
  resetDemo: () => void;
};

const AdminContext = createContext<AdminValue | null>(null);

function actorIn(state: AppState, sessionId: string) {
  const session = state.sessions.find((item) => item.id === sessionId && item.expiresAt > Date.now());
  if (!session) return null;
  return state.admins.find((item) => item.id === session.adminId && item.status === "active") ?? null;
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<AppState | null>(null);
  const [sessionId, setSessionId] = useState("");

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
      if (cancel) return;
      const stored = readSessionId();
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

  function save(next: AppState, nextSession = sessionId) {
    persist(next);
    setState(next);
    setSessionId(nextSession);
    writeSessionId(nextSession);
  }

  async function login(email: string, password: string) {
    if (!state) return { ok: false as const, error: "The console is still opening." };
    const draft = structuredClone(state);
    const result = await loginAdmin(draft, email, password);
    const nextSession = result.ok && result.data?.sessionId ? result.data.sessionId : sessionId;
    save(draft, result.ok && result.data?.sessionId ? nextSession : sessionId);
    return result;
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
    const draft = structuredClone(state);
    const actor = draft.admins.find((item) => item.id === admin.id);
    if (!actor) return;
    logoutAdmin(draft, actor, sessionId);
    save(draft, "");
  }

  function commit<T>(mutator: (draft: AppState, actor: AdminUser) => ActionResult<T>): ActionResult<T> {
    if (!state || !admin) return { ok: false, error: "Sign in to continue." };
    const draft = structuredClone(state);
    const actor = draft.admins.find((item) => item.id === admin.id);
    if (!actor) return { ok: false, error: "Sign in to continue." };
    const result = mutator(draft, actor);
    if (result.ok) save(draft);
    return result;
  }

  async function changePassword(current: string, next: string) {
    if (!state || !admin) return { ok: false as const, error: "Sign in to continue." };
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
    const issue = passwordIssue(input.password, state.settings.passwordMinLength);
    if (issue) return { ok: false as const, error: issue };
    const passwordSalt = uid();
    const passwordHash = await digest(passwordSalt, input.password);
    return commit((draft, actor) => createAdminUser(draft, actor, { ...input, passwordSalt, passwordHash }));
  }

  function resetDemo() {
    clearStoredState();
    window.location.assign("/login");
  }

  const value: AdminValue = {
    ready,
    state,
    admin,
    sessionId,
    allowed: (permission) => (admin ? can(admin.role, permission) : false),
    login,
    verifyCode,
    logout,
    commit,
    changePassword,
    createAdmin,
    resetDemo,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin must be used inside AdminProvider");
  return value;
}
