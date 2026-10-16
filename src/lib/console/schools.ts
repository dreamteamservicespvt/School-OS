// What the console does to a school (07-super-admin.md §3.3, §4, §5, §7):
// Add School, its School Admins' logins and invites, its status, its details,
// its Group and the team's notes. Every change writes an Activity Log line in
// the same transaction, and messages go out after the change is saved.
//
// The console touches only these records of a school: the School itself, its
// first Campus, Roles and modules (when it is made), and the School Admins'
// User Logins and School Access. Never students, fees or staff.
import "server-only";

import { randomUUID } from "node:crypto";
import type { ConsoleSchool, Prisma, SchoolInvite, SchoolStatus } from "@prisma/client";
import { prisma, withConsole, withConsoleSchool, withUser, type Tx } from "../db";
import { buildSchool } from "../schools";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { hashToken, newToken } from "../auth/tokens";
import { formatDate } from "../format";
import { MODULES } from "../modules";
import { logActivity, maskMobile, showMobile, tenDigits, type ConsoleActor } from "./activity";
import { appUrl, deliver, supportPhone, type ConsoleChannel, type ConsoleOutgoing, type Delivered } from "./outbox";
import { ADMIN_ROLE_KEYS, measureSchool, schoolAdmins } from "./measure";

export class ConsoleProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "ConsoleProblem";
  }
}

export const BOARDS = ["CBSE", "ICSE", "State board", "IB", "Cambridge", "Other"] as const;
export const SCHOOL_TYPES = [
  { value: "Day school", icon: "Sun", sub: "Hostel, Library and Inventory start off" },
  { value: "Boarding school", icon: "BedDouble", sub: "Hostel starts switched on" },
  { value: "Pre-school", icon: "Baby", sub: "Only the core modules" },
] as const;
export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
  "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep",
] as const;
/** The optional modules Add School can switch on. Transport is not offered in version 1. */
export const OPTIONAL_MODULES = [
  { key: "library-management", short: "Library", label: "Library Management", icon: "Library" },
  { key: "inventory-management", short: "Inventory", label: "Inventory Management", icon: "Boxes" },
  { key: "hostel-management", short: "Hostel", label: "Hostel Management", icon: "BedDouble" },
] as const;
export const CORE_MODULES = MODULES.filter((m) => !m.optional);
export const defaultOptional = (type: string) => (type === "Boarding school" ? ["hostel-management"] : []);

export const TRIAL_DAYS = 30;
export const TRIAL_CREDITS = 500;
export const KEEP_DAYS = 90;
export const INVITE_VALID_MS = 3 * 24 * 60 * 60 * 1000;
/** An invite not opened in this long puts the school in Needs attention. */
export const NOT_OPENED_MS = 2 * 24 * 60 * 60 * 1000;
export const SETUP_STUCK_DAYS = 7;

export const STATUS_LABEL: Record<SchoolStatus, string> = { TRIAL: "Trial", ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" };
export const ROLE_WORDS: Record<string, string> = { "school-admin": "School Admin", principal: "Principal / Owner" };

const CITY_CODE: Record<string, string> = {
  hyderabad: "HYD", secunderabad: "SEC", jaipur: "JAI", pune: "PUN", vijayawada: "VJA", nagpur: "NAG", bengaluru: "BLR", bangalore: "BLR", mysuru: "MYS",
  warangal: "WGL", visakhapatnam: "VSK", kurnool: "KNL", chennai: "CHE", karimnagar: "KRM", rajahmundry: "RJY", mangaluru: "MNG", nashik: "NSK",
  kakinada: "KKD", mumbai: "MUM", delhi: "DEL", "new delhi": "DEL", kolkata: "KOL", ahmedabad: "AMD", guntur: "GNT", tirupati: "TPT", nellore: "NLR",
};

const norm = (t: string | null | undefined) => String(t ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const joinAnd = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const dayOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

/** A school phone (mobile or landline with its STD code) as its last 10 digits, or null. */
export function schoolPhoneDigits(input: string | null | undefined): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^\d{10}$/.test(d) ? d : null;
}

/** "SPS" from "Sunrise Public School". */
export function schoolInitials(name: string) {
  return name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w && !["of", "the", "and"].includes(w.toLowerCase())).slice(0, 3).map((w) => w[0].toUpperCase()).join("") || "NEW";
}
export function cityCode(city: string) {
  return CITY_CODE[city.trim().toLowerCase()] ?? (city.trim().replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "XXX");
}

/** The next free school code for this name and city, like SPS-JAI-001. */
export async function nextSchoolCode(tx: Tx, name: string, city: string) {
  const prefix = `${schoolInitials(name)}-${cityCode(city)}-`;
  const taken = await tx.consoleSchool.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
  const nums = taken.map((t) => Number(t.code.slice(prefix.length))).filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/** Warnings for Add School: the same name in the same city, or the same school phone. */
export async function findDuplicates(input: { name?: string | null; city?: string | null; phone?: string | null }, excludeId?: string) {
  return withConsole(async (tx) => {
    const cards = await tx.consoleSchool.findMany({ where: excludeId ? { id: { not: excludeId } } : {}, select: { id: true, name: true, city: true, phoneDigits: true, createdAt: true, code: true } });
    const n = norm(input.name);
    const c = norm(input.city);
    const sameName = n && c ? cards.find((s) => norm(s.name.split(",")[0]) === n && norm(s.city) === c) ?? null : null;
    const pd = schoolPhoneDigits(input.phone);
    const samePhone = pd ? cards.find((s) => s.phoneDigits === pd) ?? null : null;
    return { sameName, samePhone };
  });
}

/** Whether a mobile number already has a School OS login, and in which schools. */
export async function findExistingLogin(mobile: string | null | undefined) {
  const d = tenDigits(mobile);
  if (!d) return null;
  const login = (await prisma.userLogin.findUnique({ where: { username: d } })) ?? (await prisma.userLogin.findFirst({ where: { phone: { endsWith: d.slice(-4) }, archivedAt: null, status: { not: "DISABLED" } } }).then((u) => (u && (u.phone ?? "").replace(/\D/g, "").endsWith(d) ? u : null)));
  if (!login || login.archivedAt) return null;
  const schools = await withUser(login.id, (tx) =>
    tx.schoolAccess.findMany({ where: { userLoginId: login.id, archivedAt: null }, select: { schoolId: true }, distinct: ["schoolId"] }),
  );
  const cards = await withConsole((tx) => tx.consoleSchool.findMany({ where: { id: { in: schools.map((s) => s.schoolId) } }, select: { id: true, name: true, groupId: true, groupName: true } }));
  return { login, schools: cards };
}

export async function listGroups() {
  return withConsole(async (tx) => {
    const groups = await tx.group.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } });
    const counts = await tx.consoleSchool.groupBy({ by: ["groupId"], where: { groupId: { not: null }, status: { not: "CLOSED" } }, _count: true });
    return groups.map((g) => ({ id: g.id, name: g.name, schools: counts.find((c) => c.groupId === g.id)?._count ?? 0 }));
  });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

