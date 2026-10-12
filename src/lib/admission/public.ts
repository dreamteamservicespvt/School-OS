// The online admission form (02 §2, optional; 02 §10: a shareable link sent
// by WhatsApp, SMS or email). Parents fill it on their phone without a login.
// The page finds the school by its code, and everything after that runs
// inside that school's walls. The parent's phone is confirmed with a
// one-time code when they give data consent (D8a). Each address and phone
// gets a fair number of tries (08-platform-security.md §7).
import "server-only";
import { nextEnquiryNo } from "./enquiries";

import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma, withSchool, type SchoolContext, type Tx } from "../db";
import { notify } from "../notifications";
import { formatRupees } from "../format";
import { hitLimit, limitMessage } from "../rate-limit";
import { AdmissionProblem, todayIn } from "./act";
import { admissionYear, classList, classRules, live, loadSettings } from "./settings";
import { pickOwner } from "./enquiries";
import { createApplication, type ApplicationInput } from "./applications";
import { admissionConsentTexts, recordConsents, startOtp, tryOtp, verifyOtp, DATA_CONSENT } from "./consent";
import { activeRazorpay, feeStatus } from "./fee";
import { requireFull, type Viewer } from "./access";
import { messageParent } from "./notify-parents";
import { appUrl } from "../parent-link/token";

const CODE_RE = /^[A-Za-z0-9-]{2,24}$/;

