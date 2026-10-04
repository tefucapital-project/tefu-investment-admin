import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Banner, Button, Field } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { ROLE_LABEL } from "../lib/labels";
import { STAFF_ACCOUNTS, STAFF_PASSWORD } from "../lib/seed";

export function LoginPage() {
  const { admin, login, verifyCode, state } = useAdmin();
  const [email, setEmail] = useState(STAFF_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState("");
  if (admin) return <Navigate to="/" replace />;
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="forest-panel hidden px-12 py-16 text-gold2 lg:block">
        <p className="font-serif text-4xl">Tefu staff console</p>
        <p className="mt-4 max-w-md text-sm leading-6 text-gold2/80">Review clients, KYC, wallets, Mudarabah, and Ijarah. Returns stay tied to the contract and actual performance.</p>
      </section>
      <section className="flex items-center px-6 py-12">
        <form
          className="mx-auto w-full max-w-md"
          onSubmit={async (event) => {
            event.preventDefault();
            if (needsCode) {
              const result = await verifyCode(code);
              if (!result.ok) setError(result.error);
              return;
            }
            const result = await login(email, password);
            if (!result.ok || !result.data) {
              setError(result.ok ? "Sign-in did not complete." : result.error);
              return;
            }
            if (result.data.needsCode) {
              setNeedsCode(true);
              setPreview(result.data.preview);
              setError("");
            }
          }}
        >
          <h1 className="font-serif text-4xl text-forest">Admin sign in</h1>
          <p className="mt-2 text-sm text-muted">Use your staff email. Client accounts cannot open this console.</p>
          {error ? <div className="mt-4"><Banner tone="danger">{error}</Banner></div> : null}
          {needsCode ? (
            <div className="mt-6 space-y-4">
              <Banner>Demonstration delivery. Your code is {preview}. It expires in five minutes.</Banner>
              <Field label="Second factor" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
              <Button type="submit">Verify code</Button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <Field label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" />
              <Field label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
              <Button type="submit" disabled={!state}>Sign in</Button>
            </div>
          )}
          <div className="mt-8 rounded-[1.5rem] border border-line bg-paper p-4 text-sm">
            <p className="font-medium">Demonstration accounts</p>
            <p className="mt-1 text-muted">Shared password: {STAFF_PASSWORD}</p>
            <ul className="mt-3 space-y-1 text-xs">
              {STAFF_ACCOUNTS.map((account) => <li key={account.email}>{account.email} · {ROLE_LABEL[account.role]}</li>)}
            </ul>
            {state?.settings.require2fa ? <p className="mt-2 text-xs">Platform policy currently requires a second factor. {ROLE_LABEL.super_admin} can change that in settings.</p> : null}
          </div>
        </form>
      </section>
    </div>
  );
}
