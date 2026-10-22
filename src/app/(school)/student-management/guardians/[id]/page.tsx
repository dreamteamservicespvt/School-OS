import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Ban, ChevronRight, Eye, FileText, FolderOpen, GraduationCap, IndianRupee, MessageCircle, Pencil, Receipt, RefreshCw, Send, ShieldAlert, ShieldCheck, ShieldX, Smartphone, Merge } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { can as allowed } from "@/lib/permissions";
import { BUILT_MODULES } from "@/lib/modules";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { BackLink } from "@/components/ui/module-head";
import { MoreMenu, type MenuItem } from "@/components/ui/more-menu";
import { Banner, Col, DL, Split, Stats, type StatItem } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { ActionForm, FormArea, FormSelect } from "@/components/students/action-form";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import { consentState } from "@/lib/students/consent";
import { parentLinkProvider } from "@/lib/students/guardians";
import { CONSENT_STATUS_LABEL, CONSENT_TYPES, RESULT_LABEL, STATUS_LABEL, STATUS_TONE, languageLabel } from "@/lib/students/labels";
import { classShort, phoneShow } from "@/lib/students/show";
import { BASE, studentPage } from "../../_lib/page";
import { consentRequestAction, parentLinkAction, removeGuardianPhoto, setPrimaryAction, uploadGuardianPhoto, withdrawConsentAction } from "../../_actions/guardians";
import { PhotoUpload } from "../../students/[id]/photo-upload";
import { feePageAllowedFor } from "@/lib/fees/access";
import { PAYMENT_STATUS_WORDS, modeLabel } from "@/lib/fees/words";
import { loadParent360 } from "../load";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Parent" };

const TONE = { GIVEN: "ok", WITHDRAWN: "bad", REQUESTED: "warn", NONE: "warn" } as const;
const stateWord = (s: keyof typeof TONE) => s === "NONE" ? "Not given" : CONSENT_STATUS_LABEL[s];

