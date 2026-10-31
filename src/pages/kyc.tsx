import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, Banner, Button, Denied, Empty, PageTitle, Panel, Pill, Select } from "../components/ui";
import { useAdmin } from "../context/AdminState";
import { decideKyc, reviewEvidence } from "../lib/engine";
import { dateTime, maskAccount } from "../lib/format";
import { seesFullBank } from "../lib/permissions";
import { clientName, findClient, kycChecklist, kycOf } from "../lib/selectors";
import type { DocStatus, KycRecord } from "../lib/types";

function needsAdminAttention(item: KycRecord) {
  if (item.status === "pending_review" || item.status === "requires_update") return true;
  if (item.status === "in_progress" && kycChecklist(item).ready) return true;
  return false;
}

export function KycQueuePage() {
  const { state, allowed, liveMode, refreshClients } = useAdmin();
  const [status, setStatus] = useState("needs_review");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!liveMode) return;
    void refreshClients();
    const timer = window.setInterval(() => {
      void refreshClients();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [liveMode, refreshClients]);

  const kycRows = state?.kyc ?? [];
  const counts = useMemo(() => {
    const base = {
      not_started: 0,
      in_progress: 0,
      pending_review: 0,
      approved: 0,
      rejected: 0,
      requires_update: 0,
      needs_review: 0,
    };
    for (const item of kycRows) {
      if (item.status in base) base[item.status as keyof typeof base] += 1;
      if (needsAdminAttention(item)) base.needs_review += 1;
    }
    return base;
  }, [kycRows]);

  const rows = useMemo(
    () =>
      kycRows
        .filter((item) => {
          if (!status) return true;
          if (status === "needs_review") return needsAdminAttention(item);
          return item.status === status;
        })
        .slice()
        .sort((a, b) => {
          const rank = (item: KycRecord) => {
            if (item.status === "pending_review") return 0;
            if (item.status === "requires_update") return 1;
            if (item.status === "in_progress" && kycChecklist(item).ready) return 2;
            return 3;
          };
          const diff = rank(a) - rank(b);
          if (diff !== 0) return diff;
          return (b.submittedAt ?? 0) - (a.submittedAt ?? 0);
        }),
    [kycRows, status],
  );

  if (!state) return null;
  if (!allowed("kyc.review")) return <Denied />;

  async function refresh() {
    setRefreshing(true);
    await refreshClients();
    setRefreshing(false);
  }

  return (
    <div>
      <PageTitle
        title="KYC"
        lede="Every submitted KYC file appears here for approval. Open a row — you do not need to search clients by name."
        action={
          liveMode ? (
            <Button type="button" tone="ghost" disabled={refreshing} onClick={() => void refresh()}>
              {refreshing ? "Refreshing…" : "Refresh queue"}
            </Button>
          ) : undefined
        }
      />
      {liveMode ? (
        <Banner tone="ok">Live queue from the API. Submitted files show under Needs review / Pending review.</Banner>
      ) : (
        <Banner>Sign in against the API to load registered clients. Demo seed data is shown until then.</Banner>
      )}
      <div className="mb-4 max-w-xs">
        <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="needs_review">Needs review ({counts.needs_review})</option>
          <option value="">All</option>
          {["not_started", "in_progress", "pending_review", "approved", "rejected", "requires_update"].map((item) => (
            <option key={item} value={item}>
              {item.replaceAll("_", " ")} ({counts[item as keyof typeof counts] ?? 0})
            </option>
          ))}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {["not_started", "in_progress", "pending_review", "approved", "rejected", "requires_update"].map((item) => (
          <Panel key={item}>
            <p className="text-xs text-muted">{item.replaceAll("_", " ")}</p>
            <p className="text-2xl">{counts[item as keyof typeof counts] ?? 0}</p>
          </Panel>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th>Status</th>
              <th>NIN</th>
              <th>BVN</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const client = findClient(state, item.clientId);
              const check = kycChecklist(item);
              return (
                <tr key={item.clientId} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link className="text-canopy" to={`/kyc/${item.clientId}`}>
                      {client ? clientName(client) : item.clientId}
                    </Link>
                    <p className="text-xs text-muted">{check.percent}% complete · Open to approve</p>
                  </td>
                  <td>
                    <Pill status={item.status} />
                  </td>
                  <td>
                    <Pill status={item.nin.status} />
                  </td>
                  <td>
                    <Pill status={item.bvn.status} />
                  </td>
                  <td>{item.submittedAt ? dateTime(item.submittedAt) : check.ready ? "Ready — open to approve" : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-sm text-muted">
                  No KYC files in this filter yet. When a member finishes KYC it lands here automatically — use Refresh queue or switch to All.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function KycReviewPage() {
  const { clientId = "" } = useParams();
  const { state, admin, allowed, commit, liveMode, decideKycLive, refreshClients } = useAdmin();
  const [reason, setReason] = useState("");
  const [docNote, setDocNote] = useState("");
  const [selfieNote, setSelfieNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (liveMode) void refreshClients();
  }, [liveMode, refreshClients, clientId]);

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
  async function decide(decision: "approve" | "reject" | "update") {
    setBusy(true);
    setError("");
    if (liveMode) {
      const result = await decideKycLive({
        recordId: kyc!.recordId || "",
        decision,
        reason,
      });
      setBusy(false);
      run(result);
      return;
    }
    const result = commit((draft, actor) => decideKyc(draft, actor, client!.id, decision, reason));
    setBusy(false);
    run(result);
  }
  return (
    <div className="space-y-4">
      <PageTitle title={`Review ${clientName(client)}`} lede="Approve activates the client account. Until then they cannot deposit, withdraw, or invest." />
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {liveMode ? (
        <Banner tone="ok">
          Live mode — decisions go to the API.{" "}
          <button type="button" className="underline" onClick={() => void refreshClients()}>
            Refresh clients
          </button>
        </Banner>
      ) : null}
      <Panel>
        <p className="text-sm">KYC completion {check.percent}%</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
          {check.items.map((item) => (
            <li key={item.key}>
              {item.ok ? "✓" : "○"} {item.label}
            </li>
          ))}
        </ul>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="font-medium">Personal information</h2>
          <p className="mt-2 text-sm">{kyc.personal.fullName || "Not submitted"}</p>
          <p className="text-sm text-muted">
            {kyc.personal.dob || "—"} · {kyc.personal.gender || "—"} · {kyc.personal.nationality || "—"}
          </p>
          <p className="mt-2 text-sm">{kyc.personal.address || "Address not submitted"}</p>
          <p className="text-sm">{[kyc.personal.lga, kyc.personal.state, kyc.personal.country].filter(Boolean).join(", ")}</p>
          <p className="text-sm">
            {kyc.personal.phone} · {kyc.personal.email}
          </p>
        </Panel>
        <Panel>
          <h2 className="font-medium">NIN and BVN</h2>
          <p className="mt-2 text-sm">
            NIN <Pill status={kyc.nin.status} /> {kyc.nin.reference}
          </p>
          <p className="text-sm text-muted">
            {kyc.nin.response || "No verification response"} · {kyc.nin.match || "No match status"} · {dateTime(kyc.nin.verifiedAt)}
          </p>
          <p className="mt-3 text-sm">
            BVN <Pill status={kyc.bvn.status} /> {kyc.bvn.reference}
          </p>
          <p className="text-sm text-muted">
            {kyc.bvn.response || "No verification response"} · {kyc.bvn.match || "No match status"} · {dateTime(kyc.bvn.verifiedAt)}
          </p>
        </Panel>
        <Panel>
          <h2 className="font-medium">Bank account</h2>
          <p className="mt-2 text-sm">{kyc.bank.bank || "Not submitted"}</p>
          <p className="text-sm">
            {kyc.bank.accountName} · {bankNumber}
          </p>
          <p className="mt-2">
            <Pill status={kyc.bank.status} />
          </p>
        </Panel>
        <EvidenceEditor
          title="Identification document"
          type={kyc.document.type || "Not submitted"}
          status={kyc.document.status}
          note={docNote}
          setNote={setDocNote}
          reviewNote={kyc.document.reviewNote}
          uploadedAt={kyc.document.uploadedAt}
          canReview={!liveMode && allowed("documents.review")}
          onReview={(status) => run(commit((draft, actor) => reviewEvidence(draft, actor, client.id, "document", status, docNote)))}
        />
        <EvidenceEditor
          title="Identity photo"
          type="Selfie"
          status={kyc.selfie.status}
          note={selfieNote}
          setNote={setSelfieNote}
          reviewNote={kyc.selfie.reviewNote}
          uploadedAt={kyc.selfie.uploadedAt}
          canReview={!liveMode && allowed("documents.review")}
          onReview={(status) => run(commit((draft, actor) => reviewEvidence(draft, actor, client.id, "selfie", status, selfieNote)))}
        />
      </div>
      <Panel>
        <h2 className="font-medium">Decision</h2>
        {kyc.rejectionReason ? <p className="mt-2 text-sm">Rejection: {kyc.rejectionReason}</p> : null}
        {kyc.updateRequest ? <p className="mt-2 text-sm">Update requested: {kyc.updateRequest}</p> : null}
        {allowed("kyc.decide") ? (
          <form className="mt-3 space-y-3" onSubmit={(event) => event.preventDefault()}>
            <Area label="Reason or required correction" value={reason} onChange={(event) => setReason(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!check.ready || busy} onClick={() => void decide("approve")}>
                Approve KYC
              </Button>
              <Button type="button" tone="danger" disabled={busy} onClick={() => void decide("reject")}>
                Reject
              </Button>
              <Button type="button" tone="ghost" disabled={busy} onClick={() => void decide("update")}>
                Request update
              </Button>
            </div>
            {!check.ready ? (
              <p className="text-xs text-muted">Approve stays unavailable until personal information, NIN, BVN, bank, documents, and identity verification are complete.</p>
            ) : null}
            {liveMode && !kyc.recordId ? <p className="text-xs text-danger">Refresh clients so this KYC file has a live record id before deciding.</p> : null}
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">Your role can review this file. A compliance admin records the decision.</p>
        )}
      </Panel>
      <Panel>
        <h2 className="font-medium">History</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {kyc.history.map((item, index) => (
            <li key={`${item.at}-${index}`}>
              {dateTime(item.at)} · {item.action} · {item.by} {item.note}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function EvidenceEditor({
  title,
  type,
  status,
  note,
  setNote,
  reviewNote,
  uploadedAt,
  canReview,
  onReview,
}: {
  title: string;
  type: string;
  status: DocStatus;
  note: string;
  setNote: (value: string) => void;
  reviewNote: string;
  uploadedAt: number | null;
  canReview: boolean;
  onReview: (status: DocStatus) => void;
}) {
  return (
    <Panel>
      <h2 className="font-medium">{title}</h2>
      <p className="mt-2 text-sm">{type}</p>
      <p className="mt-1">
        <Pill status={status} />
      </p>
      <p className="mt-2 text-xs text-muted">Uploaded {dateTime(uploadedAt)}</p>
      {reviewNote ? <p className="mt-2 text-sm">Review note: {reviewNote}</p> : null}
      {canReview ? (
        <div className="mt-3 space-y-2">
          <Area label="Review note" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => onReview("approved")}>
              Approve
            </Button>
            <Button type="button" tone="danger" onClick={() => onReview("rejected")}>
              Reject
            </Button>
            <Button type="button" tone="ghost" onClick={() => onReview("requires_update")}>
              Request update
            </Button>
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
      { id: `${item.clientId}-document`, clientId: item.clientId, name: client ? clientName(client) : item.clientId, type: "Identification", status: item.document.status, at: item.document.uploadedAt },
      { id: `${item.clientId}-selfie`, clientId: item.clientId, name: client ? clientName(client) : item.clientId, type: "Identity photo", status: item.selfie.status, at: item.selfie.uploadedAt },
    ];
  });
  return (
    <div>
      <PageTitle title="Documents" lede="Identification and identity photos attached to KYC files." />
      <div className="overflow-x-auto rounded-[1.5rem] border border-line bg-paper">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3">Client</th>
              <th>Type</th>
              <th>Status</th>
              <th>Uploaded</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link className="text-canopy" to={`/kyc/${item.clientId}`}>
                    {item.name}
                  </Link>
                </td>
                <td>{item.type}</td>
                <td>
                  <Pill status={item.status} />
                </td>
                <td>{dateTime(item.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
