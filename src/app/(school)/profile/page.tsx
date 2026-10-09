import type { Metadata } from "next";
import { requireCurrent } from "@/lib/current";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { signOut, signOutDevice, signOutEverywhere } from "../actions";
import { PasswordForm } from "./password-form";
import { Appearance } from "./appearance";

export const metadata: Metadata = { title: "My profile" };

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const os = /Android/.test(userAgent) ? "Android phone" : /iPhone|iPad/.test(userAgent) ? "iPhone or iPad" : /Windows/.test(userAgent) ? "Windows computer" : /Mac OS/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux computer" : "Device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "browser";
  return `${browser} on ${os}`;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5">
      <h2 id={`${id}-title`} className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default async function ProfilePage() {
  const current = await requireCurrent();
  const tz = current.school.timeZone;
  const sessions = await prisma.session.findMany({
    where: { userLoginId: current.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
  });
  const u = current.user;

  return (
    <>
      <PageHeader title="My profile" href="/profile" userId={u.id} />
      <div className="space-y-5">
        <Section id="details" title="My details">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt className="text-sm text-ink-2">Name</dt><dd className="font-medium">{u.displayName}</dd></div>
            <div><dt className="text-sm text-ink-2">Username</dt><dd className="font-medium">{u.username}</dd></div>
            <div><dt className="text-sm text-ink-2">Phone</dt><dd className="font-medium">{u.phone ?? "Not added"}</dd></div>
            <div><dt className="text-sm text-ink-2">Email</dt><dd className="font-medium">{u.email ?? "Not added"}</dd></div>
            <div><dt className="text-sm text-ink-2">School</dt><dd className="font-medium">{current.school.name}</dd></div>
            <div><dt className="text-sm text-ink-2">My roles</dt><dd className="font-medium">{current.roles.map((r) => r.name).join(", ")}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-ink-2">Changing your phone or email will need a one-time code; that arrives with Settings.</p>
        </Section>

        <Section id="appearance" title="Appearance">
          <Appearance theme={u.theme} accent={u.accent} />
        </Section>

        <Section id="password" title="Change password">
          <PasswordForm />
        </Section>

        <Section id="devices" title="Signed-in devices">
          <ul className="divide-y divide-line">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {describeDevice(s.userAgent)}
                    {s.id === current.session.id && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-text">This device</span>}
                  </p>
                  <p className="text-sm text-ink-2">Last used {formatDateTime(s.lastUsedAt, tz)}{s.ipAddress ? ` · ${s.ipAddress}` : ""}</p>
                </div>
                <form action={signOutDevice}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <button type="submit" className="min-h-11 rounded-lg border border-line px-4 hover:bg-surface-2">Sign out</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={signOutEverywhere} className="mt-4">
            <button type="submit" className="min-h-11 rounded-lg border border-danger/40 px-4 font-medium text-danger hover:bg-danger-soft">
              Sign out everywhere ({sessions.length} device{sessions.length === 1 ? "" : "s"})
            </button>
          </form>
        </Section>

        <Section id="whats-new" title="What's new">
          <p className="text-ink-2">When a screen changes after an update, a short note explains what changed. Every note you have been shown will be kept here.</p>
        </Section>

        <form action={signOut}>
          <button type="submit" className="min-h-11 rounded-lg border border-line bg-surface px-5 font-medium hover:bg-surface-2">Sign out</button>
        </form>
      </div>
    </>
  );
}