type InviteFor = { school: { id: string; name: string }; userLoginId: string; name: string; phone: string; email: string | null; roleKey: string; channels: ConsoleChannel[]; kind: "INVITE" | "RESET" };

/** Makes a new invite (or reset) link; the earlier live ones for this login stop working. Returns the messages to send. */
async function makeInvite(tx: Tx, actor: ConsoleActor, f: InviteFor, now: Date): Promise<{ invite: SchoolInvite; messages: ConsoleOutgoing[] }> {
  await tx.schoolInvite.updateMany({
    where: { forSchoolId: f.school.id, userLoginId: f.userLoginId, usedAt: null, cancelledAt: null, replacedAt: null },
    data: { replacedAt: now },
  });
  const token = newToken();
  const invite = await tx.schoolInvite.create({
    data: {
      forSchoolId: f.school.id,
      userLoginId: f.userLoginId,
      kind: f.kind,
      name: f.name,
      phone: f.phone,
      email: f.email,
      roleKey: f.roleKey,
      channels: f.channels,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITE_VALID_MS),
      sentById: actor.id,
      sentByName: actor.name,
      sentAt: now,
    },
  });
  return { invite, messages: inviteMessages(f, `${appUrl()}/i/${token}`) };
}

function inviteMessages(f: InviteFor, link: string): ConsoleOutgoing[] {
  const help = supportPhone() ? `Need help? Call DREAM TEAM on ${supportPhone()}.` : "Need help? Call DREAM TEAM support.";
  const role = ROLE_WORDS[f.roleKey] ?? "School Admin";
  const lines = f.kind === "INVITE"
    ? [`Welcome to School OS, ${f.school.name}.`, `${f.name}, your ${role} login is ready.`, `Tap to set your password: ${link}`, `Your username is your mobile number: ${maskMobile(f.phone)}.`, `The link works for 3 days. ${help}`]
    : [`School OS, ${f.school.name}.`, `${f.name}, your login was reset by DREAM TEAM. Your old password no longer works.`, `Tap to set a new password: ${link}`, `Your username is your mobile number: ${maskMobile(f.phone)}.`, `The link works for 3 days. If you did not ask for this, call DREAM TEAM at once. ${help}`];
  const text = lines.join("\n");
  const safe = text.replace(link, `${appUrl()}/i/••••`);
  const purpose = f.kind === "INVITE" ? "invite" : "reset";
  const params = [f.school.name, f.name, link, maskMobile(f.phone)];
  const out: ConsoleOutgoing[] = [];
  for (const ch of f.channels) {
    if (ch === "email") {
      if (f.email) out.push({ channel: "email", to: f.email, purpose, subject: f.kind === "INVITE" ? `Your School OS login for ${f.school.name}` : `Your School OS login was reset`, text: `${text}\n`, safeText: safe, schoolId: f.school.id });
    } else {
      // WhatsApp's invite template keeps the link in a "Get started" button: its blanks are the
      // school and the person, and the button ends with the invite's own part of the link.
      const whatsapp = ch === "whatsapp" ? { templateParams: [f.school.name, f.name], buttonParam: link.slice(link.lastIndexOf("/") + 1) } : { templateParams: params };
      out.push({ channel: ch, to: f.phone, purpose, text, safeText: safe, ...whatsapp, schoolId: f.school.id });
    }
  }
  return out;
}

/** An invite's state, as the console shows it. */
export function inviteState(i: Pick<SchoolInvite, "usedAt" | "cancelledAt" | "replacedAt" | "expiresAt" | "openedAt">, now = new Date()) {
  if (i.usedAt) return "used" as const;
  if (i.cancelledAt) return "cancelled" as const;
  if (i.replacedAt) return "replaced" as const;
  if (i.expiresAt <= now) return "expired" as const;
  if (i.openedAt) return "opened" as const;
  return "sent" as const;
}

const CHANNELS: ConsoleChannel[] = ["whatsapp", "sms", "email"];
export function cleanChannels(list: string[], email: string | null): ConsoleChannel[] {
  const chosen = CHANNELS.filter((c) => list.includes(c));
  if (chosen.length === 0) throw new ConsoleProblem("Pick at least one way to send the invite.", "channels");
  if (chosen.includes("email") && !email) throw new ConsoleProblem("Add their email to also send the invite by email.", "email");
  return chosen;
}

// ---------------------------------------------------------------------------
// Add School
// ---------------------------------------------------------------------------

export type AddSchoolInput = {
  name: string;
  city: string;
  state: string;
  board: string;
  schoolType: string;
  phone: string;
  email: string | null;
  approxStudents: number | null;
  groupId: string | null;
  newGroupName: string | null;
  adminName: string;
  adminMobile: string;
  adminEmail: string | null;
  adminRole: "school-admin" | "principal";
  channels: string[];
  startAs: "TRIAL" | "ACTIVE";
  planKey: "essential" | "complete";
  hostel: boolean;
  optionalOn: string[];
};

export type AddSchoolResult = { schoolId: string; code: string; name: string; delivered: Delivered[]; sameGroup: string | null; channels: ConsoleChannel[]; inviteId: string | null };

