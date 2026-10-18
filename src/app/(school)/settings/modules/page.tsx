import type { Metadata } from "next";
import { requireSettingsPage } from "@/lib/settings/page-access";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { aiUsage } from "@/lib/ai";
import { MODULES } from "@/lib/modules";
import { readPreferences, systemPreferences } from "@/lib/settings/profile-rules";
import { INTEGRATIONS, OPTIONAL_MODULES, SCHOOL_TEMPLATES, SHOWN_AI_FEATURES, aiFeatureReady, aiRolesOf, canSwitchOn } from "@/lib/settings/switches";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssistantForm, FeatureSwitch, IntegrationCard, ModuleSwitch, PreferencesForm, TemplatePicker } from "./switch-forms";

export const metadata: Metadata = { title: "Modules On/Off" };

const SECTIONS = [["modules", "Modules"], ["templates", "School-type templates"], ["preferences", "System preferences"], ["ai", "AI assistant"], ["integrations", "Integrations"]] as const;

export default async function ModulesPage() {
  const { current, may } = await requireSettingsPage("modules");
  const mayEdit = may.edit;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => ({
    school: await tx.school.findUniqueOrThrow({ where: { id: current.school.id }, select: { preferences: true } }),
    modules: await tx.schoolModule.findMany({}),
    features: await tx.schoolFeature.findMany({}),
    integrations: await tx.integration.findMany({}),
    roles: await tx.role.findMany({ where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
    usage: await aiUsage(tx, current.ctx),
  }));
  const usage = data.usage;
  const on = new Set(data.modules.filter((m) => m.isOn).map((m) => m.moduleKey));
  const featureOn = new Set(data.features.filter((f) => f.isOn).map((f) => f.featureKey));
  const prefs = readPreferences(data.school.preferences);
  const sys = systemPreferences(data.school.preferences);
  const assistantOn = featureOn.has("ai-assistant");
  const core = MODULES.filter((m) => !m.optional);

  return (
    <>
      <PageHeader title="Modules On/Off" href="/settings/modules" userId={current.user.id} />
      <nav aria-label="Sections of this page" className="-mt-2 mb-5 flex flex-wrap gap-2 text-sm">
        {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`} className="min-h-9 rounded-full border border-line bg-surface px-3 py-1.5 hover:border-brand">{label}</a>)}
      </nav>
      <div className="space-y-5">
        <Card>
          <CardHeader id="modules" title="Modules" description="Switching a module off hides it everywhere but keeps all its records." />
          <ul>
            {OPTIONAL_MODULES.map((m) => (
              <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-ink-2">{m.purpose}</p>
                </div>
                <ModuleSwitch moduleKey={m.key} name={m.name} on={on.has(m.key)} ready={canSwitchOn(m.key)} stage={m.stage} hides={m.purpose} mayEdit={mayEdit} />
              </li>
            ))}
          </ul>
          <CardBody className="border-t border-line">
            <p className="text-sm font-medium">Always on</p>
            <p className="text-sm text-ink-2">{core.map((m) => m.name).join(", ")}. These hold the school&apos;s core records, so they cannot be switched off.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader id="templates" title="School-type templates" description="Start from a template: it switches on the right modules and fills sensible settings. You see every change first." />
          <CardBody>
            <TemplatePicker templates={SCHOOL_TEMPLATES.map((t) => ({ key: t.key, name: t.name, about: t.about }))} current={prefs.schoolTemplate ?? null} mayEdit={mayEdit} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader id="preferences" title="System preferences" />
          <CardBody><PreferencesForm weekStart={sys.weekStart} rollNumberOrder={sys.rollNumberOrder} mayEdit={mayEdit} /></CardBody>
        </Card>

        <Card>
          <CardHeader id="ai" title="AI assistant" description="Off until you switch it on. Each feature below has its own switch." />
          <CardBody className="space-y-5">
            <div className="rounded-xl border border-line px-4 py-3">
              <p className="font-medium">AI service{" "}{usage.connected ? <Badge tone="success">Connected</Badge> : <Badge>Not connected yet</Badge>}</p>
              <p className="text-sm text-ink-2">
                {usage.connected
                  ? "Run by DREAM TEAM. Only what each task needs is sent: never Aadhaar, bank details, salary or counselling notes, and phone numbers are hidden unless a feature needs them. Every request is logged, and nothing changes until a person accepts a suggestion."
                  : "Not connected yet: DREAM TEAM connects it. Until then every feature below works on School OS's own rules, with no outside service."}
              </p>
              <p className="mt-1 text-sm">This month: {usage.month.requests} {usage.month.requests === 1 ? "request" : "requests"}, about {formatRupees(usage.month.costPaise)} · Today: {usage.today} of {usage.dailyLimit} a day</p>
            </div>
            <AssistantForm on={assistantOn} roles={data.roles.map((r) => ({ key: r.key!, name: r.name }))} chosen={aiRolesOf(prefs)} mayEdit={mayEdit} dailyLimit={prefs.aiDailyLimit ?? null} platformLimit={usage.platformLimit} />
            <div>
              <p className="mb-2 font-medium">AI features</p>
              {!assistantOn && <p className="mb-2 text-sm text-ink-2">Switch on the AI assistant first. While it is off, every feature is off.</p>}
              <ul className="divide-y divide-line rounded-xl border border-line">
                {SHOWN_AI_FEATURES.map((f) => (
                  <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{f.label}</p>
                      <p className="text-sm text-ink-2">{f.about}</p>
                    </div>
                    <FeatureSwitch featureKey={f.key} label={f.label} on={featureOn.has(f.key)} assistantOn={assistantOn} mayEdit={mayEdit} ready={aiFeatureReady(f.key)} />
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader id="integrations" title="Integrations" description={`${data.integrations.filter((i) => i.status === "connected").length} connected · ${data.integrations.filter((i) => i.status === "error").length} with an error. Keys are stored encrypted and never shown again.`} />
          <CardBody>
            {data.integrations.some((i) => i.status === "error") && <p className="mb-3 text-sm"><Badge tone="danger">Error</Badge> <span className="text-ink-2">An integration failed its last test. Open it to fix the details.</span></p>}
            <ul className="grid gap-3 md:grid-cols-2">
              {INTEGRATIONS.map((def) => {
                const row = data.integrations.find((i) => i.key === def.key);
                return (
                  <IntegrationCard key={def.key} def={def} status={row?.status ?? "not-connected"} config={(row?.config ?? {}) as Record<string, string>} hasSecrets={Boolean(row?.secretsEnc)}
                    lastCheck={row?.lastCheckAt ? formatDateTime(row.lastCheckAt, tz) : null} lastError={row?.lastError ?? null} mayEdit={mayEdit} />
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
