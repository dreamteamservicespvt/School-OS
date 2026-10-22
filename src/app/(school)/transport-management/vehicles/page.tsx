import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, Building2, Bus, CalendarClock, FileWarning, Fuel, IdCard, KeyRound, Paperclip, Pencil, Plus, Power, ShieldCheck, Smartphone, UserRound, Users, Wrench } from "lucide-react";
import { withSchool } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { fileLink } from "@/lib/files";
import { formatDate, formatRupees } from "@/lib/format";
import { costsView, fleetView, papersDue } from "@/lib/transport/views";
import { VEHICLE_STATUS, daysBetween, driverRole, expiryTone, expiryWords, paperLabel, plural, PAPER_KINDS, rupeesInput, rupeesShort, showPlate, vehicleType } from "@/lib/transport/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { DataList, DL, Empty, HBars, Stack, Stats, Toolbar } from "@/components/money/kit";
import { TrHead } from "../_components/head";
import { Figure, showPhone, telHref } from "../_components/bits";
import { ActButton, ConfirmAct } from "../_components/fields";
import { CancelCostSheet, CostSheet, DriverSheet, KeySheet, PaperSheet, VehicleSheet, VendorSheet } from "../_components/fleet-sheets";
import { archiveDriverAction, archiveVehicleAction, archiveVendorAction, revokeKeyAction, sendInviteAction, setAppLoginAction } from "../actions";
import { BASE, UUID, addQ, one, qs, rangeDates, trGuard, trPeriod, type SearchParams } from "../_lib/page";
import { crewOptions } from "../_lib/options";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Vehicles & Drivers") };
}

const HREF = `${BASE}/vehicles`;
const VIEWS = ["vehicles", "people", "papers", "costs", "vendors"] as const;
type View = (typeof VIEWS)[number];

const APP_TONE = { Active: "ok", Invited: "info", Disabled: "neutral", None: "warn" } as const;
const APP_WORDS = { Active: "Active", Invited: "Invited", Disabled: "Disabled", None: "No login" } as const;

