import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Laptop, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { CONSOLE_ROLES } from "@/lib/console/roles";
import { showMobile } from "@/lib/console/activity";
import { DEVICE_DAYS } from "@/lib/console/auth";
import { withConsole } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Col, Row, Split } from "@/components/ui/blocks";
import { SheetForm } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { AutoList } from "@/components/console/bits";
import { whenWords } from "@/components/console/activity-line";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "My profile" };

const deviceWords = (ua: string | null) => {
  if (!ua) return "Unknown device";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone" : /Mac OS/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : /Linux/i.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${browser} on ${os}`;
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ act?: string }> }) {
  const c = await requireConsole();
  const sp = await searchParams;
  const now = new Date();
  const [sessions, devices] = await withConsole((tx) => Promise.all([
    tx.consoleSession.findMany({ where: { userId: c.user.id, revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastUsedAt: "desc" }, take: 10 }),
    tx.consoleDevice.count({ where: { userId: c.user.id, revokedAt: null, expiresAt: { gt: now } } }),
  ]));
  const u = c.user;
  return (
    <div>
      <PageHead title="My profile" sub="Your own console login. Every change here is written in the Activity Log." />
      <Split>
        <Col>
          <Card>
            <CardHeader title="Your details" icon={UserRound} divided />
            <div className="p-5">
              <AutoList items={[
                ["Name", u.name],
                ["Mobile (your username)", <span key="m" className="tnum">{showMobile(u.phone)}</span>],
                ["Email", u.email ?? "None"],
                ["Role", <Pill key="r" tone={u.role === "OWNER" ? "brand" : "neutral"}>{CONSOLE_ROLES[u.role].label}</Pill>],
                ["Password last changed", u.passwordChangedAt ? formatDate(u.passwordChangedAt) : "Not recorded"],
              ]} />
              <p className="text-[13px] text-ink3 mt-4">{CONSOLE_ROLES[u.role].does} To change your name, mobile or role, ask the Owner.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Password" icon={KeyRound} divided action={<Link href="/console/profile?act=password" scroll={false} className={buttonClass("secondary", "sm")}>Change password</Link>} />
            <p className="p-5 text-[14px] text-ink2">After a change, the console signs you out on every other device.</p>
          </Card>
        </Col>
        <Col>
          <Card id="two-step">
            <CardHeader title="Two-step login" icon={ShieldCheck} divided action={<Pill tone="ok" dot>Always on</Pill>} />
            <div className="p-5 flex flex-col gap-2 text-[14px] text-ink2">
              <p>After your password, a 6-digit code goes by SMS to <b className="font-semibold text-ink tnum">{showMobile(u.phone)}</b>. It cannot be switched off for console logins.</p>
              <p>A device you trust skips the code for {DEVICE_DAYS} days. Trusted devices now: <b className="font-semibold text-ink tnum">{devices}</b>.</p>
              <p className="text-ink3 text-[13px]">The console signs you out after 30 minutes without use.</p>
            </div>
          </Card>
          <Card>
            <CardHeader title="Signed in now" icon={Laptop} divided />
            <ul className="p-2">
              {sessions.map((s) => (
                <Row key={s.id} icon={/Android|iPhone/i.test(s.userAgent ?? "") ? Smartphone : Laptop} title={<>{deviceWords(s.userAgent)}{s.id === c.session.id && <span className="text-ink3 font-normal"> (this device)</span>}</>} sub={`Last used ${whenWords(s.lastUsedAt, now)}${s.ipAddress ? ` · ${s.ipAddress}` : ""}`} />
              ))}
            </ul>
          </Card>
        </Col>
      </Split>
      {sp.act === "password" && (
        <SheetForm title="Change password" sub="Other devices are signed out" closeHref="/console/profile" action={changePasswordAction} submitLabel="Change password" pendingText="Saving…">
          <SText name="current" label="Current password" type="password" required autoComplete="current-password" />
          <SText name="next" label="New password" type="password" required autoComplete="new-password" help="At least 8 characters, with a letter and a number." />
          <SText name="again" label="Type the new password again" type="password" required autoComplete="new-password" />
        </SheetForm>
      )}
    </div>
  );
}