export async function addSchool(actor: ConsoleActor, input: AddSchoolInput, now = new Date()): Promise<AddSchoolResult> {
  const name = input.name.trim();
  const city = input.city.trim();
  if (!name) throw new ConsoleProblem("Enter the school’s name.", "name");
  if (!city) throw new ConsoleProblem("Enter the city.", "city");
  if (!STATES.includes(input.state as (typeof STATES)[number])) throw new ConsoleProblem("Choose the state.", "state");
  if (!BOARDS.includes(input.board as (typeof BOARDS)[number])) throw new ConsoleProblem("Choose the board.", "board");
  if (!SCHOOL_TYPES.some((t) => t.value === input.schoolType)) throw new ConsoleProblem("Choose the school type.", "schoolType");
  const phone = schoolPhoneDigits(input.phone);
  if (!phone) throw new ConsoleProblem(input.phone.trim() ? "Enter a 10-digit number." : "Enter the school’s phone number.", "phone");
  const mobile = tenDigits(input.adminMobile);
  if (!input.adminName.trim()) throw new ConsoleProblem("Enter the first School Admin’s full name.", "adminName");
  if (!mobile) throw new ConsoleProblem(input.adminMobile.trim() ? "Enter a 10-digit Indian mobile number." : "Enter their mobile number. It becomes their username.", "adminMobile");
  const channels = cleanChannels(input.channels, input.adminEmail);
  const optionalOn = OPTIONAL_MODULES.map((m) => m.key).filter((k) => input.optionalOn.includes(k));

  // A login with this mobile number already: allowed only inside the same Group.
  const existing = await findExistingLogin(mobile);
  let groupId = input.groupId;
  let groupName: string | null = null;
  if (groupId) {
    const g = await withConsole((tx) => tx.group.findUnique({ where: { id: groupId! } }));
    if (!g || g.archivedAt) throw new ConsoleProblem("That group was not found. Choose again.", "groupId");
    groupName = g.name;
  } else if (input.newGroupName !== null) {
    if (!input.newGroupName.trim()) throw new ConsoleProblem("Name the new group.", "newGroupName");
    groupName = input.newGroupName.trim().slice(0, 120);
  }
  let sameGroup: string | null = null;
  if (existing) {
    const inGroup = existing.schools.find((s) => (groupId && s.groupId === groupId));
    if (!inGroup) {
      const where = existing.schools[0];
      throw new ConsoleProblem(
        where
          ? `This number is already ${existing.login.displayName}’s login at ${where.name}. Use another number, or put this school in the same Group${where.groupName ? ` (${where.groupName})` : ""}.`
          : `This number is already ${existing.login.displayName}’s School OS login. Use another number.`,
        "adminMobile",
      );
    }
    sameGroup = inGroup.groupName ?? groupName;
  }

  if (!groupId && groupName) {
    const made = await withConsole(async (tx) => {
      const g = await tx.group.create({ data: { name: groupName! } });
      await logActivity(tx, actor, { type: "details", text: `made the group ${g.name}.` });
      return g;
    });
    groupId = made.id;
  }

  const schoolId = randomUUID();
  const ctx = { schoolId, userId: null };
  const trialEndsOn = input.startAs === "TRIAL" ? dayOnly(addDays(now, TRIAL_DAYS)) : null;
  const result = await withConsoleSchool(schoolId, async (tx) => {
    const code = await nextSchoolCode(tx, name, city);
    await buildSchool(tx, ctx, {
      code, name, board: input.board, address: city, city, state: input.state, schoolType: input.schoolType, phone: showMobileOrLand(phone),
      email: input.email ?? undefined, groupId: groupId ?? undefined, status: input.startAs, trialEndsOn: trialEndsOn ?? undefined, optionalOn,
    });
    const role = await tx.role.findFirstOrThrow({ where: { schoolId, key: input.adminRole } });
    let loginId: string;
    if (existing) {
      loginId = existing.login.id;
    } else {
      const login = await tx.userLogin.create({
        data: { username: mobile, displayName: input.adminName.trim().slice(0, 120), phone: showMobile(mobile), email: input.adminEmail, status: "INVITED" },
      });
      loginId = login.id;
    }
    await tx.schoolAccess.create({ data: { schoolId, userLoginId: loginId, roles: { create: [{ roleId: role.id, schoolId }] } } });
    await writeAudit(tx, ctx, { action: "admin login added by DREAM TEAM", recordType: "User Login", recordId: loginId, after: { role: role.name }, actorNote: `DREAM TEAM: ${actor.name}` });
    if (input.startAs === "TRIAL") {
      await tx.creditLedgerEntry.create({ data: { schoolId, channel: "whatsapp", amount: TRIAL_CREDITS, note: `Trial: ${TRIAL_CREDITS} message credits from DREAM TEAM` } });
    }
    await tx.consoleSchool.create({
      data: {
        id: schoolId, code, name, city, state: input.state, board: input.board, schoolType: input.schoolType, phone: showMobileOrLand(phone), phoneDigits: phone,
        email: input.email, address: city, approxStudents: input.approxStudents, groupId, groupName, status: input.startAs, statusSince: now,
        trialEndsOn, startedAs: input.startAs, addedById: actor.id, addedByName: actor.name, modulesOn: [...CORE_MODULES.map((m) => m.key), ...optionalOn],
        adminName: input.adminName.trim(), adminPhone: showMobile(mobile), creditsWhatsapp: input.startAs === "TRIAL" ? TRIAL_CREDITS : 0,
      },
    });
    await tx.schoolStatusChange.create({ data: { forSchoolId: schoolId, fromStatus: null, toStatus: input.startAs, reason: input.startAs === "TRIAL" ? `Added as Trial: ${TRIAL_DAYS} days, everything in Essential, ${TRIAL_CREDITS} message credits` : "Added as Active", byId: actor.id, byName: actor.name } });
    const school = { id: schoolId, name };
    let inviteId: string | null = null;
    let messages: ConsoleOutgoing[] = [];
    if (!existing) {
      const made = await makeInvite(tx, actor, { school, userLoginId: loginId, name: input.adminName.trim(), phone: mobile, email: input.adminEmail, roleKey: input.adminRole, channels, kind: "INVITE" }, now);
      inviteId = made.invite.id;
      messages = made.messages;
    }
    const chWords = joinAnd(channels.map((c) => (c === "email" ? "email" : c === "sms" ? "SMS" : "WhatsApp")));
    await logActivity(tx, actor, {
      type: "school",
      school,
      text: existing
        ? `added ${name} (${input.board}, ${input.schoolType}) as ${STATUS_LABEL[input.startAs]}${groupName ? ` in ${groupName}` : ""}, and gave ${input.adminName.trim()} (${maskMobile(mobile)}) access with the login they already have in the group.`
        : `added ${name} (${input.board}, ${input.schoolType}) as ${STATUS_LABEL[input.startAs]}${groupName ? ` in ${groupName}` : ""} and sent a login invite to ${input.adminName.trim()}, +91 ${maskMobile(mobile)}, on ${chWords}.`,
      to: STATUS_LABEL[input.startAs],
      after: { code, board: input.board, type: input.schoolType, city, state: input.state, startAs: input.startAs, modules: optionalOn },
    });
    return { code, inviteId, messages };
  });

  const delivered = await deliver(result.messages);
  if (input.startAs === "ACTIVE") {
    const { startSubscription } = await import("./billing");
    await startSubscription(actor, schoolId, { planKey: input.planKey, hostel: input.hostel, buses: 0, students: Math.max(input.approxStudents ?? 0, 100), payIn: "YEARLY" }, now);
  }
  await measureSchool(schoolId, now).catch(() => null);
  return { schoolId, code: result.code, name, delivered, sameGroup, channels, inviteId: result.inviteId };
}

