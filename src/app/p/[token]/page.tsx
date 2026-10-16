// The guardian's Parent Link page (no login). Shows only this guardian's own
// children; every open is checked on the server and logged (rule 31).
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { withSchool } from "@/lib/db";
import { deviceInfo } from "@/lib/current";
import { hitLimit, limitMessage } from "@/lib/rate-limit";
import { deviceCookieName, findLink, openLink } from "@/lib/parent-link/links";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { GuardianPage } from "@/components/parent-link/guardian-page";
import { VerifyPhone } from "@/components/parent-link/verify-phone";
import { PhoneNotice, PhoneShell } from "@/components/parent-link/phone-shell";
import { Link2Off, PowerOff, UserX } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Parent Link", robots: { index: false, follow: false }, referrer: "no-referrer" };

function Notice({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <PhoneNotice title={title} icon={icon}>{children}</PhoneNotice>;
}

function Shell({ schoolName, children, hello, name }: { schoolName?: string; children: React.ReactNode; hello?: string; name?: string }) {
  return <PhoneShell schoolName={schoolName} hello={hello} name={name}>{children}</PhoneShell>;
}

export default async function ParentLinkPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ child?: string; month?: string }> }) {
  const { token } = await params;
  const { child, month } = await searchParams;
  const device = await deviceInfo();

  const limited = await hitLimit(`pl-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
  if (!limited.ok) return <Shell><Notice title="Please wait a moment">{limitMessage(limited)}</Notice></Shell>;

  const found = await findLink(token);
  const key = found ? (await cookies()).get(deviceCookieName(found.linkId))?.value ?? null : null;
  const state = found ? await openLink(token, key, device) : { state: "invalid" as const };

  if (state.state === "invalid") {
    // Wrong links count more heavily, so guessing is slow.
    await hitLimit(`pl-open:ip:${device.ipAddress ?? "unknown"}`, 60, 600);
    return <Shell><Notice title="This link does not work" icon={<Link2Off size={26} />}>Please check you opened the whole link from the school&rsquo;s message, or ask the school for a new one.</Notice></Shell>;
  }
  if (state.state === "revoked") {
    return (
      <Shell schoolName={state.schoolName}>
        <Notice title="This link is no longer active" icon={<Link2Off size={26} />}>
          Please ask the school for a new one.{state.schoolPhone && <> Call <a className="font-medium text-brand underline" href={`tel:${state.schoolPhone}`}>{state.schoolPhone}</a>.</>}
        </Notice>
      </Shell>
    );
  }
  if (state.state === "off") {
    return (
      <Shell schoolName={state.schoolName}>
        <Notice title="Parent Link is switched off" icon={<PowerOff size={24} />}>
          The school has switched off Parent Link for now. To ask a question, message or call the school{state.schoolPhone ? <>: <a className="font-medium text-brand underline" href={`tel:${state.schoolPhone}`}>{state.schoolPhone}</a></> : "."}
        </Notice>
      </Shell>
    );
  }
  if (state.state === "verify") {
    return (
      <Shell schoolName={state.schoolName} hello="Welcome to" name="Your Parent Link">
        <VerifyPhone token={token} maskedPhone={state.maskedPhone} codeSent={Boolean(state.codeSentAt)} />
      </Shell>
    );
  }

  const ctx = { schoolId: state.schoolId, userId: null };
  const result = await withSchool(ctx, async (tx) => {
    const view = await loadGuardianView(tx, ctx, { linkId: state.linkId, guardianId: state.guardianId, childId: child ?? null, token, preview: false });
    if (!view) return null;
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { phone: true } });
    return { view, sections: await loadSections(tx, ctx, { ...view, month: typeof month === "string" ? month : null }), phone: school.phone };
  });
  if (!result) {
    return <Shell schoolName={state.schoolName}><Notice title="No children to show" icon={<UserX size={24} />}>None of your children is studying in the school right now. Please call the school if this is wrong.</Notice></Shell>;
  }
  return <GuardianPage view={result.view} sections={result.sections} schoolPhone={result.phone} basePath={`/p/${token}`} />;
}