export default async function Parent360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, year, can, tz } = await studentPage();
  if (!can.seeParents) redirect(BASE);
  const provider = parentLinkProvider();
  const data = await withSchool(current.ctx, (tx) => loadParent360(tx, current, id, { yearId: year?.id ?? null, seeDocuments: can.seeDocuments, parentLink: Boolean(provider) }));
  if (!data) notFound();
  const { g } = data;
  const path = `${BASE}/guardians/${id}`;
  const childName = (sid: string) => data.kids.find((l) => l.studentId === sid)?.student.fullName ?? "A former child";
  const live = !g.archivedAt;
  const manage = can.manage && live;
  const seeFees = data.shows.fees;
  const message = live && BUILT_MODULES.has("communication") && allowed(current.permissions, "communication", "create") && data.kids.length > 0;
  const restricted = data.kids.filter((l) => l.restriction);
  const kids = data.kids.map((k) => ({ ...k, cls: k.section ? classShort(k.section.className, k.section.sectionName) : null }));
  // A receipt opens on Payments for people who may open it, else on the student's ledger.
  const paymentHref = (p: { id: string; studentId: string }) => feePageAllowedFor(current, "payments") ? `/fee-management/payments/${p.id}` : feePageAllowedFor(current, "ledger") ? `/fee-management/ledger/${p.studentId}` : null;
  const dataState = consentState(data.consents, "data-processing");
  const totalDue = kids.reduce((a, k) => a + (k.fact?.feeDuePaise ?? BigInt(0)), BigInt(0));
  const anyOverdue = kids.some((k) => k.fact?.feeOverdue);

  const menu: MenuItem[] = manage ? [
    { label: "Edit details", href: `${path}/edit`, icon: <Pencil size={16} aria-hidden="true" /> },
    { label: "Merge with another record", href: `${path}/merge`, icon: <Merge size={16} aria-hidden="true" /> },
  ] : [];

  const stats: StatItem[] = [
    { label: "Children here", value: String(kids.length), sub: kids.map((k) => k.cls ?? "No class").join(" · ") || "None linked", icon: GraduationCap },
    ...(seeFees ? [{ label: "Fees due, all children", value: totalDue > BigInt(0) ? formatRupees(totalDue) : "Nothing due", tone: totalDue > BigInt(0) ? "bad" as const : "ok" as const, sub: totalDue > BigInt(0) ? (anyOverdue ? "Some of it is overdue" : "Not overdue yet") : kids.some((k) => k.fact?.feeDuePaise != null) ? "All paid" : "No fees have fallen due yet", icon: IndianRupee }] : []),
    ...(provider ? [{ label: "Parent Link", value: data.link?.status ?? "Not sent", tone: data.link?.status === "Active" ? "ok" as const : data.link?.status === "Revoked" ? "bad" as const : undefined, sub: data.link?.lastOpenedAt ? `Last opened ${formatDateTime(data.link.lastOpenedAt, tz)}` : "Not opened yet", icon: Smartphone }] : []),
    { label: "Data consent", value: stateWord(dataState), tone: TONE[dataState], sub: CONSENT_TYPES.filter((t) => t.key !== "data-processing").map((t) => `${t.label}: ${stateWord(consentState(data.consents, t.key)).toLowerCase()}`).join(" · ") || undefined, icon: ShieldCheck },
    { label: "Messages", value: g.optedOut ? "Opted out" : "Yes", tone: g.optedOut ? "warn" : undefined, sub: g.optedOut ? "Only urgent notices" : `In ${languageLabel(g.language)}`, icon: MessageCircle },
  ];

  return (
    <>
      <BackLink href={`${BASE}/guardians`} label="Parents & Guardians" sub={g.name} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {g.archivedAt && (
          <Banner tone="warn" title="This record is archived.">
            {data.merged ? <><Words k="It was merged into" /> <Link className="font-semibold underline" href={`${BASE}/guardians/${data.merged.keptId}`}><Words k="another parent record" /></Link> <Words k="on" /> {formatDate(data.merged.createdAt, tz)}.</> : "It is kept for the history."}
          </Banner>
        )}
        {can.seeRestricted && restricted.length > 0 && (
          <Banner tone="bad" icon={ShieldX} title="Custody restriction.">
            {restricted.map((l) => `${l.student.fullName.split(" ")[0]}: ${l.restriction}`).join(" · ")} <Words k="Not on the pickup list" />{restricted.length === kids.length ? " for any child" : ` for ${restricted.map((l) => l.student.fullName.split(" ")[0]).join(", ")}`}.
          </Banner>
        )}

        <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            {manage ? (
              <PhotoUpload action={uploadGuardianPhoto.bind(null, id)} remove={removeGuardianPhoto.bind(null, id)} hasPhoto={Boolean(g.photoFileId)} name={g.name}>
                <Avatar name={g.name} size={60} src={g.photoFileId ? fileLink(g.photoFileId, current.ctx.schoolId) : null} />
              </PhotoUpload>
            ) : <Avatar name={g.name} size={60} src={g.photoFileId ? fileLink(g.photoFileId, current.ctx.schoolId) : null} />}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[23px] md:text-[26px] font-semibold tracking-tight leading-tight">{g.name}</h1>
                <Pill tone={TONE[dataState]} dot><Words k="Consent" /> {stateWord(dataState).toLowerCase()}</Pill>
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">
                {g.relationship} · <a href={`tel:+91${g.phone}`} className="tnum hover:underline">+91 {phoneShow(g.phone)}</a>{g.email && <> · {g.email}</>}{g.occupation && <> · {g.occupation}</>}
              </p>
            </div>
          </div>
          {(message || manage) && (
            <div className="flex gap-2 flex-wrap relative">
              {message && <ButtonLink href={`/communication?for=students&ids=${kids.map((k) => k.studentId).join(",")}`} icon={MessageCircle}><Words k="Message" /></ButtonLink>}
              {manage && provider && (
                <ConfirmAction action={parentLinkAction} fields={{ guardianId: id, op: "resend" }} trigger={<><RefreshCw size={16} aria-hidden="true" /><Words k="Resend Parent Link" /></>} title="Resend Parent Link?" confirmLabel={`Send to ${g.name}`}>
                  {g.name}<Words k="’s personal link goes again to +91" /> {phoneShow(g.phone)} <Words k="on WhatsApp, with SMS backup." />
                </ConfirmAction>
              )}
              {menu.length > 0 && <MoreMenu items={menu} label={`More actions for ${g.name}`} />}
            </div>
          )}
        </Card>

        <Stats items={stats.slice(0, 4)} />

        <Split>
          <Col>
            <Card>
              <CardHeader title="Children" description={kids.length > 1 ? "Brothers and sisters share this parent record. Tap a child to open the profile." : "Tap a child to open the profile"} icon={GraduationCap} />
              {kids.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="No children are linked." /></p> : (
                <ul className="grid md:grid-cols-2 gap-3 px-5 pb-5">
                  {kids.map((k) => {
                    const due = k.fact?.feeDuePaise ?? BigInt(0);
                    return (
                      <li key={k.id} className={cx("rounded-xl border p-3.5 flex flex-col gap-3", k.restriction && can.seeRestricted ? "border-bad/50" : "border-line")}>
                        <Link href={`${BASE}/students/${k.studentId}`} className="flex items-center gap-3 hover:opacity-80">
                          <Avatar name={k.student.fullName} src={k.student.photoFileId ? fileLink(k.student.photoFileId, current.ctx.schoolId) : null} size={42} />
                          <span className="min-w-0 flex-1">
                            <b className="font-semibold text-[15px] block truncate">{k.student.fullName}</b>
                            <span className="text-[12.5px] text-ink3">{k.cls ?? "No class this year"} · {k.relationship} · <span className="font-mono text-[11.5px]">{k.student.admissionNo}</span></span>
                          </span>
                          <ChevronRight size={17} className="text-ink3" aria-hidden="true" />
                        </Link>
                        {(data.shows.attendance || seeFees) && (
                          <div className="grid grid-cols-2 gap-2 text-[13px]">
                            {data.shows.attendance && (
                              <div className="rounded-xl bg-sunken/60 px-2.5 py-2">
                                <p className="text-ink3 text-[12px] font-semibold"><Words k="Attendance" /></p>
                                <p className={cx("font-semibold tnum", k.fact?.attendancePct != null && k.fact.attendancePct < 85 && "text-warn")}>{k.fact?.attendancePct != null ? `${Math.round(k.fact.attendancePct)}% this year` : "Not marked yet"}</p>
                              </div>
                            )}
                            {seeFees && (
                              <div className="rounded-xl bg-sunken/60 px-2.5 py-2">
                                <p className="text-ink3 text-[12px] font-semibold"><Words k="Fees" /></p>
                                <p className={cx("font-semibold tnum", due > BigInt(0) && "text-bad")}>{k.fact?.feeDuePaise == null ? "Nothing due yet" : due > BigInt(0) ? `${formatRupees(due)} ${k.fact.feeOverdue ? "overdue" : "due"}` : "Paid"}</p>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {(k.fact?.resultText || k.fact?.result) && <Pill tone={k.fact.result === "pass" ? "ok" : k.fact.result === "fail" ? "bad" : "warn"}><Words k="Result:" /> {k.fact.resultText ?? RESULT_LABEL[k.fact.result!]}</Pill>}
                          {k.student.status !== "ACTIVE" && <Pill tone={STATUS_TONE[k.student.status]}>{STATUS_LABEL[k.student.status]}</Pill>}
                          {k.isPrimary && <Pill tone="brand"><Words k="Primary contact for messages" /></Pill>}
                          {k.canPickUp && !k.restriction && <Pill tone="ok"><Words k="May pick up" /></Pill>}
                          {k.restriction && can.seeRestricted && <Pill tone="bad"><Words k="Do not release" /></Pill>}
                          {manage && !k.isPrimary && !k.restriction && <ActionButton action={setPrimaryAction} fields={{ linkId: k.id, studentId: k.studentId }} variant="ghost"><Words k="Make primary contact" /></ActionButton>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {seeFees && (
              <Card>
                <CardHeader title="Payments" description={kids.length > 1 ? "The latest payments for all children" : "The latest payments"} icon={Receipt} />
                {data.payments.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No payments yet." /></p> : (
                  <ul className="px-3 pb-3">
                    {data.payments.map((p) => {
                      const to = paymentHref(p);
                      const status = PAYMENT_STATUS_WORDS[p.status] ?? { label: p.status, tone: "neutral" as const };
                      const body = (
                        <>
                          <span className="min-w-0 flex-1">
                            <b className="font-semibold text-[14px] tnum">{formatRupees(p.amountPaise)}</b>
                            <span className="block text-[12.5px] text-ink3 truncate">{childName(p.studentId)} · {formatDate(p.paymentDate, tz)} · {modeLabel(p.mode)}{p.receiptNo ? ` · Receipt ${p.receiptNo}` : ""}{p.broughtIn ? " · Brought in" : ""}</span>
                          </span>
                          <Pill tone={status.tone}>{status.label}</Pill>
                        </>
                      );
                      return (
                        <li key={p.id}>
                          {to ? <Link href={to} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">{body}</Link> : <div className="flex items-center gap-3 px-2 py-2.5">{body}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}

            <Card>
              <CardHeader title="Contact details" icon={FileText} />
              <DL rows={[
                ["Relation", g.relationship],
                ["Phone", <span key="p" className="tnum">+91 {phoneShow(g.phone)}</span>],
                ["Other phone", g.altPhone ? <span key="a" className="tnum">+91 {phoneShow(g.altPhone)}</span> : null],
                ["Email", g.email],
                ["Occupation", g.occupation],
                ...(!can.lookupOnly ? [["Date of birth", g.dateOfBirth ? formatDate(g.dateOfBirth, tz) : null] as [string, React.ReactNode]] : []),
                ["Message language", languageLabel(g.language)],
                ["Messages", g.optedOut ? "Opted out" : "Receives messages"],
                ["Address", g.address],
              ]} />
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHeader title="Consent records" description="DPDP Act 2023 · given by the parent, never by staff" icon={ShieldCheck} />
              <ul className="px-5 pb-4 flex flex-col gap-3">
                {CONSENT_TYPES.map((t) => {
                  const st = consentState(data.consents, t.key);
                  const rows = data.consents.filter((c) => c.consentType === t.key);
                  const latest = rows[0];
                  const text = latest ? data.texts.find((x) => x.id === latest.consentTextId) : null;
                  const detail = st === "GIVEN" && latest?.givenOn ? `${latest.version ? `${text?.title ?? "Version"} v${latest.version} · ` : ""}${formatDate(latest.givenOn, tz)} · ${latest.method === "parent-link" ? "Parent Link" : "Application form"}`
                    : st === "WITHDRAWN" && latest?.withdrawnOn ? `Withdrawn ${formatDate(latest.withdrawnOn, tz)}${latest.withdrawnNote ? ` · ${latest.withdrawnNote}` : ""}`
                      : st === "REQUESTED" ? "Asked in Parent Link, waiting for the parent" : "Consent request not answered yet";
                  return (
                    <li key={t.key} className="flex items-start gap-3">
                      <span className={cx("w-9 h-9 rounded-xl grid place-items-center shrink-0", st === "GIVEN" ? "bg-ok/10 text-ok" : st === "WITHDRAWN" ? "bg-bad/10 text-bad" : "bg-warn/12 text-warn")} aria-hidden="true">{st === "GIVEN" ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}</span>
                      <div className="min-w-0"><p className="font-semibold text-[14px]">{t.label}: {stateWord(st)}</p><p className="text-[12.5px] text-ink3">{detail}</p></div>
                    </li>
                  );
                })}
                {manage && (
                  <ConfirmAction action={consentRequestAction} fields={{ ids: id }} trigger={<><Send size={16} aria-hidden="true" /><Words k="Send consent request" /></>} triggerVariant="soft" title="Send a consent request?" confirmLabel={`Send to ${g.name}`}>
                    <Words k="Through Parent Link to" /> {g.name}<Words k=", for data and photo consent for each child. They agree with a one-time code to +91" /> {phoneShow(g.phone)}<Words k=". Consents already given are left as they are." />
                  </ConfirmAction>
                )}
              </ul>
              {data.consents.length > 0 && (
                <details className="border-t border-line px-5 py-3 group">
                  <summary className="cursor-pointer text-[13.5px] font-semibold text-brand min-h-9 flex items-center"><Words k="Every record, by child" /></summary>
                  <ul className="mt-1 divide-y divide-line/70">
                    {data.consents.map((c) => (
                      <li key={`${c.studentId}:${c.consentType}`} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                        <span className="min-w-0"><b className="font-semibold">{childName(c.studentId)}</b> · {CONSENT_TYPES.find((t) => t.key === c.consentType)?.label ?? c.consentType}
                          <span className="block text-ink3 text-[12px]">{c.status === "GIVEN" && c.givenOn ? formatDateTime(c.givenOn, tz) : c.status === "WITHDRAWN" && c.withdrawnOn ? `Withdrawn ${formatDate(c.withdrawnOn, tz)}` : c.status === "REQUESTED" ? "Waiting for the parent" : ""}</span>
                        </span>
                        <Pill tone={TONE[c.status]}>{CONSENT_STATUS_LABEL[c.status]}</Pill>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {manage && data.consents.some((c) => c.status !== "WITHDRAWN") && (
                <details className="border-t border-line px-5 py-3">
                  <summary className="cursor-pointer text-[13.5px] font-semibold text-brand min-h-9 flex items-center"><Words k="Record consent withdrawal" /></summary>
                  <ActionForm action={withdrawConsentAction.bind(null, id)} submitLabel="Record withdrawal" submitVariant="danger" pendingText="Saving…" className="mt-2 grid gap-3">
                    <FormSelect name="consentType" label="Which consent" required options={CONSENT_TYPES.map((t) => ({ value: t.key, label: t.label }))} defaultValue="photo" help="Photo consent can be withdrawn on its own." />
                    <FormSelect name="studentId" label="For" options={[{ value: "", label: "Every child" }, ...kids.map((l) => ({ value: l.studentId, label: l.student.fullName }))]} />
                    <FormArea name="note" label="How the parent asked" required rows={2} help="For example: letter dated 12-10-2026, or asked at the office." />
                  </ActionForm>
                </details>
              )}
            </Card>

            {provider && (
              <Card>
                <CardHeader title="Parent Link" description="One personal link. No password. Owned by Communication." icon={Smartphone} />
                <DL cols={1} rows={[
                  ["Status", <Pill key="s" tone={data.link?.status === "Active" ? "ok" : data.link?.status === "Revoked" ? "bad" : "neutral"}>{data.link?.status ?? "Not sent"}</Pill>],
                  ["Last opened", data.link?.lastOpenedAt ? formatDateTime(data.link.lastOpenedAt, tz) : "Never"],
                  ["Sent to", `+91 ${phoneShow(g.phone)}`],
                ]} />
                {manage && (
                  <div className="px-5 pb-5 -mt-1">
                    <ConfirmAction action={parentLinkAction} fields={{ guardianId: id, op: "revoke" }} trigger={<><Ban size={16} aria-hidden="true" /><Words k="Revoke Parent Link" /></>} triggerVariant="danger-outline" title="Revoke Parent Link?" confirmLabel="Revoke and send a new link" confirmVariant="danger">
                      <Words k="Use this when a phone is lost. The old link stops opening at once, and a new link is sent to +91" /> {phoneShow(g.phone)}.
                    </ConfirmAction>
                  </div>
                )}
              </Card>
            )}

            {can.seeDocuments && (
              <Card>
                <CardHeader title="Documents" icon={FolderOpen} />
                {data.docs.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3"><Words k="No documents for this parent. They are added on a child’s Documents tab." /></p> : (
                  <ul className="px-3 pb-3">
                    {data.docs.map((d) => (
                      <li key={d.id} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                        <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0" aria-hidden="true"><FileText size={19} /></span>
                        <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{d.kind}</p><p className="text-[12.5px] text-ink3 truncate tnum">{childName(d.studentId)} · {formatDate(d.createdAt, tz)}</p></div>
                        <ButtonLink href={fileLink(d.fileId, current.ctx.schoolId)} size="sm" variant="ghost" icon={Eye} target="_blank" rel="noopener"><Words k="View" /></ButtonLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </Col>
        </Split>
      </div>
    </>
  );
}