/** Mobile numbers show as "+91 98480 12345"; a landline keeps its STD code. */
function showMobileOrLand(d: string) {
  return /^[6-9]/.test(d) ? showMobile(d) : `0${d.slice(0, 3)} ${d.slice(3)}`.replace(/^0(\d{2})(\d) /, "0$1 $2");
}

// ---------------------------------------------------------------------------
// One school
// ---------------------------------------------------------------------------

export async function getCard(schoolId: string): Promise<ConsoleSchool | null> {
  if (!/^[0-9a-f-]{36}$/i.test(schoolId)) return null;
  return withConsole((tx) => tx.consoleSchool.findUnique({ where: { id: schoolId } }));
}

async function cardOrThrow(tx: Tx, schoolId: string) {
  const card = await tx.consoleSchool.findUnique({ where: { id: schoolId } });
  if (!card) throw new ConsoleProblem("This school was not found.");
  return card;
}

/** Messages to the school's active admins (status notices, other admins told of a change). */
async function adminNotice(schoolId: string, schoolName: string, text: string, exceptLoginId?: string | null): Promise<ConsoleOutgoing[]> {
  const admins = (await schoolAdmins(schoolId)).filter((a) => a.status === "ACTIVE" && a.userLoginId !== exceptLoginId);
  const out: ConsoleOutgoing[] = [];
  for (const a of admins) {
    const d = tenDigits(a.phone);
    if (d) out.push({ channel: "whatsapp", to: d, purpose: "notice", text: `School OS, ${schoolName}.\n${a.name}, ${text}`, safeText: `School OS, ${schoolName}.\n${a.name}, ${text}`, templateParams: [schoolName, a.name, text], schoolId });
    if (a.email) out.push({ channel: "email", to: a.email, purpose: "notice", subject: `School OS: ${schoolName}`, text: `Hello ${a.name},\n\n${text}\n\nDREAM TEAM SERVICES`, safeText: text, schoolId });
  }
  return out;
}

/** Adds another School Admin (or the first one again), with an invite. */
export async function addAdmin(actor: ConsoleActor, schoolId: string, input: { name: string; mobile: string; email: string | null; roleKey: "school-admin" | "principal"; channels: string[]; checked: string | null }, now = new Date()) {
  const mobile = tenDigits(input.mobile);
  if (!input.name.trim()) throw new ConsoleProblem("Enter their full name.", "name");
  if (!mobile) throw new ConsoleProblem(input.mobile.trim() ? "Enter a 10-digit Indian mobile number." : "Enter their mobile number. It becomes their username.", "mobile");
  const channels = cleanChannels(input.channels, input.email);
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  if (card.status === "CLOSED") throw new ConsoleProblem(`${card.name} is closed. Reopen it first.`);
  if (card.firstAdminSignInAt && (!input.checked || input.checked.trim().length < 5)) throw new ConsoleProblem("Say how you checked the request came from the school: a call back on the school phone on record, or a letter or email from the school.", "checked");
  const admins = await schoolAdmins(schoolId);
  if (admins.some((a) => tenDigits(a.phone) === mobile && a.status !== "DISABLED")) throw new ConsoleProblem("This person is already an admin of this school.", "mobile");
  const existing = await findExistingLogin(mobile);
  if (existing && !existing.schools.every((s) => s.id === schoolId || (card.groupId && s.groupId === card.groupId))) {
    const where = existing.schools.find((s) => s.id !== schoolId);
    throw new ConsoleProblem(`This number is already ${existing.login.displayName}’s login${where ? ` at ${where.name}` : ""}. Use another number${where ? ", or put both schools in the same Group" : ""}.`, "mobile");
  }
  const school = { id: schoolId, name: card.name };
  const ctx = { schoolId, userId: null };
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const role = await tx.role.findFirstOrThrow({ where: { schoolId, key: input.roleKey } });
    let loginId = existing?.login.id ?? null;
    if (!loginId) {
      const login = await tx.userLogin.create({ data: { username: mobile, displayName: input.name.trim().slice(0, 120), phone: showMobile(mobile), email: input.email, status: "INVITED" } });
      loginId = login.id;
    }
    const live = await tx.schoolAccess.findFirst({ where: { schoolId, userLoginId: loginId, archivedAt: null } });
    if (live) {
      await tx.schoolAccessRole.create({ data: { schoolAccessId: live.id, roleId: role.id, schoolId } });
    } else {
      await tx.schoolAccess.create({ data: { schoolId, userLoginId: loginId, roles: { create: [{ roleId: role.id, schoolId }] } } });
    }
    await writeAudit(tx, ctx, { action: "admin login added by DREAM TEAM", recordType: "User Login", recordId: loginId, after: { role: role.name, checked: input.checked }, actorNote: `DREAM TEAM: ${actor.name}` });
    let messages: ConsoleOutgoing[] = [];
    if (!existing) {
      const r = await makeInvite(tx, actor, { school, userLoginId: loginId, name: input.name.trim(), phone: mobile, email: input.email, roleKey: input.roleKey, channels, kind: "INVITE" }, now);
      messages = r.messages;
    }
    await logActivity(tx, actor, {
      type: "invite",
      school,
      text: `${existing ? "gave" : "sent a new admin invite to"} ${school.name}${existing ? ` admin access to ${input.name.trim()} (same login as elsewhere in the group)` : `, to ${input.name.trim()}, +91 ${maskMobile(mobile)}`}, as ${ROLE_WORDS[input.roleKey]}.${input.checked ? ` Checked: ${input.checked.trim()}.` : ""}`,
      after: { name: input.name.trim(), mobile: maskMobile(mobile), role: input.roleKey },
    });
    return { messages };
  });
  const notice = card.firstAdminSignInAt ? await adminNotice(schoolId, card.name, `DREAM TEAM added ${input.name.trim()} as a ${ROLE_WORDS[input.roleKey]} of your school, at the school's request. If this is wrong, call DREAM TEAM at once.`) : [];
  const delivered = await deliver([...made.messages, ...notice.filter((m) => tenDigits(m.to) !== mobile)]);
  await measureSchool(schoolId, now).catch(() => null);
  return { delivered: delivered.filter((d) => d.to === mobile || d.to === input.email) };
}