/** The school a code belongs to (only active schools), or null. Needs no login. */
export async function schoolByCode(code: string): Promise<{ id: string; name: string } | null> {
  if (!CODE_RE.test(code)) return null;
  const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM admission_school_by_code(${code})`;
  return rows[0] ?? null;
}

export const systemCtx = (schoolId: string): SchoolContext => ({ schoolId, userId: null });

export type PublicForm = Awaited<ReturnType<typeof publicForm>>;

/** Everything the online form needs, or why it is closed. */
export async function publicForm(schoolId: string) {
  return withSchool(systemCtx(schoolId), async (tx) => {
    const s = await loadSettings(tx, systemCtx(schoolId));
    const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, phone: true, email: true, address: true, logoUrl: true, logoFileId: true, code: true, timeZone: true } });
    const year = await admissionYear(tx, systemCtx(schoolId), s);
    const [classes, rules] = await Promise.all([classList(tx), classRules(tx)]);
    const open = classes.filter((c) => rules.get(c.id)?.onlineOpen !== false);
    const consents = await admissionConsentTexts(tx, school.name);
    const pay = s.applicationFeeOn ? Boolean(await activeRazorpay(tx)) : false;
    return {
      open: s.onlineOn && Boolean(year) && open.length > 0,
      school,
      year: year ? { id: year.id, name: year.name } : null,
      classes: open.map((c) => {
        const r = rules.get(c.id);
        return { id: c.id, name: c.name, fee: s.applicationFeeOn && r?.feePaise ? formatRupees(r.feePaise) : null, minAge: r?.minAge ?? null, maxAge: r?.maxAge ?? null, previousSchool: (r?.documents ?? []).some((d) => d.type === "transfer-certificate") };
      }),
      consents,
      onlinePayment: pay,
      categories: s.quotaOn ? s.quotaList.map((q) => q.category) : [],
      sources: live(s.sourceList),
    };
  });
}

async function limited(key: string, max: number, windowSeconds: number) {
  const r = await hitLimit(key, max, windowSeconds);
  if (!r.ok) throw new AdmissionProblem(limitMessage(r));
}

/** Sends the consent code to the parent's mobile. At most 10 per address per hour, and 5 per phone per 15 minutes. */
export async function sendOnlineCode(schoolId: string, phone: string, ip: string | null) {
  await limited(`apply-code:ip:${ip ?? "unknown"}`, 10, 3600);
  return withSchool(systemCtx(schoolId), async (tx) => {
    const s = await loadSettings(tx, systemCtx(schoolId));
    if (!s.onlineOn) throw new AdmissionProblem("Online applications are closed at this school just now. Please contact the school office.");
    const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true } });
    return startOtp(tx, systemCtx(schoolId), { phone, purpose: `online:${phone}`, schoolName: school.name, about: null });
  });
}

/** Checks the consent code without using it up, so the parent knows before sending. Wrong tries count. */
export async function checkOnlineCode(schoolId: string, phone: string, code: string, ip: string | null) {
  await limited(`apply-check:ip:${ip ?? "unknown"}`, 20, 3600);
  return withSchool(systemCtx(schoolId), (tx) => tryOtp(tx, { purpose: `online:${phone}`, phone, code }, new Date(), false));
}

export type OnlineSubmission =ApplicationInput & { consentTypes: string[]; givenByName: string; code: string; heardFrom: string | null };

/** Saves an online application after checking the code. At most 5 per address per hour. */
export async function submitOnline(schoolId: string, input: OnlineSubmission, ip: string | null) {
  await limited(`apply-submit:ip:${ip ?? "unknown"}`, 5, 3600);
  const ctx = systemCtx(schoolId);
  if (!input.consentTypes.includes(DATA_CONSENT)) throw new AdmissionProblem("Please agree to the use of your child's data. The school needs it to process the admission.", `consent_${DATA_CONSENT}`);
  // The code is checked first in its own transaction, so a wrong try is counted.
  const pre = await withSchool(ctx, (tx) => tryOtp(tx, { purpose: `online:${input.phone}`, phone: input.phone, code: input.code }, new Date(), false));
  if (!pre.ok) throw new AdmissionProblem(pre.message, "code");
  return withSchool(ctx, async (tx) => {
    const s = await loadSettings(tx, ctx);
    if (!s.onlineOn) throw new AdmissionProblem("Online applications are closed at this school just now. Please contact the school office.");
    const year = await admissionYear(tx, ctx, s);
    if (!year || year.id !== input.yearId) throw new AdmissionProblem("Admissions for that year are not open online. Refresh the page and try again.");
    const rules = await classRules(tx);
    if (rules.get(input.classId)?.onlineOpen === false) throw new AdmissionProblem("This class does not take applications online. Please contact the school office.", "classId");
    if (!input.consentTypes.includes(DATA_CONSENT)) throw new AdmissionProblem("Please agree to the use of your child's data. The school needs it to process the admission.", `consent_${DATA_CONSENT}`);
    await verifyOtp(tx, { purpose: `online:${input.phone}`, phone: input.phone, code: input.code });
    const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { name: true, campuses: { where: { isMain: true, archivedAt: null }, select: { id: true } } } });
    const campusId = school.campuses[0]?.id ?? (await tx.campus.findFirstOrThrow({ where: { archivedAt: null }, select: { id: true } })).id;
    // A family already in Enquiries is joined to their enquiry; a new family gets one, so the funnel counts them.
    let enquiry = await tx.enquiry.findFirst({ where: { archivedAt: null, phone: input.phone, status: { notIn: ["applied", "admitted"] } }, orderBy: { createdAt: "desc" } });
    if (!enquiry) {
      const source = input.heardFrom && live(s.sourceList).some((x) => x.key === input.heardFrom) ? input.heardFrom : live(s.sourceList).some((x) => x.key === "website") ? "website" : live(s.sourceList)[0]?.key ?? "website";
      const tz = (await tx.school.findUniqueOrThrow({ where: { id: schoolId }, select: { timeZone: true } })).timeZone;
      const owner = await pickOwner(tx, ctx, s, { classId: input.classId, adderStaffId: null, today: todayIn(tz) });
      enquiry = await tx.enquiry.create({
        data: {
          enquiryNo: await nextEnquiryNo(tx, ctx),
          schoolId, campusId, academicYearId: year.id, childName: [input.firstName, input.lastName].filter(Boolean).join(" "),
          parentName: input.fatherName ?? input.motherName ?? input.guardianName ?? "Parent", phone: input.phone, email: input.email, classId: input.classId,
          source, firstSource: source, status: "new", ownerStaffId: owner, childDob: input.dateOfBirth, currentSchool: input.previousSchool,
        },
      });
      await tx.enquiryActivity.create({ data: { schoolId, enquiryId: enquiry.id, kind: "created", text: "Enquiry made from the online application form." } });
    }
    const app = await createApplication(tx, ctx, null, s, input, { campusId, channel: "online", enquiryId: enquiry.id, force: false });
    const texts = await admissionConsentTexts(tx, school.name);
    await recordConsents(tx, ctx, app, { types: input.consentTypes, givenByName: input.givenByName, howGiven: "admission-form-online", texts, verifiedAt: new Date() });
    // The enquiry owner hears about it; a school with no owner set tells its principals.
    const ownerLogin = enquiry.ownerStaffId ? (await tx.staff.findUnique({ where: { id: enquiry.ownerStaffId }, select: { userLoginId: true } }))?.userLoginId : null;
    const people = ownerLogin ? [ownerLogin] : (await tx.schoolAccess.findMany({ where: { archivedAt: null, roles: { some: { role: { key: "principal", isEnabled: true } } } }, select: { userLoginId: true } })).map((a) => a.userLoginId);
    for (const to of people) {
      await notify(tx, ctx, { to, type: "online-application", text: `New online application ${app.applicationNo}: ${app.fullName}.`, link: `/admission-management/applications/${app.id}`, groupKey: "online-application", mergedText: (n) => `${n} new online applications` });
    }
    return { id: app.id, applicationNo: app.applicationNo, fullName: app.fullName, token: statusToken(schoolId, app.id) };
  });
}

function secret() {
  const s = process.env.FILE_LINK_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!s) throw new Error("FILE_LINK_SECRET is not set");
  return s;
}

/** A link only the parent who applied holds, to see the application and pay the fee. */
export function statusToken(schoolId: string, applicationId: string) {
  return createHmac("sha256", secret()).update(`apply:${schoolId}:${applicationId}`).digest("base64url");
}

export function checkStatusToken(schoolId: string, applicationId: string, token: string) {
  const a = Buffer.from(statusToken(schoolId, applicationId));
  const b = Buffer.from(token ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** What the parent sees after applying: the number, the stage in plain words, and the fee. */
export async function applicationStatus(schoolId: string, applicationId: string) {
  return withSchool(systemCtx(schoolId), async (tx: Tx) => {
    const app = await tx.application.findFirst({ where: { id: applicationId, archivedAt: null }, include: { payments: { orderBy: { createdAt: "desc" } } } });
    if (!app) return null;
    const cls = await tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } });
    const fee = feeStatus(app, app.payments);
    const receipts = app.payments.filter((p) => p.status === "CONFIRMED" && !p.cancelledAt).map((p) => ({ receiptNo: p.receiptNo, amount: formatRupees(p.amountPaise), at: p.confirmedAt }));
    const online = app.feeDuePaise ? Boolean(await activeRazorpay(tx)) : false;
    return { applicationNo: app.applicationNo, fullName: app.fullName, className: cls?.name ?? "", stage: app.stage, fee, feeDue: app.feeDuePaise ? formatRupees(fee.duePaise - fee.paidPaise) : null, receipts, onlinePayment: online, createdAt: app.createdAt };
  });
}

/** The parent's own page for this application: its stage, and the fee to pay online. */
export function statusPath(schoolCode: string, schoolId: string, applicationId: string) {
  return `/apply/${encodeURIComponent(schoolCode)}/status/${applicationId}?t=${statusToken(schoolId, applicationId)}`;
}

/** Sends the parent the link to pay the application fee online (Razorpay). The receipt is made only once Razorpay confirms. */
export async function sendFeeLink(tx: Tx, ctx: SchoolContext, v: Viewer, applicationId: string) {
  requireFull(v, "fee links");
  const app = await tx.application.findFirst({ where: { id: applicationId, archivedAt: null }, include: { payments: true } });
  if (!app) throw new AdmissionProblem("This application was not found.");
  const st = feeStatus(app, app.payments);
  if (st.key === "not-needed" || st.key === "paid") throw new AdmissionProblem("Nothing is due on this application.");
  if (!(await activeRazorpay(tx))) throw new AdmissionProblem("Online payment is not set up yet. Connect Razorpay in Settings, Payment Gateways, or collect the fee at the counter.");
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, code: true } });
  const name = app.fatherName ?? app.motherName ?? app.guardianName ?? "Parent";
  const link = `${appUrl()}${statusPath(school.code, ctx.schoolId, app.id)}`;
  const r = await messageParent(tx, ctx, {
    to: { name, phone: app.phone, email: app.email }, template: "admission-fee-link",
    text: `Dear ${name}, please pay the application fee of ${formatRupees(st.duePaise - st.paidPaise)} for ${app.fullName} (application ${app.applicationNo}) at ${school.name}: ${link}`,
    about: { recordType: "Application", recordId: app.id },
  });
  if (r.status === "skipped") throw new AdmissionProblem("The link was not sent: the application has no valid mobile number.");
  await tx.applicationActivity.create({ data: { schoolId: ctx.schoolId, applicationId: app.id, kind: "fee", text: `Payment link for ${formatRupees(st.duePaise - st.paidPaise)} sent to the parent by ${r.channel === "sms" ? "SMS" : r.channel === "email" ? "email" : "WhatsApp"}.`, byId: ctx.userId } });
  return { channel: r.channel, phone: app.phone };
}
