import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, Banner, Button, Denied, Empty, PageTitle, Panel, Pill, Select } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { decideKyc, reviewEvidence } from "../lib/engine";
import { dateTime, maskAccount } from "../lib/format";
import { seesFullBank } from "../lib/permissions";
import { clientName, findClient, kycChecklist, kycOf } from "../lib/selectors";
import type { DocStatus } from "../lib/types";

export function KycQueuePage() {
  const { state, allowed } = useAdmin();
  const [status, setStatus] = useState("pending_review");
  if (!state) return null;
  if (!allowed("kyc.review")) return <Denied />;
  const rows = state.kyc.filter((item) => !status || item.status === status);
  return (
    <div>
      <PageTitle title="KYC" lede="NIN and BVN sit inside KYC. They are not separate onboarding systems." />
      <div className="mb-4 max-w-xs">
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All</option>
          {["not_started", "in_progress", "pending_review", "approved", "rejected", "requires_update"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {["not_started", "in_progress", "pending_review", "approved", "rejected", "requires_update"].map((item) => (
          <Panel key={item}><p className="text-xs text-muted">{item.replaceAll("_", " ")}</p><p className="text-2xl">{state.kyc.filter((row) => row.status === item).length}</p></Panel>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Client</th><th>Status</th><th>NIN</th><th>BVN</th><th>Submitted</th></tr></thead>
          <tbody>
            {rows.map((item) => {
              const client = findClient(state, item.clientId);
              const check = kycChecklist(item);
              return (
                <tr key={item.clientId} className="border-t border-line">
                  <td className="px-4 py-3"><Link className="text-canopy" to={`/kyc/${item.clientId}`}>{client ? clientName(client) : item.clientId}</Link><p className="text-xs text-muted">{check.percent}% complete</p></td>
                  <td><Pill status={item.status} /></td>
                  <td><Pill status={item.nin.status} /></td>
                  <td><Pill status={item.bvn.status} /></td>
                  <td>{dateTime(item.submittedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KycReviewPage() {
  const { clientId = "" } = useParams();
  const { state, admin, allowed, commit } = useAdmin();
  const [reason, setReason] = useState("");
  const [docNote, setDocNote] = useState("");
  const [selfieNote, setSelfieNote] = useState("");
  const [error, setError] = useState("");
  if (!state || !admin) return null;
  if (!allowed("kyc.review")) return <Denied />;
  const client = findClient(state, clientId);
  const kyc = kycOf(state, clientId);
  if (!client || !kyc) return <Empty title="KYC record not found" body="Return to the queue." />;
  const check = kycChecklist(kyc);
  const bankNumber = seesFullBank(admin.role) ? kyc.bank.accountNumber : maskAccount(kyc.bank.accountNumber);
  function run(result: { ok: boolean; error?: string }) {
    setError(result.ok ? "" : result.error ?? "The action did not complete.");
  }
  return (
    <div className="space-y-4">
      <PageTitle title={`Review ${clientName(client)}`} lede="Approve is available only when every mandatory component is complete and the Client Onboarding Fee is successful." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      <Panel>
        <p className="text-sm">KYC completion {check.percent}%</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          {check.items.map((item) => <li key={item.key}>{item.ok ? "✓" : "○"} {item.label}</li>)}
        </ul>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-medium">Personal information</h2>
          <p className="mt-2 text-sm">{kyc.personal.fullName || "Not submitted"}</p>
          <p className="text-sm text-muted">{kyc.personal.dob || "—"} · {kyc.personal.gender || "—"} · {kyc.personal.nationality || "—"}</p>
          <p className="mt-2 text-sm">{kyc.personal.address || "Address not submitted"}</p>
          <p className="text-sm">{[kyc.personal.lga, kyc.personal.state, kyc.personal.country].filter(Boolean).join(", ")}</p>
          <p className="text-sm">{kyc.personal.phone} · {kyc.personal.email}</p>
        </Panel>
        <Panel>
          <h2 className="font-medium">NIN and BVN</h2>
          <p className="mt-2 text-sm">NIN <Pill status={kyc.nin.status} /> {kyc.nin.reference}</p>
          <p className="text-sm text-muted">{kyc.nin.response || "No verification response"} · {kyc.nin.match || "No match status"} · {dateTime(kyc.nin.verifiedAt)}</p>
          <p className="mt-3 text-sm">BVN <Pill status={kyc.bvn.status} /> {kyc.bvn.reference}</p>
          <p className="text-sm text-muted">{kyc.bvn.response || "No verification response"} · {kyc.bvn.match || "No match status"} · {dateTime(kyc.bvn.verifiedAt)}</p>
        </Panel>
        <Panel>
          <h2 className="font-medium">Bank account</h2>
          <p className="mt-2 text-sm">{kyc.bank.bank || "Not submitted"}</p>
          <p className="text-sm">{kyc.bank.accountName} · {bankNumber}</p>
          <p className="mt-2"><Pill status={kyc.bank.status} /></p>
        </Panel>
        <EvidenceEditor title="Identification document" type={kyc.document.type || "Not submitted"} status={kyc.document.status} note={docNote} setNote={setDocNote} reviewNote={kyc.document.reviewNote} uploadedAt={kyc.document.uploadedAt} canReview={allowed("documents.review")} onReview={(status) => run(commit((draft, actor) => reviewEvidence(draft, actor, client.id, "document", status, docNote)))} />
        <EvidenceEditor title="Identity photo" type="Selfie" status={kyc.selfie.status} note={selfieNote} setNote={setSelfieNote} reviewNote={kyc.selfie.reviewNote} uploadedAt={kyc.selfie.uploadedAt} canReview={allowed("documents.review")} onReview={(status) => run(commit((draft, actor) => reviewEvidence(draft, actor, client.id, "selfie", status, selfieNote)))} />
      </div>
      <Panel>
        <h2 className="font-medium">Decision</h2>
        {kyc.rejectionReason ? <p className="mt-2 text-sm">Rejection: {kyc.rejectionReason}</p> : null}
        {kyc.updateRequest ? <p className="mt-2 text-sm">Update requested: {kyc.updateRequest}</p> : null}
        {allowed("kyc.decide") ? (
          <form className="mt-3 space-y-3" onSubmit={(event) => event.preventDefault()}>
            <Area label="Reason or required correction" value={reason} onChange={(event) => setReason(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!check.ready} onClick={() => run(commit((draft, actor) => decideKyc(draft, actor, client.id, "approve", reason)))}>Approve KYC</Button>
              <Button type="button" tone="danger" onClick={() => run(commit((draft, actor) => decideKyc(draft, actor, client.id, "reject", reason)))}>Reject</Button>
              <Button type="button" tone="ghost" onClick={() => run(commit((draft, actor) => decideKyc(draft, actor, client.id, "update", reason)))}>Request update</Button>
            </div>
            {!check.ready ? <p className="text-xs text-muted">Approve stays unavailable until personal information, NIN, BVN, bank, documents, and identity verification are complete.</p> : null}
          </form>
        ) : <p className="mt-2 text-sm text-muted">Your role can review this file. A compliance admin records the decision.</p>}
      </Panel>
      <Panel>
        <h2 className="font-medium">History</h2>
        <ul className="mt-3 space-y-2 text-sm">{kyc.history.map((item, index) => <li key={`${item.at}-${index}`}>{dateTime(item.at)} · {item.action} · {item.by} {item.note}</li>)}</ul>
      </Panel>
    </div>
  );
}

function EvidenceEditor({ title, type, status, note, setNote, reviewNote, uploadedAt, canReview, onReview }: { title: string; type: string; status: string; note: string; setNote: (value: string) => void; reviewNote: string; uploadedAt: number | null; canReview: boolean; onReview: (status: DocStatus) => void }) {
  return (
    <Panel>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-2 text-sm">{type}</p>
      <p className="text-sm text-muted">Uploaded {dateTime(uploadedAt)}</p>
      <div className="mt-2"><Pill status={status} /></div>
      {reviewNote ? <p className="mt-2 text-sm">{reviewNote}</p> : null}
      {canReview && status !== "not_submitted" ? (
        <div className="mt-3 space-y-3">
          <Area label="Review note" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => onReview("approved")}>Approve</Button>
            <Button type="button" tone="ghost" onClick={() => onReview("requires_update")}>Needs update</Button>
            <Button type="button" tone="danger" onClick={() => onReview("rejected")}>Reject</Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

export function DocumentsPage() {
  const { state, allowed } = useAdmin();
  if (!state) return null;
  if (!allowed("documents.review")) return <Denied />;
  const rows = state.kyc.flatMap((item) => {
    const client = findClient(state, item.clientId);
    return [
      { id: `${item.clientId}-doc`, clientId: item.clientId, name: client ? clientName(client) : item.clientId, type: item.document.type || "Identification", status: item.document.status, at: item.document.uploadedAt },
      { id: `${item.clientId}-selfie`, clientId: item.clientId, name: client ? clientName(client) : item.clientId, type: "Identity photo", status: item.selfie.status, at: item.selfie.uploadedAt },
    ];
  });
  return (
    <div>
      <PageTitle title="Client documents" lede="Review identification and identity photos. The outcome is stored with the reviewer and the note." />
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="px-4 py-3">Client</th><th>Type</th><th>Status</th><th>Uploaded</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3"><Link className="text-canopy" to={`/kyc/${item.clientId}`}>{item.name}</Link></td>
                <td>{item.type}</td>
                <td><Pill status={item.status} /></td>
                <td>{dateTime(item.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