/** Vehicles & Drivers (12 §2): vehicles, drivers and attendants, papers with expiry, fuel and repairs, vendors. */
export default async function VehiclesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await trGuard("vehicles");
  const origin = await appOrigin();
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as View) : "vehicles";
  const q = one(sp.q).trim().slice(0, 60).toLowerCase();
  const soon = p.settings.expiryReminderDays;
  const papersP = trPeriod(sp, p.dates, null);
  const costsP = trPeriod(sp, p.dates, "thismonth");
  const costKind = (["FUEL", "REPAIR"] as const).find((k) => k === one(sp.kind)) ?? "all";
  const costVehicle = UUID.test(one(sp.v)) ? one(sp.v) : null;
  const pick = (k: string) => (UUID.test(one(sp[k])) ? one(sp[k]) : null);
  const showVehicle = pick("show");
  const showPerson = pick("person");
  const editVehicle = pick("vehicle");
  const editDriver = pick("driver");
  const editVendor = pick("vendor");
  const keyFor = pick("key");
  const cancelId = pick("cancel");
  const doing = one(sp.do);
  const can = p.can;

  const data = await withSchool(p.current.ctx, async (tx) => {
    const fleet = await fleetView(tx, p.today, soon);
    const due = view === "papers" ? await papersDue(tx, p.today, rangeDates(papersP.range)) : null;
    const costs = view === "costs" || cancelId ? await costsView(tx, view === "costs" ? costsP.range : null, view === "costs" ? costKind : "all", view === "costs" ? costVehicle : null) : null;
    const crew = can.fleet && (doing === "vehicle" || editVehicle) ? await crewOptions(tx, editVehicle ? fleet.vehicles.find((x) => x.v.id === editVehicle)?.route?.id ?? null : null) : null;
    const recent = showVehicle ? await costsView(tx, null, "all", showVehicle) : null;
    const devices = showPerson ? await tx.driverDevice.findMany({ where: { driverId: showPerson }, orderBy: { createdAt: "desc" }, take: 10 }) : [];
    return { ...fleet, due, costs, crew, recent: recent?.rows.slice(0, 6) ?? [], devices };
  });

  const here = (extra: Record<string, string | null>) => qs(HREF, { view: view === "vehicles" ? null : view, q: one(sp.q) || null, ...(view === "papers" ? papersP.keep : view === "costs" ? { ...costsP.keep, kind: costKind === "all" ? null : costKind, v: costVehicle } : {}), ...extra });
  const close = here({});
  const vName = (v: { label: string | null; number: string }) => v.label ?? showPlate(v.number);
  const vehicleOpts = data.vehicles.map((r) => ({ value: r.v.id, label: `${vName(r.v)} · ${showPlate(r.v.number)}` }));
  const vendorOpts = data.vendors.map((v) => ({ value: v.id, label: v.name }));

  // Numbers at the top.
  const active = data.vehicles.filter((r) => r.v.status === "ACTIVE").length;
  const repair = data.vehicles.filter((r) => r.v.status === "UNDER_REPAIR").length;
  const papersBad = data.vehicles.reduce((n, r) => n + r.papers.filter((d) => expiryTone(d.expiresOn, p.today, soon) !== "ok").length, 0)
    + data.people.filter((r) => r.d.role === "DRIVER" && r.d.status === "ACTIVE" && expiryTone(r.d.licenceExpiry, p.today, soon) !== "ok").length;
  const serviceDueN = data.vehicles.filter((r) => r.service.due || r.service.soon).length;
  const appActive = data.people.filter((r) => r.app.state === "Active").length;

  const match = (s: string) => !q || s.toLowerCase().includes(q);
  const vRows = data.vehicles.filter((r) => match([r.v.number, r.v.label ?? "", r.v.model ?? "", r.route ? `route ${r.route.number} ${r.route.name}` : "", r.driver?.name ?? ""].join(" ")));
  const pRows = data.people.filter((r) => match([r.d.name, r.d.phone, r.d.licenceNo ?? "", r.route ? `route ${r.route.number}` : "", r.vehicle?.number ?? ""].join(" ")));
  const shownVehicle = showVehicle ? data.vehicles.find((r) => r.v.id === showVehicle) ?? null : null;
  const shownPerson = showPerson ? data.people.find((r) => r.d.id === showPerson) ?? null : null;
  if ((showVehicle && !shownVehicle) || (showPerson && !shownPerson)) notFound();

  const addButton = !can.fleet ? undefined
    : view === "people" ? <ButtonLink href={addQ(close, { do: "driver" })} scroll={false} variant="primary" icon={Plus}>Add driver</ButtonLink>
    : view === "vendors" ? <ButtonLink href={addQ(close, { do: "vendor" })} scroll={false} variant="primary" icon={Plus}>Add vendor</ButtonLink>
    : view === "costs" ? <ButtonLink href={addQ(close, { do: "cost" })} scroll={false} variant="primary" icon={Plus}>Record fuel or repair</ButtonLink>
    : view === "papers" ? <ButtonLink href={addQ(close, { do: "paper" })} scroll={false} variant="primary" icon={Plus}>Upload paper</ButtonLink>
    : <ButtonLink href={addQ(close, { do: "vehicle" })} scroll={false} variant="primary" icon={Plus}>Add vehicle</ButtonLink>;

  const paperCell = (r: (typeof data.vehicles)[number]) => {
    const worst = r.papers[0];
    if (!r.papers.length) return <Pill tone="warn">No papers</Pill>;
    const tone = r.paperTone === "bad" ? "bad" : r.paperTone === "warn" ? "warn" : "ok";
    return <span className="flex flex-col items-start gap-0.5"><Pill tone={tone} dot>{tone === "ok" ? "Valid" : tone === "warn" ? "Ending" : "Expired"}</Pill>{tone !== "ok" && <span className="text-[12px] text-ink3">{paperLabel(worst.kind)} · {expiryWords(worst.expiresOn, p.today)}</span>}</span>;
  };
  const serviceWords = (s: (typeof data.vehicles)[number]["service"]) => (s.due ? "Service due" : s.soon ? `Service ${s.kmLeft != null && s.kmLeft < 1000 ? `in ${s.kmLeft.toLocaleString("en-IN")} km` : `in ${s.daysLeft} days`}` : s.kmLeft == null && s.daysLeft == null ? "No schedule" : "On schedule");

  return (
    <div>
      <TrHead page="vehicles" sub={`${plural(data.vehicles.length, "vehicle")} · ${plural(data.people.filter((r) => r.d.role === "DRIVER").length, "driver")} · ${plural(data.people.filter((r) => r.d.role === "ATTENDANT").length, "attendant")}`} actions={addButton} />
      <Stack>
        <Stats items={[
          { label: "Vehicles running", value: `${active} of ${data.vehicles.length}`, icon: Bus, sub: repair ? `${repair} under repair` : "None under repair", tone: repair ? "warn" : undefined, href: here({ view: null }) },
          { label: "Papers and licences", value: papersBad, icon: FileWarning, sub: papersBad ? "expired or ending soon" : "All valid", tone: papersBad ? "bad" : "ok", href: qs(HREF, { view: "papers" }) },
          { label: "Service due", value: serviceDueN, icon: Wrench, sub: serviceDueN ? "due or within a week" : "None due", tone: serviceDueN ? "warn" : undefined, href: here({ view: null }) },
          { label: "Driver app logins", value: `${appActive} of ${data.people.length}`, icon: Smartphone, sub: "active", href: qs(HREF, { view: "people" }) },
        ]} />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <SegLinks label="Show" value={view} options={[
            { value: "vehicles", label: "Vehicles", href: qs(HREF, {}) },
            { value: "people", label: "Drivers", href: qs(HREF, { view: "people" }) },
            { value: "papers", label: "Papers", href: qs(HREF, { view: "papers" }) },
            { value: "costs", label: "Costs", href: qs(HREF, { view: "costs" }) },
            { value: "vendors", label: "Vendors", href: qs(HREF, { view: "vendors" }) },
          ]} className="overflow-x-auto max-w-full" />
          {(view === "vehicles" || view === "people") && can.export && <ExportButton href={qs(`${BASE}/export`, { list: view === "people" ? "drivers" : "vehicles", q: one(sp.q) || null })} />}
        </div>

        {view === "vehicles" && (
          <Card className="overflow-hidden">
            <Toolbar><UrlSearch id="veh-q" placeholder="Vehicle number, name, route or driver" /></Toolbar>
            <DataList rows={vRows} rowKey={(r) => r.v.id} minWidth={980} caption="Vehicles" rowHref={(r) => here({ show: r.v.id })}
              footer={`${plural(vRows.length, "vehicle")}`}
              columns={[
                { key: "v", label: "Vehicle", render: (r) => <div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Bus size={19} aria-hidden="true" /></span><div><p className="font-semibold">{vName(r.v)}</p><p className="text-[12.5px] text-ink3"><span className="font-mono">{showPlate(r.v.number)}</span> · {vehicleType(r.v.type)}{r.v.model ? ` · ${r.v.model}` : ""}</p></div></div> },
                { key: "seats", label: "Seats", align: "right", render: (r) => r.v.capacity },
                { key: "route", label: "Route", render: (r) => (r.route ? <span>Route {r.route.number}<span className="block text-[12.5px] text-ink3">{r.route.name}</span></span> : <span className="text-ink3">Not on a route</span>) },
                { key: "driver", label: "Driver", render: (r) => r.driver?.name ?? <span className="text-ink3">—</span> },
                { key: "status", label: "Status", render: (r) => <span className="flex flex-col items-start gap-1"><Pill tone={VEHICLE_STATUS[r.v.status]?.tone ?? "neutral"}>{VEHICLE_STATUS[r.v.status]?.label ?? r.v.status}</Pill>{r.v.ownership === "HIRED" && <span className="text-[12px] text-ink3">Hired{r.v.vendor ? ` · ${r.v.vendor.name}` : ""}</span>}</span> },
                { key: "gps", label: "GPS", render: (r) => (r.v.gpsDeviceId ? <span className="text-[13px]">Linked</span> : <span className="text-[13px] text-ink3">Driver app</span>) },
                { key: "papers", label: "Papers", render: paperCell },
                { key: "service", label: "Service", render: (r) => <span className={r.service.due ? "text-bad font-semibold" : r.service.soon ? "text-warn font-semibold" : "text-ink3"}>{serviceWords(r.service)}</span> },
              ]}
              phone={(r) => ({
                title: `${vName(r.v)} · ${showPlate(r.v.number)}`, icon: Bus, iconTone: r.paperTone === "bad" ? "bad" : r.v.status === "UNDER_REPAIR" ? "warn" : "brand",
                sub: [r.route ? `Route ${r.route.number}` : "No route", r.driver?.name ?? "No driver", `${r.v.capacity} seats`].join(" · "),
                pills: <><Pill tone={VEHICLE_STATUS[r.v.status]?.tone ?? "neutral"} className="!h-[22px] !text-[11.5px]">{VEHICLE_STATUS[r.v.status]?.label}</Pill>{r.paperTone !== "ok" && <Pill tone={r.paperTone === "bad" ? "bad" : "warn"} className="!h-[22px] !text-[11.5px]">{r.papers.length ? (r.paperTone === "bad" ? "Paper expired" : "Paper ending") : "No papers"}</Pill>}{(r.service.due || r.service.soon) && <Pill tone="warn" className="!h-[22px] !text-[11.5px]">{serviceWords(r.service)}</Pill>}</>,
              })}
              empty={q ? <Empty icon={Bus} title="No vehicle matches" body={`Nothing matches “${one(sp.q)}”.`} action={<ButtonLink href={HREF} variant="secondary">Clear search</ButtonLink>} />
                : <Empty icon={Bus} title="No vehicles yet" body="Add each bus or van with its papers' expiry dates, so reminders go before they end." action={can.fleet ? <ButtonLink href={addQ(close, { do: "vehicle" })} scroll={false} variant="secondary" icon={Plus}>Add vehicle</ButtonLink> : undefined} />} />
          </Card>
        )}

        {view === "people" && (
          <Card className="overflow-hidden">
            <Toolbar><UrlSearch id="ppl-q" placeholder="Name, phone, licence or route" /></Toolbar>
            <DataList rows={pRows} rowKey={(r) => r.d.id} minWidth={960} caption="Drivers and attendants" rowHref={(r) => here({ person: r.d.id })}
              footer={plural(pRows.length, "person", "people")}
              columns={[
                { key: "n", label: "Name", render: (r) => <div><p className="font-semibold">{r.d.name}</p><p className="text-[12.5px] text-ink3">{driverRole(r.d.role)} · {r.d.employment === "HIRED" ? `Hired${r.d.vendor ? ` from ${r.d.vendor.name}` : ""}` : "Staff"}</p></div> },
                { key: "ph", label: "Phone", nowrap: true, render: (r) => <span className="tnum">{showPhone(r.d.phone)}</span> },
                { key: "lic", label: "Licence", render: (r) => (r.d.role !== "DRIVER" ? <span className="text-ink3">—</span> : <span className="flex flex-col items-start gap-0.5"><span className="font-mono text-[12.5px]">{r.d.licenceNo}</span><Pill tone={expiryTone(r.d.licenceExpiry, p.today, soon)} className="!h-5 !text-[11px]">{r.d.licenceExpiry ? `${expiryWords(r.d.licenceExpiry, p.today) === "Valid" ? "Till" : expiryWords(r.d.licenceExpiry, p.today) + " ·"} ${formatDate(r.d.licenceExpiry)}` : "No date"}</Pill></span>) },
                { key: "veh", label: "Vehicle and route", render: (r) => (r.route ? <span>Route {r.route.number}{r.vehicle && <span className="block text-[12.5px] text-ink3">{vName(r.vehicle)}</span>}</span> : <span className="text-ink3">Not on a route</span>) },
                { key: "app", label: "Driver app", render: (r) => <Pill tone={APP_TONE[r.app.state]} dot>{APP_WORDS[r.app.state]}</Pill> },
                { key: "st", label: "Status", render: (r) => <Pill tone={r.d.status === "ACTIVE" ? "ok" : "neutral"}>{r.d.status === "ACTIVE" ? "Active" : "Inactive"}</Pill> },
              ]}
              phone={(r) => ({
                title: r.d.name, avatar: r.d.name, sub: [driverRole(r.d.role), showPhone(r.d.phone), r.route ? `Route ${r.route.number}` : "No route"].join(" · "),
                pills: <><Pill tone={APP_TONE[r.app.state]} className="!h-[22px] !text-[11.5px]">App: {APP_WORDS[r.app.state]}</Pill>{r.d.role === "DRIVER" && expiryTone(r.d.licenceExpiry, p.today, soon) !== "ok" && <Pill tone={expiryTone(r.d.licenceExpiry, p.today, soon)} className="!h-[22px] !text-[11.5px]">Licence {expiryWords(r.d.licenceExpiry, p.today).toLowerCase()}</Pill>}</>,
              })}
              empty={<Empty icon={Users} title={q ? "Nobody matches" : "No drivers yet"} body={q ? `Nothing matches “${one(sp.q)}”.` : "Add drivers and attendants. Each gets a driver app login of their own."} action={can.fleet && !q ? <ButtonLink href={addQ(close, { do: "driver" })} scroll={false} variant="secondary" icon={Plus}>Add driver</ButtonLink> : undefined} />} />
          </Card>
        )}

        {view === "papers" && data.due && (
          <>
            <Card className="overflow-hidden">
              <CardHeader title="Papers and licences needing attention" description={papersP.range ? `Ending ${papersP.label.toLowerCase()}, and anything already expired` : `Expired, or ending in the next 45 days. Reminders go ${soon} and 7 days before.`} icon={CalendarClock}
                action={<PeriodFilter {...p.dates} ahead allLabel="Next 45 days" size="sm" />} />
              <DataList rows={data.due} rowKey={(r) => r.id} minWidth={720} caption="Papers needing attention"
                columns={[
                  { key: "w", label: "Paper", render: (r) => <span className="font-semibold">{r.what === "licence" ? "Driving licence" : paperLabel(r.kind)}</span> },
                  { key: "who", label: "Vehicle or driver", render: (r) => (r.who ? <Link className="hover:underline" href={here({ show: r.vehicleId })} scroll={false}>{vName(r.who)}</Link> : <Link className="hover:underline" href={here({ person: r.driverId })} scroll={false}>{r.name}</Link>) },
                  { key: "e", label: "Expires", nowrap: true, render: (r) => formatDate(r.expiresOn) },
                  { key: "s", label: "State", render: (r) => <Pill tone={expiryTone(r.expiresOn, p.today, soon)} dot>{expiryWords(r.expiresOn, p.today)}</Pill> },
                  { key: "a", label: "", render: (r) => (can.fleet ? (r.what === "paper" ? <ButtonLink size="sm" href={addQ(close, { do: "paper", pv: r.vehicleId, pk: r.kind })} scroll={false}>Upload renewed</ButtonLink> : <ButtonLink size="sm" href={addQ(close, { driver: r.driverId })} scroll={false}>Update licence</ButtonLink>) : null) },
                ]}
                phone={(r) => ({ title: `${r.what === "licence" ? "Licence" : paperLabel(r.kind)} · ${r.who ? vName(r.who) : r.name}`, icon: r.what === "licence" ? IdCard : ShieldCheck, iconTone: expiryTone(r.expiresOn, p.today, soon) === "bad" ? "bad" : "warn", sub: `${expiryWords(r.expiresOn, p.today)} · ${formatDate(r.expiresOn)}` })}
                empty={<Empty icon={ShieldCheck} title="Nothing ending" body={papersP.range ? `No paper or licence ends ${papersP.label.toLowerCase()}.` : "Every paper and licence is valid for the next 45 days."} />} />
            </Card>
            <Card className="overflow-hidden">
              <CardHeader title="Papers of each vehicle" description="The current paper of each kind. Renewing keeps the old one on record." icon={ShieldCheck} />
              <DataList rows={data.vehicles} rowKey={(r) => r.v.id} minWidth={760} caption="Papers by vehicle" rowHref={(r) => here({ show: r.v.id })}
                columns={[
                  { key: "v", label: "Vehicle", render: (r) => <span className="font-semibold">{vName(r.v)}<span className="block text-[12px] text-ink3 font-mono font-normal">{showPlate(r.v.number)}</span></span> },
                  ...PAPER_KINDS.map((k) => ({ key: k.value, label: k.label, nowrap: true, render: (r: (typeof data.vehicles)[number]) => { const d = r.papers.find((x) => x.kind === k.value); return d ? <span className="flex flex-col"><span className="tnum">{formatDate(d.expiresOn)}</span><Pill tone={expiryTone(d.expiresOn, p.today, soon)} className="!h-5 !text-[11px] w-fit">{expiryWords(d.expiresOn, p.today)}</Pill></span> : <span className="text-ink3">Not added</span>; } })),
                ]}
                phone={(r) => ({ title: vName(r.v), icon: ShieldCheck, iconTone: r.paperTone === "bad" ? "bad" : r.paperTone === "warn" ? "warn" : "ok", sub: PAPER_KINDS.map((k) => { const d = r.papers.find((x) => x.kind === k.value); return `${k.label.split(" ")[0]} ${d ? formatDate(d.expiresOn) : "—"}`; }).join(" · ") })}
                empty={<Empty icon={Bus} title="No vehicles yet" />} />
            </Card>
          </>
        )}

        {view === "costs" && data.costs && (() => {
          const live = data.costs.rows.filter((r) => !r.cancelledAt);
          const total = live.reduce((s, r) => s + r.amountPaise, BigInt(0));
          const fuel = live.filter((r) => r.kind === "FUEL").reduce((s, r) => s + r.amountPaise, BigInt(0));
          const per = data.vehicles.map((v) => ({ v: v.v, sum: live.filter((r) => r.vehicleId === v.v.id).reduce((s, r) => s + r.amountPaise, BigInt(0)) })).filter((x) => x.sum > BigInt(0)).sort((a, b) => Number(b.sum - a.sum));
          const top = per[0]?.sum ?? BigInt(1);
          const vOf = (vid: string) => data.vehicles.find((v) => v.v.id === vid)?.v ?? data.costs!.vehicles.find((v) => v.id === vid) ?? null;
          return (
            <>
              <Card className="overflow-hidden">
                <Toolbar className="flex-wrap">
                  <PeriodFilter {...p.dates} fallback="thismonth" size="sm" />
                  {can.export && <ExportButton href={qs(`${BASE}/export`, { list: "costs", ...costsP.keep, kind: costKind === "all" ? null : costKind, v: costVehicle })} />}
                </Toolbar>
                <div className="px-3 pt-3 pb-1 flex flex-col gap-2">
                  <Chips value={costKind} label="Kind" options={[
                    { value: "all", label: "Fuel and repairs", href: here({ kind: null }) },
                    { value: "FUEL", label: "Fuel", href: here({ kind: "FUEL" }) },
                    { value: "REPAIR", label: "Repairs and service", href: here({ kind: "REPAIR" }) },
                  ]} />
                  {data.vehicles.length > 1 && <Chips value={costVehicle ?? "all"} label="Vehicle" options={[{ value: "all", label: "All vehicles", href: here({ v: null }) }, ...data.vehicles.map((v) => ({ value: v.v.id, label: vName(v.v), href: here({ v: v.v.id }) }))]} />}
                </div>
                <div className="grid grid-cols-3 gap-2 px-4 py-3">
                  <Figure k={`Total · ${costsP.label}`} v={rupeesShort(total)} />
                  <Figure k="Fuel" v={rupeesShort(fuel)} />
                  <Figure k="Repairs and service" v={rupeesShort(total - fuel)} />
                </div>
                <DataList rows={data.costs.rows} rowKey={(r) => r.id} minWidth={860} caption="Fuel and repairs" rowClass={(r) => r.cancelledAt && "opacity-60"}
                  footer={`${plural(data.costs.rows.length, "entry", "entries")} · goes to Finance, Expenses`}
                  columns={[
                    { key: "d", label: "Date", nowrap: true, render: (r) => formatDate(r.date) },
                    { key: "v", label: "Vehicle", render: (r) => { const v = vOf(r.vehicleId); return v ? vName(v) : "—"; } },
                    { key: "k", label: "Kind", render: (r) => <Pill tone={r.kind === "FUEL" ? "info" : "neutral"}>{r.kind === "FUEL" ? "Fuel" : r.kind === "SERVICE" ? "Service" : "Repair"}</Pill> },
                    { key: "w", label: "Details", render: (r) => <span>{r.what}{r.odometerKm != null && <span className="block text-[12px] text-ink3 tnum">{r.odometerKm.toLocaleString("en-IN")} km</span>}{r.cancelledAt && <span className="block text-[12px] text-bad">Cancelled: {r.cancelReason}</span>}</span> },
                    { key: "b", label: "Bill", render: (r) => (r.billFileId ? <a href={fileLink(r.billFileId, p.current.ctx.schoolId)} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline inline-flex items-center gap-1 relative z-[1]"><Paperclip size={14} aria-hidden="true" />View</a> : <span className="text-ink3">—</span>) },
                    { key: "a", label: "Amount", align: "right", nowrap: true, render: (r) => <span className={r.cancelledAt ? "line-through tnum" : "font-semibold tnum"}>{formatRupees(r.amountPaise)}</span> },
                    { key: "x", label: "", render: (r) => (can.fleet && !r.cancelledAt ? <ButtonLink size="sm" variant="ghost" href={addQ(here({}), { cancel: r.id })} scroll={false} className="relative z-[1]">Cancel</ButtonLink> : null) },
                  ]}
                  phone={(r) => { const v = vOf(r.vehicleId); return { title: `${r.kind === "FUEL" ? "Fuel" : r.kind === "SERVICE" ? "Service" : "Repair"} · ${v ? vName(v) : ""}`, icon: r.kind === "FUEL" ? Fuel : Wrench, iconTone: r.cancelledAt ? "neutral" : r.kind === "FUEL" ? "info" : "warn", sub: `${formatDate(r.date)} · ${r.what}${r.cancelledAt ? " · cancelled" : ""}`, right: <span className={r.cancelledAt ? "line-through tnum" : "font-semibold tnum"}>{rupeesShort(r.amountPaise)}</span> }; }}
                  empty={<Empty icon={Fuel} title="No fuel or repairs" body={`Nothing recorded ${costsP.label.toLowerCase()}.`} action={can.fleet ? <ButtonLink href={addQ(close, { do: "cost" })} scroll={false} variant="secondary" icon={Plus}>Record fuel or repair</ButtonLink> : undefined} />} />
              </Card>
              <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 [&>*]:min-w-0 items-start">
                <Card>
                  <CardHeader title="Cost per vehicle" description={costsP.label} icon={Bus} />
                  <div className="px-5 pb-5">{per.length ? <HBars labelWidth={110} rows={per.map((x) => ({ key: x.v.id, label: vName(x.v), value: Number((x.sum * BigInt(100)) / top), text: rupeesShort(x.sum), href: here({ v: x.v.id }), active: costVehicle === x.v.id }))} /> : <p className="text-[13.5px] text-ink3">No costs in these dates.</p>}</div>
                </Card>
                <Card>
                  <CardHeader title="Service schedule" description="Every N km or N days, from the last service" icon={Wrench} />
                  <ul className="px-2 pb-2">
                    {data.vehicles.map((r) => (
                      <li key={r.v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                        <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{vName(r.v)}</p><p className="text-[12.5px] text-ink3 truncate">{[r.v.serviceEveryKm ? `every ${r.v.serviceEveryKm.toLocaleString("en-IN")} km` : null, r.v.serviceEveryDays ? `every ${r.v.serviceEveryDays} days` : null].filter(Boolean).join(" or ") || "No schedule set"}{r.v.lastServiceOn ? ` · last ${formatDate(r.v.lastServiceOn)}` : ""}</p></div>
                        <Pill tone={r.service.due ? "bad" : r.service.soon ? "warn" : "neutral"}>{serviceWords(r.service)}</Pill>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </>
          );
        })()}

        {view === "vendors" && (
          <Card className="overflow-hidden">
            <CardHeader title="Vendors" description="Companies the school hires buses or drivers from" icon={Building2} />
            {data.vendors.length === 0 ? <Empty icon={Building2} title="No vendors" body="Add one when the school hires a bus or a driver." action={can.fleet ? <ButtonLink href={addQ(close, { do: "vendor" })} scroll={false} variant="secondary" icon={Plus}>Add vendor</ButtonLink> : undefined} /> : (
              <ul className="divide-y divide-line/70 border-t border-line">
                {data.vendors.map((v) => {
                  const nVeh = data.vehicles.filter((x) => x.v.vendorId === v.id).length;
                  const nPpl = data.people.filter((x) => x.d.vendorId === v.id).length;
                  const ends = v.contractEnd ? daysBetween(p.today, v.contractEnd) : null;
                  return (
                    <li key={v.id} className="px-4 md:px-5 py-3.5 flex flex-col md:flex-row md:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px]">{v.name}</p>
                        <p className="text-[13px] text-ink3">{[v.contactName, v.phone ? showPhone(v.phone) : null, v.gstin ? `GSTIN ${v.gstin}` : null].filter(Boolean).join(" · ") || "No contact details"}</p>
                        <p className="text-[13px] text-ink2 mt-0.5">{plural(nVeh, "vehicle")} · {plural(nPpl, "person", "people")}{v.monthlyChargePaise != null ? ` · ${rupeesShort(v.monthlyChargePaise)} a month` : ""}{can.vendorBank && v.bankLast4 ? ` · ${v.bankName ?? "Bank"} account ending ${v.bankLast4}` : ""}</p>
                      </div>
                      {ends != null && <Pill tone={ends < 0 ? "bad" : ends <= 30 ? "warn" : "neutral"}>{ends < 0 ? "Contract ended" : `Contract till ${formatDate(v.contractEnd!)}`}</Pill>}
                      {can.fleet && (
                        <div className="flex gap-2">
                          <ButtonLink size="sm" href={addQ(close, { vendor: v.id })} scroll={false} icon={Pencil}>Edit</ButtonLink>
                          <ConfirmAct action={archiveVendorAction} fields={{ vendorId: v.id }} trigger="Archive" triggerVariant="ghost" title={`Archive ${v.name}?`} confirmLabel="Archive vendor" danger>
                            {nVeh + nPpl ? "Vehicles or drivers are still linked to this vendor. Change them first." : "It drops out of lists and stays on record."}
                          </ConfirmAct>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </Stack>

      {/* One vehicle: details, papers, service and recent costs. */}
      {shownVehicle && (() => {
        const r = shownVehicle;
        return (
          <UrlSheet title={`${vName(r.v)} · ${showPlate(r.v.number)}`} sub={[vehicleType(r.v.type), r.v.model, `${r.v.capacity} seats`, r.route ? `Route ${r.route.number} · ${r.route.name}` : "Not on a route"].filter(Boolean).join(" · ")} closeHref={close} wide>
            <div className="flex flex-col gap-5">
              <DL rows={[
                ["Status", <Pill key="s" tone={VEHICLE_STATUS[r.v.status]?.tone ?? "neutral"}>{VEHICLE_STATUS[r.v.status]?.label}</Pill>],
                ["Driver", r.driver?.name ?? "—"],
                ["Owned or hired", r.v.ownership === "HIRED" ? `Hired${r.v.vendor ? ` from ${r.v.vendor.name}` : ""}` : "Owned"],
                ["GPS", r.v.gpsDeviceId ? `Device ${r.v.gpsDeviceId}` : "From the driver app"],
                ["Odometer", r.v.odometerKm != null ? `${r.v.odometerKm.toLocaleString("en-IN")} km` : "—"],
                ["Service", serviceWords(r.service)],
              ]} />
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-2">Papers</p>
                <ul className="flex flex-col gap-1.5">
                  {PAPER_KINDS.map((k) => {
                    const d = r.papers.find((x) => x.kind === k.value);
                    return (
                      <li key={k.value} className="flex items-center gap-3 rounded-xl bg-sunken/60 px-3 py-2">
                        <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{k.label}</b><span className="block text-[12.5px] text-ink3">{d ? `${d.number ? `${d.number} · ` : ""}till ${formatDate(d.expiresOn)}` : "Not added"}</span></span>
                        {d && <Pill tone={expiryTone(d.expiresOn, p.today, soon)}>{expiryWords(d.expiresOn, p.today)}</Pill>}
                        {d?.fileId && <a href={fileLink(d.fileId, p.current.ctx.schoolId)} target="_blank" rel="noreferrer" className="text-brand text-[13px] font-semibold hover:underline">View</a>}
                        {can.fleet && <ButtonLink size="sm" variant="ghost" href={addQ(close, { do: "paper", pv: r.v.id, pk: k.value })} scroll={false}>{d ? "Renew" : "Add"}</ButtonLink>}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-2">Recent fuel and repairs</p>
                {data.recent.length ? (
                  <ul className="flex flex-col divide-y divide-line/70">
                    {data.recent.map((c) => <li key={c.id} className="flex items-center gap-3 py-2 text-[14px]"><span className="text-ink3 w-24 shrink-0 tnum">{formatDate(c.date)}</span><span className="flex-1 min-w-0 truncate">{c.what}</span><span className={c.cancelledAt ? "line-through tnum" : "font-semibold tnum"}>{rupeesShort(c.amountPaise)}</span></li>)}
                  </ul>
                ) : <p className="text-[13.5px] text-ink3">Nothing recorded yet.</p>}
              </div>
              {can.fleet && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <ButtonLink href={addQ(close, { vehicle: r.v.id })} scroll={false} variant="primary" icon={Pencil}>Edit vehicle</ButtonLink>
                  <ButtonLink href={addQ(close, { do: "cost", cv: r.v.id, ck: "FUEL" })} scroll={false} icon={Fuel}>Record fuel</ButtonLink>
                  <ButtonLink href={addQ(close, { do: "cost", cv: r.v.id, ck: "REPAIR" })} scroll={false} icon={Wrench}>Record repair</ButtonLink>
                  <ConfirmAct action={archiveVehicleAction} fields={{ vehicleId: r.v.id }} trigger={<><Archive size={16} aria-hidden="true" />Archive</>} triggerVariant="ghost" title={`Archive ${vName(r.v)}?`} confirmLabel="Archive vehicle" danger>
                    {r.route ? `It runs Route ${r.route.number}. Give the route another vehicle first.` : "It drops out of lists. Its papers, costs and trips stay on record."}
                  </ConfirmAct>
                </div>
              )}
            </div>
          </UrlSheet>
        );
      })()}

      {/* One driver or attendant: details, app login and phones. */}
      {shownPerson && (() => {
        const r = shownPerson;
        const live = data.devices.filter((d) => !d.revokedAt);
        return (
          <UrlSheet title={r.d.name} sub={`${driverRole(r.d.role)} · ${r.d.employment === "HIRED" ? `hired${r.d.vendor ? ` from ${r.d.vendor.name}` : ""}` : "staff"}${r.route ? ` · Route ${r.route.number}` : ""}`} closeHref={close} wide>
            <div className="flex flex-col gap-5">
              <DL rows={[
                ["Phone", <a key="p" href={telHref(r.d.phone)} className="text-brand font-semibold hover:underline tnum">{showPhone(r.d.phone)}</a>],
                ["Vehicle", r.vehicle ? `${vName(r.vehicle)} · ${showPlate(r.vehicle.number)}` : "—"],
                ...(r.d.role === "DRIVER" ? [["Licence", r.d.licenceNo ?? "—"] as [string, React.ReactNode], ["Licence expiry", r.d.licenceExpiry ? <span key="e" className="inline-flex items-center gap-2">{formatDate(r.d.licenceExpiry)}<Pill tone={expiryTone(r.d.licenceExpiry, p.today, soon)}>{expiryWords(r.d.licenceExpiry, p.today)}</Pill></span> : "—"] as [string, React.ReactNode]] : []),
                ["Driver app", <Pill key="a" tone={APP_TONE[r.app.state]} dot>{APP_WORDS[r.app.state]}{r.app.username ? ` · ${r.app.username}` : ""}</Pill>],
                ["Staff & HR", r.d.staffId ? "Linked to a staff record" : "Not staff"],
              ]} />
              {can.fleet && (
                <div className="flex flex-wrap gap-2">
                  {(r.app.state === "None" || r.app.state === "Invited") && <ActButton action={sendInviteAction} fields={{ driverId: r.d.id }} label={r.app.state === "None" ? "Send app invite" : "Send invite again"} icon="Send" pendingText="Sending…" />}
                  {r.app.state === "Active" && (
                    <ConfirmAct action={setAppLoginAction} fields={{ driverId: r.d.id, on: "0" }} trigger={<><Power size={16} aria-hidden="true" />Turn app login off</>} title={`Turn off ${r.d.name}'s app login?`} confirmLabel="Turn off" danger>
                      They are signed out at once and their phone keys stop working. Trip history stays.
                    </ConfirmAct>
                  )}
                  {r.app.state === "Disabled" && <ActButton action={setAppLoginAction} fields={{ driverId: r.d.id, on: "1" }} label="Turn app login on" icon="Undo2" />}
                </div>
              )}
              {r.d.role === "DRIVER" && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2">Phones with the Android driver app</p>
                  {live.length ? (
                    <ul className="flex flex-col gap-1.5">
                      {live.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 rounded-xl bg-sunken/60 px-3 py-2">
                          <Smartphone size={17} className="text-ink3 shrink-0" aria-hidden="true" />
                          <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{d.name}</b><span className="block text-[12.5px] text-ink3">Key …{d.keyLast4} · {d.lastSeenAt ? `last sent ${formatDate(d.lastSeenAt, p.tz)}` : "not used yet"}{d.rejectedPoints ? ` · ${d.rejectedPoints} points refused` : ""}</span></span>
                          {can.fleet && <ConfirmAct action={revokeKeyAction} fields={{ deviceId: d.id }} trigger="Turn off" triggerVariant="ghost" title={`Turn off the key for ${d.name}?`} confirmLabel="Turn off key" danger>That phone can no longer send locations or start trips. Make a new key to use it again.</ConfirmAct>}
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[13.5px] text-ink3">No phone set up. The driver can also use the web driver page, which sends the location only while it is open.</p>}
                  {can.fleet && r.app.state !== "Disabled" && <ButtonLink className="mt-2" size="sm" href={addQ(close, { key: r.d.id })} scroll={false} icon={KeyRound}>Set up a phone</ButtonLink>}
                </div>
              )}
              {can.fleet && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <ButtonLink href={addQ(close, { driver: r.d.id })} scroll={false} variant="primary" icon={Pencil}>Edit</ButtonLink>
                  <ConfirmAct action={archiveDriverAction} fields={{ driverId: r.d.id }} trigger={<><UserRound size={16} aria-hidden="true" />Remove</>} triggerVariant="ghost" title={`Remove ${r.d.name}?`} confirmLabel={`Remove ${r.d.name}`} danger>
                    {r.route ? `${r.d.name} is on Route ${r.route.number}. Give the route someone else first.` : `${r.d.name} drops out of lists${r.d.employment === "HIRED" ? " and their app login is turned off" : ""}. Trip history stays.`}
                  </ConfirmAct>
                </div>
              )}
            </div>
          </UrlSheet>
        );
      })()}

      {can.fleet && (doing === "vehicle" || editVehicle) && data.crew && (() => {
        const r = editVehicle ? data.vehicles.find((x) => x.v.id === editVehicle) : null;
        if (editVehicle && !r) return null;
        return (
          <VehicleSheet closeHref={close} vendors={vendorOpts} gps={p.settings.gpsProvider || null}
            routes={can.routes ? data.routes.filter((x) => !x.vehicleId || x.vehicleId === r?.v.id).map((x) => ({ value: x.id, label: `Route ${x.number} · ${x.name}` })) : null}
            drivers={data.crew.drivers}
            start={r ? { id: r.v.id, number: showPlate(r.v.number), label: r.v.label ?? "", type: r.v.type, model: r.v.model ?? "", capacity: String(r.v.capacity), ownership: r.v.ownership, vendorId: r.v.vendorId ?? "", status: r.v.status, gpsDeviceId: r.v.gpsDeviceId ?? "", odometerKm: r.v.odometerKm?.toString() ?? "", serviceEveryKm: r.v.serviceEveryKm?.toString() ?? "", serviceEveryDays: r.v.serviceEveryDays?.toString() ?? "", routeId: r.route?.id ?? "" } : null} />
        );
      })()}
      {can.fleet && doing === "paper" && <PaperSheet closeHref={close} vehicles={vehicleOpts} start={{ vehicleId: pick("pv") ?? "", kind: one(sp.pk) }} />}
      {can.fleet && (doing === "driver" || editDriver) && (() => {
        const r = editDriver ? data.people.find((x) => x.d.id === editDriver) : null;
        if (editDriver && !r) return null;
        return <DriverSheet closeHref={close} vendors={vendorOpts} start={r ? { id: r.d.id, name: r.d.name, phone: r.d.phone, role: r.d.role, employment: r.d.employment, vendorId: r.d.vendorId ?? "", licenceNo: r.d.licenceNo ?? "", licenceExpiry: r.d.licenceExpiry?.toISOString().slice(0, 10) ?? "" } : null} />;
      })()}
      {can.fleet && (doing === "vendor" || editVendor) && (() => {
        const v = editVendor ? data.vendors.find((x) => x.id === editVendor) : null;
        if (editVendor && !v) return null;
        return <VendorSheet closeHref={close} bank={can.vendorBank} start={v ? { id: v.id, name: v.name, contactName: v.contactName ?? "", phone: v.phone ?? "", email: v.email ?? "", address: v.address ?? "", gstin: v.gstin ?? "", bankName: v.bankName ?? "", ifsc: v.ifsc ?? "", bankLast4: v.bankLast4, monthlyCharge: rupeesInput(v.monthlyChargePaise), contractEnd: v.contractEnd?.toISOString().slice(0, 10) ?? "" } : null} />;
      })()}
      {can.fleet && doing === "cost" && <CostSheet closeHref={close} vehicles={vehicleOpts} start={{ vehicleId: pick("cv") ?? "", kind: one(sp.ck), date: p.todayStr }} />}
      {can.fleet && cancelId && data.costs && (() => {
        const c = data.costs.rows.find((x) => x.id === cancelId && !x.cancelledAt);
        return c ? <CancelCostSheet closeHref={close} entry={{ id: c.id, kind: c.kind === "FUEL" ? "fuel" : "repair", what: `${formatDate(c.date)} · ${c.what} · ${formatRupees(c.amountPaise)}` }} /> : null;
      })()}
      {can.fleet && keyFor && (() => {
        const r = data.people.find((x) => x.d.id === keyFor && x.d.role === "DRIVER");
        return r ? <KeySheet closeHref={here({ person: r.d.id })} driver={{ id: r.d.id, name: r.d.name }} school={{ address: origin, id: p.current.ctx.schoolId }} /> : null;
      })()}
    </div>
  );
}