async function inviteOrThrow(tx: Tx, schoolId: string, inviteId: string) {
  const i = await tx.schoolInvite.findUnique({ where: { id: inviteId } });
  if (!i || i.forSchoolId !== schoolId) throw new ConsoleProblem("This invite was not found.");
  return i;
}

/** The admin did not get it or lost it: a new link; the old link stops working. */
export async function resendInvite(actor: ConsoleActor, schoolId: string, inviteId: string, now = new Date()) {
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const card = await cardOrThrow(tx, schoolId);
    const old = await inviteOrThrow(tx, schoolId, inviteId);
    if (old.usedAt) throw new ConsoleProblem(`${old.name} has already set a password. Use Reset login instead.`);
    if (old.cancelledAt) throw new ConsoleProblem("This invite was cancelled. Add the admin again.");
    const login = await tx.userLogin.findUnique({ where: { id: old.userLoginId } });
    if (!login || login.archivedAt) throw new ConsoleProblem("This login was removed. Add the admin again.");
    const phone = tenDigits(login.phone) ?? old.phone;
    const r = await makeInvite(tx, actor, { school: { id: schoolId, name: card.name }, userLoginId: old.userLoginId, name: login.displayName, phone, email: login.email, roleKey: old.roleKey, channels: old.channels.filter((c): c is ConsoleChannel => CHANNELS.includes(c as ConsoleChannel)).filter((c) => c !== "email" || login.email), kind: old.kind }, now);
    await logActivity(tx, actor, { type: "invite", school: { id: schoolId, name: card.name }, text: `sent a new ${old.kind === "RESET" ? "reset link" : "admin invite"} to ${card.name}, to ${login.displayName}, +91 ${maskMobile(phone)}. The old link stopped working.` });
    return r;
  });
  return { delivered: await deliver(made.messages), name: made.invite.name };
}

/** Wrong person or wrong number: the link stops working, and the login is removed before anyone used it. */
export async function cancelInvite(actor: ConsoleActor, schoolId: string, inviteId: string, reason: string, now = new Date()) {
  if (reason.trim().length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  const ctx = { schoolId, userId: null };
  return withConsoleSchool(schoolId, async (tx) => {
    const card = await cardOrThrow(tx, schoolId);
    const i = await inviteOrThrow(tx, schoolId, inviteId);
    if (i.usedAt) throw new ConsoleProblem(`${i.name} has already set a password. Disable the admin instead.`);
    if (i.cancelledAt) throw new ConsoleProblem("This invite is already cancelled.");
    await tx.schoolInvite.updateMany({ where: { forSchoolId: schoolId, userLoginId: i.userLoginId, usedAt: null, cancelledAt: null }, data: { cancelledAt: now, cancelReason: reason.trim() } });
    const login = await tx.userLogin.findUnique({ where: { id: i.userLoginId } });
    if (login && login.status === "INVITED" && !login.passwordHash) {
      await tx.schoolAccess.updateMany({ where: { schoolId, userLoginId: i.userLoginId, archivedAt: null }, data: { archivedAt: now } });
      const elsewhere = await tx.schoolAccess.count({ where: { userLoginId: i.userLoginId, archivedAt: null } });
      if (elsewhere === 0) await tx.userLogin.update({ where: { id: i.userLoginId }, data: { archivedAt: now, status: "DISABLED" } });
      await writeAudit(tx, ctx, { action: "admin invite cancelled by DREAM TEAM", recordType: "User Login", recordId: i.userLoginId, before: { status: "INVITED" }, after: { status: "REMOVED", reason: reason.trim() }, actorNote: `DREAM TEAM: ${actor.name}` });
    }
    await logActivity(tx, actor, { type: "invite", school: { id: schoolId, name: card.name }, text: `cancelled the admin invite to ${i.name}, +91 ${maskMobile(i.phone)}. Reason: ${reason.trim()}`, from: "Invited", to: "Cancelled" });
    return { name: i.name };
  });
}

/** Forgot the password or changed phones: a reset link to their mobile; the old password stops working. */
export async function resetAdminLogin(actor: ConsoleActor, schoolId: string, userLoginId: string, input: { reason: string; channels: string[] }, now = new Date()) {
  if (input.reason.trim().length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  const admins = await schoolAdmins(schoolId);
  const a = admins.find((x) => x.userLoginId === userLoginId);
  if (!a || a.status === "DISABLED") throw new ConsoleProblem("This admin was not found, or is disabled.");
  const phone = tenDigits(a.phone);
  if (!phone) throw new ConsoleProblem(`${a.name} has no mobile number on record. Use Change mobile number first.`);
  const channels = cleanChannels(input.channels, a.email);
  const ctx = { schoolId, userId: null };
  const made = await withConsoleSchool(schoolId, async (tx) => {
    const card = await cardOrThrow(tx, schoolId);
    await tx.userLogin.update({ where: { id: userLoginId }, data: { passwordHash: null, failedAttempts: 0, lockedUntil: null } });
    const revoked = await tx.session.updateMany({ where: { userLoginId, revokedAt: null }, data: { revokedAt: now, revokedReason: "Login reset by DREAM TEAM" } });
    await writeAudit(tx, ctx, { action: "login reset by DREAM TEAM", recordType: "User Login", recordId: userLoginId, after: { reason: input.reason.trim(), signedOutDevices: revoked.count }, actorNote: `DREAM TEAM: ${actor.name}` });
    const r = await makeInvite(tx, actor, { school: { id: schoolId, name: card.name }, userLoginId, name: a.name, phone, email: a.email, roleKey: a.roleKey, channels, kind: "RESET" }, now);
    await logActivity(tx, actor, { type: "login", school: { id: schoolId, name: card.name }, text: `reset ${a.name}’s login at ${card.name} and sent a reset link to +91 ${maskMobile(phone)}. The old password stopped working. Reason: ${input.reason.trim()}` });
    return r;
  });
  return { delivered: await deliver(made.messages), name: a.name };
}

/** The admin left the school: they cannot sign in here. Never the last active admin. */
export async function disableAdmin(actor: ConsoleActor, schoolId: string, userLoginId: string, reason: string, now = new Date()) {
  if (reason.trim().length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  const admins = await schoolAdmins(schoolId);
  const a = admins.find((x) => x.userLoginId === userLoginId);
  if (!a || a.status === "DISABLED") throw new ConsoleProblem("This admin is already disabled.");
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  const activeOthers = admins.filter((x) => x.status === "ACTIVE" && x.userLoginId !== userLoginId);
  if (a.status === "ACTIVE" && activeOthers.length === 0) throw new ConsoleProblem(`${card.name} needs at least one active admin. Add another admin first.`);
  const ctx = { schoolId, userId: null };
  await withConsoleSchool(schoolId, async (tx) => {
    await tx.schoolAccess.updateMany({ where: { schoolId, userLoginId, archivedAt: null }, data: { archivedAt: now } });
    await tx.schoolInvite.updateMany({ where: { forSchoolId: schoolId, userLoginId, usedAt: null, cancelledAt: null }, data: { cancelledAt: now, cancelReason: "Admin disabled" } });
    const elsewhere = await tx.schoolAccess.count({ where: { userLoginId, archivedAt: null } });
    let revoked = 0;
    if (elsewhere === 0) {
      await tx.userLogin.update({ where: { id: userLoginId }, data: { status: "DISABLED" } });
      revoked = (await tx.session.updateMany({ where: { userLoginId, revokedAt: null }, data: { revokedAt: now, revokedReason: "Disabled by DREAM TEAM" } })).count;
    }
    await writeAudit(tx, ctx, { action: "admin disabled by DREAM TEAM", recordType: "User Login", recordId: userLoginId, before: { status: a.status }, after: { status: "DISABLED", reason: reason.trim(), signedOutDevices: revoked }, actorNote: `DREAM TEAM: ${actor.name}` });
    const others = await tx.schoolAccess.findMany({ where: { schoolId, archivedAt: null, roles: { some: { role: { key: { in: [...ADMIN_ROLE_KEYS] } } } } }, select: { userLoginId: true } });
    for (const o of others) await notify(tx, ctx, { to: o.userLoginId, type: "security", text: `DREAM TEAM disabled ${a.name}'s admin login at the school's request. Reason: ${reason.trim()}`, link: "/settings/users" });
    await logActivity(tx, actor, { type: "login", school: { id: schoolId, name: card.name }, text: `disabled ${a.name}’s admin login at ${card.name}. Reason: ${reason.trim()}`, from: a.status === "INVITED" ? "Invited" : "Active", to: "Disabled" });
  });
  const notice = await adminNotice(schoolId, card.name, `DREAM TEAM disabled ${a.name}'s admin login at the school's request. If this is wrong, call DREAM TEAM at once.`, userLoginId);
  await deliver(notice);
  await measureSchool(schoolId, now).catch(() => null);
  return { name: a.name };
}

/** The admin's number changed: needs the reason and a check; the other admins are told. */
export async function changeAdminMobile(actor: ConsoleActor, schoolId: string, userLoginId: string, input: { mobile: string; reason: string; checked: string }, now = new Date()) {
  const mobile = tenDigits(input.mobile);
  if (!mobile) throw new ConsoleProblem("Enter a 10-digit Indian mobile number.", "mobile");
  if (input.reason.trim().length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  if (input.checked.trim().length < 5) throw new ConsoleProblem("Say how you checked the request came from the school.", "checked");
  const admins = await schoolAdmins(schoolId);
  const a = admins.find((x) => x.userLoginId === userLoginId);
  if (!a || a.status === "DISABLED") throw new ConsoleProblem("This admin was not found, or is disabled.");
  if (tenDigits(a.phone) === mobile) throw new ConsoleProblem("That is the number already on record.", "mobile");
  const taken = await prisma.userLogin.findUnique({ where: { username: mobile } });
  if (taken && taken.id !== userLoginId) throw new ConsoleProblem(`This number is already ${taken.displayName}’s login. Use another number.`, "mobile");
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  const ctx = { schoolId, userId: null };
  await withConsoleSchool(schoolId, async (tx) => {
    const login = await tx.userLogin.findUniqueOrThrow({ where: { id: userLoginId } });
    const usernameWasMobile = tenDigits(login.username) === tenDigits(login.phone);
    await tx.userLogin.update({ where: { id: userLoginId }, data: { phone: showMobile(mobile), ...(usernameWasMobile ? { username: mobile } : {}), twoStepResetAt: now } });
    await tx.schoolInvite.updateMany({ where: { forSchoolId: schoolId, userLoginId, usedAt: null, cancelledAt: null, replacedAt: null }, data: { phone: mobile } });
    await writeAudit(tx, ctx, { action: "admin mobile changed by DREAM TEAM", recordType: "User Login", recordId: userLoginId, before: { phone: maskMobile(login.phone) }, after: { phone: maskMobile(mobile), reason: input.reason.trim(), checked: input.checked.trim() }, actorNote: `DREAM TEAM: ${actor.name}` });
    await logActivity(tx, actor, { type: "login", school: { id: schoolId, name: card.name }, text: `changed ${a.name}’s mobile number at ${card.name}. Reason: ${input.reason.trim()}. Checked: ${input.checked.trim()}.`, from: maskMobile(login.phone), to: maskMobile(mobile) });
  });
  await deliver(await adminNotice(schoolId, card.name, `DREAM TEAM changed ${a.name}'s mobile number on their School OS login, at the school's request. If this is wrong, call DREAM TEAM at once.`));
  await measureSchool(schoolId, now).catch(() => null);
  return { name: a.name };
}

// ---------------------------------------------------------------------------
// Status (07-super-admin.md §7)
// ---------------------------------------------------------------------------

export type StatusMove = "activate" | "suspend" | "close" | "reopen" | "reactivate";
export const MOVES: Record<StatusMove, { from: SchoolStatus[]; to: SchoolStatus; label: string }> = {
  activate: { from: ["TRIAL"], to: "ACTIVE", label: "Activate" },
  suspend: { from: ["TRIAL", "ACTIVE"], to: "SUSPENDED", label: "Suspend" },
  reactivate: { from: ["SUSPENDED"], to: "ACTIVE", label: "Reactivate" },
  close: { from: ["ACTIVE", "SUSPENDED"], to: "CLOSED", label: "Close" },
  reopen: { from: ["CLOSED"], to: "ACTIVE", label: "Reopen" },
};

/**
 * Changes a school's status, with a reason. Suspending or closing tells the
 * school's admins first. Closing needs the school's name typed; a closed
 * school can be reopened within its keep period.
 */
export async function changeStatus(actor: ConsoleActor | null, schoolId: string, move: StatusMove, input: { reason: string; typedName?: string | null }, now = new Date(), opts: { system?: boolean } = {}) {
  const spec = MOVES[move];
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  if (!spec.from.includes(card.status)) throw new ConsoleProblem(`${card.name} is ${STATUS_LABEL[card.status]}, so it cannot be changed this way.`);
  if (move === "close" && (input.typedName ?? "").trim() !== card.name) throw new ConsoleProblem(`Type ${card.name} to confirm.`, "typedName");
  if (move === "reopen" && card.keepUntil && card.keepUntil < dayOnly(now)) throw new ConsoleProblem(`${card.name}'s keep period ended on ${formatDate(card.keepUntil)}. Its data can no longer be brought back from the console.`);
  const sys = actor ?? { id: null, name: "School OS" as const, role: null };
  if (move === "suspend" || move === "close") {
    const notice = move === "suspend"
      ? `School OS for your school is being suspended: ${reason}. Staff cannot sign in while it is suspended. School Admins can still sign in to pay or to download the school's data.`
      : `School OS for your school is being closed: ${reason}. Your data is kept for ${KEEP_DAYS} days, and School Admins can download it until then.`;
    await deliver(await adminNotice(schoolId, card.name, notice));
  }
  const ctx = { schoolId, userId: null };
  await withConsoleSchool(schoolId, async (tx) => {
    const keepUntil = spec.to === "CLOSED" || (spec.to === "SUSPENDED" && card.status === "TRIAL") ? dayOnly(addDays(now, KEEP_DAYS)) : spec.to === "ACTIVE" ? null : card.keepUntil;
    await tx.school.update({ where: { id: schoolId }, data: { status: spec.to } });
    await tx.consoleSchool.update({ where: { id: schoolId }, data: { status: spec.to, statusSince: now, keepUntil } });
    await tx.schoolStatusChange.create({ data: { forSchoolId: schoolId, fromStatus: card.status, toStatus: spec.to, reason, byId: sys.id, byName: opts.system ? "School OS (automatic)" : sys.name } });
    await writeAudit(tx, ctx, { action: `school ${spec.to.toLowerCase()} by DREAM TEAM`, recordType: "School", recordId: schoolId, before: { status: card.status }, after: { status: spec.to, reason }, actorNote: opts.system ? "School OS (automatic)" : `DREAM TEAM: ${sys.name}` });
    if (spec.to === "SUSPENDED" || spec.to === "CLOSED") {
      // Staff are signed out at once; School Admins of a suspended school sign in again to the single page.
      const ids = (await tx.schoolAccess.findMany({ where: { schoolId, archivedAt: null }, select: { userLoginId: true } })).map((a) => a.userLoginId);
      if (ids.length) await tx.session.updateMany({ where: { userLoginId: { in: ids }, schoolId, revokedAt: null }, data: { revokedAt: now, revokedReason: `School ${STATUS_LABEL[spec.to].toLowerCase()}` } });
    }
    await logActivity(tx, sys, {
      type: "status",
      school: { id: schoolId, name: card.name },
      text: `${opts.system ? "" : ""}${move === "activate" ? "activated" : move === "suspend" ? "suspended" : move === "close" ? "closed" : move === "reopen" ? "reopened" : "reactivated"} ${card.name}. Reason: ${reason}`,
      from: STATUS_LABEL[card.status],
      to: STATUS_LABEL[spec.to],
    });
  });
  if (move === "reactivate" || move === "reopen") await deliver(await adminNotice(schoolId, card.name, `School OS for your school is active again. Everyone can sign in as before.`));
  return { name: card.name, from: card.status, to: spec.to };
}

/** The database's refusals from purge_school(), already in plain words. */
const PURGE_REFUSALS = [
  "Only a closed school can be deleted.",
  "This school has invoices, which are never deleted.",
  "This school has students, payments or Day Book entries, so it can never be deleted.",
];

/**
 * Deletes an empty, closed school for good (07-super-admin.md §7, with the
 * Owner's approval): meant for test schools. Allowed only for a Closed school
 * with no students, payments, Day Book entries or invoices, after its name is
 * typed. Its Audit Log entries and the console Activity Log stay; everything
 * else of the school goes, all or nothing, in one database transaction.
 */
export async function deleteSchoolForGood(actor: ConsoleActor, schoolId: string, input: { typedName: string; reason: string }) {
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  if (card.status !== "CLOSED") throw new ConsoleProblem(`${card.name} is ${STATUS_LABEL[card.status]}. Close it first; only a closed school can be deleted.`);
  if (input.typedName.trim() !== card.name) throw new ConsoleProblem(`Type ${card.name} to confirm.`, "typedName");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new ConsoleProblem("Give the reason in a few words.", "reason");
  try {
    await withConsole(async (tx) => {
      await tx.$queryRaw`SELECT purge_school(${schoolId}::uuid) AS rows`;
      await logActivity(tx, actor, { type: "status", school: { id: schoolId, name: card.name }, text: `deleted ${card.name} (${card.code}) for good. Reason: ${reason}`, from: STATUS_LABEL[card.status], to: "Deleted" });
    }, { timeout: 60_000 });
  } catch (e) {
    const said = PURGE_REFUSALS.find((r) => e instanceof Error && e.message.includes(r));
    if (said) throw new ConsoleProblem(said);
    throw e;
  }
  return { name: card.name };
}

// ---------------------------------------------------------------------------
// Details, group and notes
// ---------------------------------------------------------------------------

export type DetailsInput = { name: string; city: string; state: string; board: string; schoolType: string; phone: string; email: string | null; address: string | null; approxStudents: number | null };

/** Editable here only until the school's admin first signs in (07-super-admin.md §3.3). */
export async function editDetails(actor: ConsoleActor, schoolId: string, input: DetailsInput) {
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  if (card.firstAdminSignInAt) throw new ConsoleProblem(`${card.name}'s admin has signed in, so the school now edits its own details in Settings, School Profile.`);
  if (!input.name.trim()) throw new ConsoleProblem("Enter the school’s name.", "name");
  if (!input.city.trim()) throw new ConsoleProblem("Enter the city.", "city");
  if (!STATES.includes(input.state as (typeof STATES)[number])) throw new ConsoleProblem("Choose the state.", "state");
  if (!BOARDS.includes(input.board as (typeof BOARDS)[number])) throw new ConsoleProblem("Choose the board.", "board");
  if (!SCHOOL_TYPES.some((t) => t.value === input.schoolType)) throw new ConsoleProblem("Choose the school type.", "schoolType");
  const phone = schoolPhoneDigits(input.phone);
  if (!phone) throw new ConsoleProblem("Enter a 10-digit number.", "phone");
  const after = { name: input.name.trim(), city: input.city.trim(), state: input.state, board: input.board, schoolType: input.schoolType, phone: showMobileOrLand(phone), email: input.email, address: input.address?.trim() || input.city.trim() };
  const before = { name: card.name, city: card.city, state: card.state, board: card.board, schoolType: card.schoolType, phone: card.phone, email: card.email, address: card.address };
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((k) => (after[k] ?? null) !== (before[k] ?? null));
  if (changed.length === 0 && input.approxStudents === card.approxStudents) return { name: card.name, changed: 0 };
  const ctx = { schoolId, userId: null };
  await withConsoleSchool(schoolId, async (tx) => {
    await tx.school.update({ where: { id: schoolId }, data: after });
    await tx.consoleSchool.update({ where: { id: schoolId }, data: { ...after, phoneDigits: phone, approxStudents: input.approxStudents } });
    await writeAudit(tx, ctx, { action: "details changed by DREAM TEAM", recordType: "School", recordId: schoolId, before, after, actorNote: `DREAM TEAM: ${actor.name}` });
    const words: Record<string, string> = { name: "name", city: "city", state: "state", board: "board", schoolType: "school type", phone: "phone", email: "email", address: "address" };
    await logActivity(tx, actor, {
      type: "details",
      school: { id: schoolId, name: after.name },
      text: `changed ${card.name}’s ${changed.length ? joinAnd(changed.map((k) => words[k])) : "approximate number of students"}.`,
      from: changed.length === 1 ? String(before[changed[0]] ?? "none") : null,
      to: changed.length === 1 ? String(after[changed[0]] ?? "none") : null,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    });
  });
  return { name: after.name, changed: changed.length };
}

/** Puts the school in a Group (existing or new), or takes it out. */
export async function setGroup(actor: ConsoleActor, schoolId: string, input: { groupId: string | null; newGroupName: string | null }) {
  const card = await getCard(schoolId);
  if (!card) throw new ConsoleProblem("This school was not found.");
  let groupId = input.groupId;
  let groupName: string | null = null;
  if (input.newGroupName !== null) {
    if (!input.newGroupName.trim()) throw new ConsoleProblem("Name the new group.", "newGroupName");
    const g = await withConsole(async (tx) => {
      const made = await tx.group.create({ data: { name: input.newGroupName!.trim().slice(0, 120) } });
      await logActivity(tx, actor, { type: "details", text: `made the group ${made.name}.` });
      return made;
    });
    groupId = g.id;
    groupName = g.name;
  } else if (groupId) {
    const g = await withConsole((tx) => tx.group.findUnique({ where: { id: groupId! } }));
    if (!g || g.archivedAt) throw new ConsoleProblem("That group was not found.", "groupId");
    groupName = g.name;
  }
  if ((groupId ?? null) === (card.groupId ?? null)) return { name: card.name, groupName };
  const ctx = { schoolId, userId: null };
  await withConsoleSchool(schoolId, async (tx) => {
    await tx.school.update({ where: { id: schoolId }, data: { groupId } });
    await tx.consoleSchool.update({ where: { id: schoolId }, data: { groupId, groupName } });
    await writeAudit(tx, ctx, { action: "group changed by DREAM TEAM", recordType: "School", recordId: schoolId, before: { group: card.groupName }, after: { group: groupName }, actorNote: `DREAM TEAM: ${actor.name}` });
    await logActivity(tx, actor, { type: "details", school: { id: schoolId, name: card.name }, text: groupName ? `put ${card.name} in ${groupName}.` : `took ${card.name} out of ${card.groupName}.`, from: card.groupName ?? "No group", to: groupName ?? "No group" });
  });
  return { name: card.name, groupName };
}

export async function addNote(actor: ConsoleActor, schoolId: string, text: string) {
  const t = text.trim();
  if (t.length < 2) throw new ConsoleProblem("Write the note.", "text");
  if (t.length > 1000) throw new ConsoleProblem("Keep the note under 1,000 characters.", "text");
  return withConsole(async (tx) => {
    const card = await cardOrThrow(tx, schoolId);
    const note = await tx.schoolNote.create({ data: { forSchoolId: schoolId, text: t, byId: actor.id, byName: actor.name } });
    await logActivity(tx, actor, { type: "note", school: { id: schoolId, name: card.name }, text: `added a note to ${card.name}: “${t.length > 120 ? `${t.slice(0, 117)}…` : t}”` });
    return note;
  });
}
