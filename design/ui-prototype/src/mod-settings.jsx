// Settings: the school-wide settings (blueprint 20-settings.md, 05-roles.md, 08-platform-security.md).
// Only the Principal and the School Admin have this module. Each module keeps its own rules on its last page.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { NAV, STUDENT_PROFILE, inr } from './data.js';
import { STAFF } from './sample.js';
import { MODULES, ROLES, ROLE } from './config.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Field, Input, Checkbox, Switch, Segmented, Sheet, Empty, Ring, useToast } from './ui.jsx';
import { useNav, useRole, useTheme } from './shell.jsx';
import { ACCENTS } from './other.jsx';
import {
  ModuleHead, useCanEdit, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, SettingRow, ToggleRow, SettingsCard,
  Banner, Progress, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, Icon, TONE_SOFT,
} from './kit.jsx';

/* ---------- Shared helpers ---------- */
const NAV_ITEMS = NAV.flatMap((g) => g.items);
const modLabel = (id) => NAV_ITEMS.find((x) => x.id === id)?.label || MODULES[id]?.short || id;
const modIcon = (id) => NAV_ITEMS.find((x) => x.id === id)?.icon || 'Circle';
const ROLE_SHORT = {
  principal: 'Principal', schooladmin: 'School Admin', accountant: 'Accountant', teacher: 'Teacher', classteacher: 'Class Teacher',
  receptionist: 'Reception', transport: 'Transport', librarian: 'Librarian', warden: 'Warden', storekeeper: 'Store Keeper',
  vp: 'Vice Principal', academichead: 'Academic Head', hr: 'HR', officestaff: 'Office Staff', examincharge: 'Exam In-charge',
  admissioncounsellor: 'Admission Couns.', counsellor: 'Counsellor', gatesecurity: 'Gate Security', student: 'Student',
};

// A setting with its value and a Change button
function ValueRow({ title, sub, value, onChange, mono }) {
  const canEdit = useCanEdit();
  return (
    <SettingRow title={title} sub={sub}>
      <span className="flex items-center gap-1.5">
        <span className={cx('font-semibold text-right', mono ? 'font-mono text-[12.5px]' : 'text-[14px] tnum')}>{value}</span>
        {canEdit && onChange && <Button size="sm" variant="ghost" onClick={onChange}>Change</Button>}
      </span>
    </SettingRow>
  );
}
// Small "label: value" lines inside cards
function KV({ k, v, mono }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13.5px]">
      <span className="text-ink3 shrink-0">{k}</span>
      <span className={cx('text-right min-w-0 break-words font-medium', mono && 'font-mono text-[12.5px]')}>{v}</span>
    </div>
  );
}
const STATUS_TONE = { Active: 'ok', Connected: 'ok', Verified: 'ok', Passed: 'ok', Done: 'ok', Invited: 'info', 'To verify': 'warn', Error: 'bad', Disabled: 'neutral', Inactive: 'neutral', 'Not connected': 'neutral', Waiting: 'warn' };

/* =====================================================================
   1. School Profile
   ===================================================================== */
const SCHOOL_D = {
  name: 'Sunrise Public School', code: 'SPS-HYD-001', est: '2004',
  address: 'Plot 14, Road No. 3, KPHB Colony, Kukatpally, Hyderabad, Telangana 500072',
  phone: '040 2305 4410', mobile: '98490 11223', email: 'office@sunriseps.in', web: 'www.sunriseps.in',
  affiliation: '3630417', cbseCode: '55417', udise: '36290401512', gstin: '36AAKTS4471K1Z9',
};
const CAMPUSES = [
  { id: 'kph', name: 'Kukatpally', tag: 'Main campus', address: 'Plot 14, Road No. 3, KPHB Colony, Kukatpally', head: 'Lakshmi Rao', phone: '040 2305 4410', students: 1236, staff: 86, own: 'Uses the school fees and colours' },
  { id: 'myp', name: 'Miyapur campus', tag: 'Since 2019', address: '2-48/7, Allwyn Colony Road, Miyapur', head: 'Rekha Nair', phone: '040 2304 8812', students: 684, staff: 47, own: 'Own fee amounts · school colours' },
];
const LANGS = [
  ['English', 'English'], ['Telugu', 'తెలుగు'], ['Hindi', 'हिन्दी'], ['Tamil', 'தமிழ்'], ['Kannada', 'ಕನ್ನಡ'], ['Malayalam', 'മലയാളം'], ['Marathi', 'मराठी'], ['Bengali', 'বাংলা'],
];
const BOARDS = {
  CBSE: '2 terms, CBSE 9-point grade scale (A1 to E), CBSE report card',
  ICSE: '2 terms, ICSE percentage grades, ICSE report card',
  'State board': 'Telangana State: SA1, SA2 and FA tests, state grade scale, state report card',
  IB: 'IB MYP criteria A to D, grades 1 to 7, IB report',
  Cambridge: 'Cambridge Lower Secondary stages, Cambridge report',
  Custom: 'You choose terms, grades and the report card yourself',
};
const VAULT = [
  { id: 'd1', name: 'CBSE affiliation letter', type: 'Affiliation', ver: 2, issued: '1 Apr 2024', expires: '31 Mar 2029', status: 'Verified' },
  { id: 'd2', name: 'Society registration certificate', type: 'Registration', ver: 1, issued: '12 Jan 2004', expires: null, status: 'Verified' },
  { id: 'd3', name: 'Fire safety NOC', type: 'NOC', ver: 3, issued: '15 Nov 2025', expires: '14 Nov 2026', status: 'Verified', soon: 'Expires in 36 days' },
  { id: 'd4', name: 'Telangana State recognition order', type: 'NOC', ver: 2, issued: '10 May 2022', expires: '9 May 2027', status: 'Verified' },
  { id: 'd5', name: 'Building safety certificate', type: 'Other', ver: 2, issued: '2 Jun 2025', expires: '1 Jun 2027', status: 'Verified' },
  { id: 'd6', name: 'Water and sanitation certificate', type: 'Other', ver: 1, issued: '20 Sep 2026', expires: '19 Sep 2027', status: 'To verify' },
  { id: 'd7', name: 'Bus permits (9 buses)', type: 'Other', ver: 4, issued: '1 Mar 2026', expires: '28 Feb 2027', status: 'Verified' },
];

function ProfilePage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const { accent } = useTheme();
  const [sheet, setSheet] = useState(null);
  const [board, setBoard] = useState('CBSE');
  const [pickBoard, setPickBoard] = useState('CBSE');
  const [langs, setLangs] = useState(new Set(['English', 'Telugu', 'Hindi']));
  const [defLang, setDefLang] = useState('English');
  const [docs, setDocs] = useState(VAULT);
  const [q, setQ] = useState('');
  const [campus, setCampus] = useState(null);
  const [share, setShare] = useState(null);
  const [gstin, setGstin] = useState(SCHOOL_D.gstin);
  const [gstErr, setGstErr] = useState('');
  const [name, setName] = useState(SCHOOL_D.name);
  const [nameErr, setNameErr] = useState('');
  const acc = ACCENTS.find((a) => a.id === accent) || ACCENTS[0];
  const shown = docs.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase()));
  const toggleLang = (l) => {
    if (!canEdit) return;
    if (l === defLang) { toast({ title: `${l} is the default language`, body: 'Pick another default first.', tone: 'bad' }); return; }
    setLangs((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; });
    toast({ title: `${l} ${langs.has(l) ? 'switched off' : 'switched on'} for screens and messages`, undo: () => setLangs((s) => { const n = new Set(s); n.has(l) ? n.delete(l) : n.add(l); return n; }) });
  };

  return (
    <div>
      <ModuleHead sub={`${SCHOOL_D.name} · school code ${SCHOOL_D.code} · each section saves on its own`}
        actions={<Button variant="secondary" icon={I.Eye} onClick={() => setSheet('preview')}>Preview on documents</Button>} />
      <Split>
        <Col>
          {/* School details */}
          <Card>
            <CardHead title="School details" sub="Printed on receipts, certificates and messages" icon={I.School}
              action={canEdit && <Button size="sm" variant="secondary" icon={I.Pencil} onClick={() => setSheet('details')}>Edit</Button>} />
            <div className="px-5 pb-4 flex items-center gap-4">
              <MiniLogo className="text-[18px]" />
              <div className="min-w-0 flex-1">
                <p className="font-display font-semibold text-[19px] leading-tight">{name}</p>
                <p className="text-[13px] text-ink3">CBSE · Day school with a boys’ and girls’ hostel · Est. {SCHOOL_D.est}</p>
              </div>
              {canEdit && <Button size="sm" variant="ghost" icon={I.Upload} className="hidden @sm:inline-flex" onClick={() => toast({ title: 'Logo updated', body: 'sunrise-logo.png · shows on screens, receipts and certificates from now on.' })}>Change logo</Button>}
            </div>
            <DL rows={[
              ['Address', SCHOOL_D.address],
              ['School phone', SCHOOL_D.phone],
              ['Office mobile (WhatsApp)', SCHOOL_D.mobile],
              ['Email', SCHOOL_D.email],
              ['Website', SCHOOL_D.web],
              ['CBSE affiliation number', <span className="font-mono text-[13px]">{SCHOOL_D.affiliation}</span>],
              ['UDISE code', <span className="font-mono text-[13px]">{SCHOOL_D.udise}</span>],
              ['GST number (GSTIN)', <span><span className="font-mono text-[13px]">{gstin}</span><span className="block text-[12px] text-ink3">Printed on tax invoices for taxable fee heads (uniforms, transport)</span></span>],
              ['Financial year', 'April to March · now Apr 2026 – Mar 2027'],
              ['Academic year', '2026–27 · 1 Jun 2026 to 31 Mar 2027'],
            ]} />
          </Card>

          {/* Board */}
          <Card>
            <CardHead title="Board and curriculum" sub="The board sets starting defaults. Each module can still change them." icon={I.GraduationCap}
              action={canEdit && <Button size="sm" variant="secondary" onClick={() => { setPickBoard(board); setSheet('board'); }}>Change</Button>} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="rounded-xl bg-sunken/70 p-3.5 flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.BadgeCheck size={20} /></span>
                <div className="min-w-0">
                  <p className="font-semibold text-[14.5px]">{board}</p>
                  <p className="text-[13px] text-ink3">{BOARDS[board]}</p>
                </div>
              </div>
              <ToggleRowLite title="Two boards in one school" sub="For schools running, say, CBSE and Cambridge side by side" />
            </div>
          </Card>

          {/* Campuses */}
          <Card>
            <CardHead title="Campuses" sub="Each campus can have its own fees and branding" icon={I.Building2}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setCampus({ id: 'new', name: '', address: '', head: '', phone: '' })}>Add campus</Button>} />
            <ul className="px-2 pb-2">
              {CAMPUSES.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70">
                  <span className="w-10 h-10 rounded-xl bg-brand text-brandink grid place-items-center shrink-0"><I.School size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-snug">{c.name} <Pill tone={c.tag === 'Main campus' ? 'brand' : 'neutral'} className="!h-5 !text-[11px] ml-1 align-middle">{c.tag}</Pill></p>
                    <p className="text-[12.5px] text-ink3">{c.address}</p>
                    <p className="text-[12.5px] text-ink3 mt-0.5">Head: {c.head} · {c.phone} · <span className="tnum">{c.students.toLocaleString('en-IN')}</span> students · {c.staff} staff</p>
                    <p className="text-[12.5px] text-ink2 mt-0.5">{c.own}</p>
                  </div>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setCampus(c)}>Edit</Button>}
                </li>
              ))}
            </ul>
          </Card>

          {/* Language and region */}
          <Card>
            <CardHead title="Language and region" sub="Languages switched on here can be picked for screens and parent messages" icon={I.Languages} />
            <div className="px-5 pb-4">
              <p className="text-[12px] text-ink3 font-semibold mb-2">Languages switched on</p>
              <div className="flex flex-wrap gap-2">
                {LANGS.map(([l, script]) => {
                  const on = langs.has(l);
                  return (
                    <button key={l} onClick={() => toggleLang(l)} aria-pressed={on}
                      className={cx('h-10 px-3 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition',
                        on ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>
                      {on ? <I.Check size={15} strokeWidth={2.6} /> : <I.Plus size={15} />}{l}{script !== l && <span className="font-normal opacity-75">{script}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Default language" sub="New staff and parents start with this" id="def-lang">
                <Select id="def-lang" value={defLang} onChange={(v) => { if (!canEdit) return; setDefLang(v); toast({ title: `Default language: ${v}` }); }} options={[...langs]} className="w-36" />
              </SettingRow>
              <ValueRow title="Time zone" value="Asia/Kolkata (IST)" onChange={() => toast({ title: 'Time zone', body: 'Only India Standard Time is used by schools in India.', tone: 'info' })} />
              <ValueRow title="Dates" sub="How dates show on screens and documents" value="09-10-2026" />
              <ValueRow title="Numbers and money" value="₹1,16,400" />
            </div>
          </Card>

          {/* School documents */}
          <Card className="overflow-hidden">
            <CardHead title="School documents" sub="Registration, affiliation and NOCs, with versions and expiry reminders" icon={I.FolderOpen}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Upload} onClick={() => setSheet('upload')}>Upload</Button>} />
            <Toolbar className="border-t">
              <SearchBox id="vault-search" value={q} onChange={setQ} placeholder="Search documents" />
            </Toolbar>
            {shown.length === 0 ? <Empty icon={I.SearchX} title="No document matches" body="Try another word, like NOC or fire." /> : (
              <ul className="px-2 py-2">
                {shown.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                    <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', d.soon ? 'bg-warn/12 text-warn' : 'bg-sunken text-ink2')}>{d.soon ? <I.FileClock size={19} /> : <I.FileText size={19} />}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14px] truncate">{d.name}</p>
                      <p className="text-[12.5px] text-ink3 truncate">{d.type} · version {d.ver} · {d.expires ? `valid till ${d.expires}` : 'no expiry'}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Pill tone={STATUS_TONE[d.status]} className="!h-5 !text-[11px]">{d.status}</Pill>
                        {d.soon && <Pill tone="warn" className="!h-5 !text-[11px]">{d.soon}</Pill>}
                      </div>
                    </div>
                    <MoreMenu size="sm" items={[
                      [I.Eye, 'Preview', () => toast({ title: `Opened ${d.name}`, body: `Version ${d.ver} · PDF`, tone: 'info' })],
                      ...(canEdit ? [[I.Upload, 'Upload new version', () => { setDocs((x) => x.map((y) => (y.id === d.id ? { ...y, ver: y.ver + 1, status: 'To verify' } : y))); toast({ title: `${d.name}: version ${d.ver + 1} added`, body: `Version ${d.ver} is kept in the history.` }); }]] : []),
                      ...(canEdit && d.status !== 'Verified' ? [[I.BadgeCheck, 'Mark verified', () => { setDocs((x) => x.map((y) => (y.id === d.id ? { ...y, status: 'Verified' } : y))); toast({ title: `${d.name} marked verified` }); }]] : []),
                      [I.Link, 'Share a link', () => setShare(d)],
                      [I.History, 'Earlier versions', () => toast({ title: `${d.ver} versions of ${d.name}`, body: `Latest uploaded ${d.issued}. Older ones open read-only.`, tone: 'info' })],
                    ]} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHead title="School colour" sub="Buttons, highlights and the top band use it" icon={I.Palette} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-full bg-brand shadow-card grid place-items-center text-brandink"><I.Check size={20} strokeWidth={3} /></span>
                <div>
                  <p className="font-semibold text-[15px]">{acc.name}</p>
                  <p className="text-[12.5px] text-ink3">Used on screens, receipts and certificates</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                {ACCENTS.map((a) => <span key={a.id} title={a.name} className={cx('h-2 flex-1 rounded-full', a.id === acc.id ? 'bg-brand' : 'bg-line')} />)}
              </div>
              <Button variant="secondary" icon={I.Palette} onClick={() => go('appearance')}>Change school colour</Button>
            </div>
          </Card>

          <Card>
            <CardHead title="How it looks on paper" sub="Top of a fee receipt with today’s logo and colour" icon={I.FileText} />
            <div className="px-5 pb-5">
              <div className="rounded-xl bg-sunken/60 p-3 flex justify-center">
                <DocHeader style={{ fontSize: 9 }} className="bg-surface border border-line rounded-[0.6em] p-[1.2em] w-full max-w-[34em]" title="FEE RECEIPT" />
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Board compliance" sub="Numbers the board asks for" icon={I.ShieldCheck} />
            <div className="px-5 pb-4">
              <KV k="CBSE school code" v={SCHOOL_D.cbseCode} mono />
              <KV k="Affiliation valid till" v="31 Mar 2029" />
              <KV k="APAAR ID" v="Asked on the admission form" />
              <KV k="Class 9 and 11 registration" v="Number kept on each student" />
              <KV k="OASIS data updated" v="2 Sep 2026" />
            </div>
          </Card>

          <Card>
            <CardHead title="Sunrise Group" sub="This school belongs to a group of 2 campuses" icon={I.Network} />
            <div className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
              <p><b className="font-semibold">From the group:</b> <span className="text-ink2">message templates, leave types, fee head names</span></p>
              <p><b className="font-semibold">This school’s own:</b> <span className="text-ink2">school colour, timings, fee amounts, holidays</span></p>
              <p className="text-[12.5px] text-ink3">The group was set up by DREAM TEAM when the school was added.</p>
            </div>
          </Card>
        </Col>
      </Split>

      {/* Edit details */}
      <FormSheet open={sheet === 'details'} onClose={() => { setSheet(null); setGstErr(''); setNameErr(''); }} title="Edit school details" sub="Shows on every receipt and certificate from now on. The change is logged." submitLabel="Save details"
        onSubmit={() => {
          let bad = false;
          if (!name.trim()) { setNameErr('School name is needed'); bad = true; } else setNameErr('');
          const g = gstin.replace(/\s/g, '');
          if (g && g.length !== 15) { setGstErr(`GSTIN has 15 characters. This one has ${g.length}.`); bad = true; } else setGstErr('');
          if (bad) return false;
          toast({ title: 'School details saved', body: 'Receipts and certificates use them from now on.' });
        }}>
        <Field label="School name" required id="sp-name" error={nameErr}><Input id="sp-name" value={name} onChange={(e) => setName(e.target.value)} error={!!nameErr} /></Field>
        <Field label="Address" required id="sp-addr"><Textarea id="sp-addr" value={SCHOOL_D.address} onChange={() => {}} rows={2} /></Field>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
          <Field label="School phone" required id="sp-ph"><Input id="sp-ph" defaultValue={SCHOOL_D.phone} inputMode="tel" /></Field>
          <Field label="Email" required id="sp-em"><Input id="sp-em" defaultValue={SCHOOL_D.email} type="email" /></Field>
          <Field label="Affiliation number" id="sp-aff"><Input id="sp-aff" defaultValue={SCHOOL_D.affiliation} /></Field>
          <Field label="UDISE code" id="sp-ud" hint="11 digits, from the UDISE+ portal"><Input id="sp-ud" defaultValue={SCHOOL_D.udise} inputMode="numeric" /></Field>
        </div>
        <Field label="GSTIN" id="sp-gst" error={gstErr} hint="Optional. Needed only when some fee heads are taxable. 15 characters."><Input id="sp-gst" value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} error={!!gstErr} className="font-mono" /></Field>
        <Field label="Website" id="sp-web" hint="Shown as text on documents"><Input id="sp-web" defaultValue={SCHOOL_D.web} /></Field>
      </FormSheet>

      {/* Board */}
      <Sheet open={sheet === 'board'} onClose={() => setSheet(null)} title="Choose the board" sub="Sets starting defaults for grades, terms and the report card"
        footer={<><Button variant="ghost" onClick={() => setSheet(null)}>Cancel</Button><Button variant="primary" disabled={pickBoard === board} onClick={() => { setBoard(pickBoard); setSheet(null); toast({ title: `Board changed to ${pickBoard}`, body: 'Defaults are offered in Academic and Exam Settings. Marks already entered stay as they are.', undo: () => setBoard(board) }); }}>Apply {pickBoard} defaults</Button></>}>
        <div className="flex flex-col gap-2">
          {Object.keys(BOARDS).map((b) => (
            <button key={b} onClick={() => setPickBoard(b)} aria-pressed={pickBoard === b}
              className={cx('flex items-start gap-3 p-3 rounded-2xl border text-left transition', pickBoard === b ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
              <span className={cx('w-5 h-5 mt-0.5 rounded-full border-2 grid place-items-center shrink-0', pickBoard === b ? 'border-brand' : 'border-line')}>{pickBoard === b && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
              <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{b}{b === board && <span className="text-ink3 font-normal"> · in use</span>}</span><span className="block text-[12.5px] text-ink3">{BOARDS[b]}</span></span>
            </button>
          ))}
          {pickBoard !== board && <Banner tone="warn" className="mt-1">{pickBoard}: {BOARDS[pickBoard]}. Apply?</Banner>}
        </div>
      </Sheet>

      {/* Campus */}
      <FormSheet open={!!campus} onClose={() => setCampus(null)} title={campus?.id === 'new' ? 'Add campus' : `Edit ${campus?.name || ''}`} submitLabel={campus?.id === 'new' ? 'Add campus' : 'Save campus'}
        onSubmit={() => toast({ title: campus?.id === 'new' ? 'Campus added' : `${campus?.name} saved`, body: 'Staff with access to it see it in the school switcher.' })}>
        <Field label="Campus name" required id="cp-name"><Input id="cp-name" defaultValue={campus?.name} placeholder="For example, Bachupally campus" /></Field>
        <Field label="Address" required id="cp-addr"><Input id="cp-addr" defaultValue={campus?.address} /></Field>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
          <Field label="Campus head" required id="cp-head"><Select id="cp-head" value={campus?.head || 'Lakshmi Rao'} onChange={() => {}} options={['Lakshmi Rao', 'Rekha Nair', 'Srinivas Murthy', 'Anita Sharma']} /></Field>
          <Field label="Phone" required id="cp-ph"><Input id="cp-ph" defaultValue={campus?.phone} inputMode="tel" placeholder="040 ..." /></Field>
        </div>
        <div className="rounded-xl border border-line divide-y divide-line/70">
          <ToggleRowLite title="Own fee amounts" sub="Fee Structure keeps a separate set for this campus" on={campus?.id === 'myp'} />
          <ToggleRowLite title="Own branding" sub="Its own logo and colour on documents" />
        </div>
      </FormSheet>

      {/* Upload document */}
      <FormSheet open={sheet === 'upload'} onClose={() => setSheet(null)} title="Upload school document" sub="We remind you 60 days before it expires" submitLabel="Upload"
        onSubmit={() => { setDocs((x) => [{ id: 'd' + (x.length + 1), name: 'Pollution control consent', type: 'NOC', ver: 1, issued: '9 Oct 2026', expires: '8 Oct 2028', status: 'To verify' }, ...x]); toast({ title: 'Document uploaded', body: 'Pollution control consent · reminder set for 9 Aug 2028' }); }}>
        <Field label="Document type" required id="up-type"><Select id="up-type" value="NOC" onChange={() => {}} options={['Registration', 'Affiliation', 'NOC', 'Fire safety', 'Other']} /></Field>
        <Field label="File" required>
          <button type="button" onClick={() => toast({ title: 'pollution-consent-2026.pdf picked', body: '412 KB', tone: 'info' })} className="h-24 rounded-xl border-2 border-dashed border-line hover:border-brand/50 hover:bg-brand/5 text-ink3 text-[14px] flex flex-col items-center justify-center gap-1">
            <I.Upload size={20} />Pick a PDF or photo
          </button>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Issue date" id="up-iss"><Input id="up-iss" placeholder="DD-MM-YYYY" defaultValue="09-10-2026" /></Field>
          <Field label="Expiry date" id="up-exp" hint="Needed for reminders"><Input id="up-exp" placeholder="DD-MM-YYYY" defaultValue="08-10-2028" /></Field>
        </div>
        <Field label="Who can see it" required id="up-who"><Select id="up-who" value="sa" onChange={() => {}} options={[{ value: 'sa', label: 'School Admin and Principal' }, { value: 'all', label: 'All office staff' }]} /></Field>
      </FormSheet>

      {/* Share link */}
      <Sheet open={!!share} onClose={() => setShare(null)} title={`Share ${share?.name || ''}`} sub="Anyone with the link can view it until it expires. Every opening is logged."
        footer={<><Button variant="ghost" onClick={() => setShare(null)}>Close</Button><Button variant="primary" icon={I.Copy} onClick={() => { setShare(null); toast({ title: 'Link copied', body: 'Works until 16 Oct 2026, 10:42 AM' }); }}>Copy link</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Link works for" id="sh-days"><Select id="sh-days" value="7" onChange={() => {}} options={[{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} /></Field>
          <div className="rounded-xl bg-sunken px-3.5 py-3 font-mono text-[12.5px] break-all">https://docs.schoolos.in/s/SPS-HYD-001/7Kq2Xw</div>
        </div>
      </Sheet>

      {/* Preview on documents */}
      <Sheet open={sheet === 'preview'} onClose={() => setSheet(null)} title="Logo and colour on documents" sub="Sample data · what parents receive" wide>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-sunken/60 p-3 flex justify-center"><ReceiptDoc variant="Classic" style={{ fontSize: 7.2 }} /></div>
          <div className="rounded-xl bg-sunken/60 p-3 flex justify-center"><BonafideDoc variant="Classic" style={{ fontSize: 7.2 }} /></div>
        </div>
      </Sheet>
    </div>
  );
}

// A switch row with its own state (used inside cards and sheets)
function ToggleRowLite({ title, sub, on: start = false }) {
  const [on, setOn] = useState(start);
  const toast = useToast();
  const canEdit = useCanEdit();
  return (
    <div className="flex items-center gap-3 py-3 px-3.5 first:pt-3">
      <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">{title}</b>{sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}</div>
      <Switch on={on} label={title} onChange={(v) => { if (!canEdit) return; setOn(v); toast({ title: `${title}: ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} />
    </div>
  );
}

/* =====================================================================
   2. Users & Permissions
   ===================================================================== */
const SCOPE = {
  principal: 'Whole school · both campuses', schooladmin: 'Whole school · both campuses', accountant: 'Whole school', teacher: 'Own classes: 6 A, 6 B, 7 A, 7 B',
  classteacher: 'Section 7 B and own classes', receptionist: 'Kukatpally campus', transport: 'All routes', librarian: 'Whole school', warden: 'Boys’ hostel',
  storekeeper: 'Whole school', vp: 'Whole school', academichead: 'Whole school', hr: 'Whole school', officestaff: 'Kukatpally campus',
  examincharge: 'Classes 6–10', admissioncounsellor: 'Whole school', counsellor: 'Own cases', gatesecurity: 'Main gate',
};
const LAST_IN = {
  principal: 'Today, 10:31 AM', schooladmin: 'Today, 10:40 AM', accountant: 'Today, 8:02 AM', teacher: 'Today, 8:35 AM', classteacher: 'Today, 8:52 AM',
  receptionist: 'Today, 8:20 AM', transport: 'Today, 6:45 AM', librarian: 'Today, 9:05 AM', warden: 'Today, 6:10 AM', storekeeper: 'Yesterday, 4:50 PM',
  vp: 'Today, 8:15 AM', academichead: 'Today, 9:40 AM', hr: 'Today, 9:02 AM', officestaff: 'Today, 8:48 AM', examincharge: 'Today, 10:05 AM',
  admissioncounsellor: 'Today, 9:30 AM', counsellor: 'Yesterday, 3:15 PM', gatesecurity: 'Today, 6:55 AM',
};
const CODES = { 'Lakshmi Rao': 'SPS-A-001', 'Srinivas Murthy': 'SPS-T-002', 'Meena Pillai': 'SPS-T-004', 'Shalini Verma': 'SPS-A-008', 'Naveen Kumar': 'SPS-A-017', 'Prakash Joshi': 'SPS-T-012', 'Divya Menon': 'SPS-A-019', 'Sana Ali': 'SPS-A-021', 'Bhaskar Rao': 'SPS-S-030' };
const codeOf = (n) => STAFF.find((s) => s.name === n)?.code || CODES[n] || 'SPS-T-040';
const TWO_ON = ['principal', 'schooladmin', 'accountant', 'vp', 'hr'];
const BASE_USERS = [
  ...ROLES.filter((r) => r.id !== 'student').map((r) => ({
    id: 'U-' + r.id, name: r.person.name, phone: r.person.phone, email: r.person.email, roles: r.id === 'classteacher' ? ['Class Teacher', 'Teacher'] : [r.label.replace(' / Front Office', '')],
    roleId: r.id, scope: SCOPE[r.id], status: 'Active', twoStep: TWO_ON.includes(r.id), last: LAST_IN[r.id], belongs: `Staff · ${codeOf(r.person.name)}`,
    devices: ['principal', 'schooladmin', 'accountant'].includes(r.id) ? 2 : 1,
  })),
  ...STAFF.filter((s) => s.dept === 'Teaching' && !['Ravi Teja', 'Imran Shaikh'].includes(s.name)).map((s, i) => ({
    id: 'U-' + s.id, name: s.name, phone: s.phone, email: '', roles: s.classTeacher ? ['Class Teacher', 'Teacher'] : ['Teacher'], roleId: s.classTeacher ? 'classteacher' : 'teacher',
    scope: s.classTeacher ? `Section ${s.classTeacher} and own classes` : 'Own classes', status: 'Active', twoStep: false,
    last: ['Today, 8:41 AM', 'Today, 8:30 AM', 'Today, 7:58 AM', 'Yesterday, 5:20 PM', 'Today, 8:47 AM', 'Today, 9:12 AM', 'Today, 8:39 AM', 'Today, 8:05 AM', 'Today, 8:26 AM', '7 Oct, 6:02 PM'][i % 10],
    belongs: `Staff · ${s.code}`, devices: 1,
  })),
  { id: 'U-drv1', name: 'Mallesh Kumar', phone: '99120 33671', email: '', roles: ['Driver'], roleId: 'driver', scope: 'Bus 4 · Route 4 Miyapur', status: 'Active', twoStep: false, last: 'Today, 6:41 AM', belongs: 'Driver record · on staff SPS-S-021', devices: 1 },
  { id: 'U-drv2', name: 'Narsimha', phone: '93478 20115', email: '', roles: ['Driver'], roleId: 'driver', scope: 'Bus 1 · Route 1', status: 'Invited', twoStep: false, last: 'Never · invited 8 Oct', belongs: 'Driver record · hired, not on staff', devices: 0 },
  { id: 'U-new1', name: 'Harika Pulla', phone: '90102 77418', email: 'harika.p@sunriseps.in', roles: ['Teacher'], roleId: 'teacher', scope: 'Own classes: 1 A, 1 B', status: 'Invited', twoStep: false, last: 'Never · invited 7 Oct', belongs: 'Staff · SPS-T-041', devices: 0 },
  { id: 'U-old1', name: 'Ravi Kumar', phone: '98851 04432', email: '', roles: ['Teacher'], roleId: 'teacher', scope: 'Own classes', status: 'Disabled', twoStep: false, last: '29 Sep, 2:14 PM', belongs: 'Staff · SPS-T-016 · left 30 Sep', devices: 0 },
];

function UsersPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const { role: me } = useRole();
  const [view, setView] = useState('users');
  const [users, setUsers] = useState(BASE_USERS);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [invite, setInvite] = useState(false);
  const [open, setOpen] = useState(null);
  const [disable, setDisable] = useState(null);
  const [reset2, setReset2] = useState(null);
  const [bulkDisable, setBulkDisable] = useState(false);

  const counts = useMemo(() => ({
    all: users.length, Active: users.filter((u) => u.status === 'Active').length, Invited: users.filter((u) => u.status === 'Invited').length,
    Disabled: users.filter((u) => u.status === 'Disabled').length, off: users.filter((u) => !u.twoStep && u.status === 'Active').length,
  }), [users]);
  const rows = users.filter((u) => (f === 'all' || (f === 'off' ? !u.twoStep && u.status === 'Active' : u.status === f)) &&
    (!q || u.name.toLowerCase().includes(q.toLowerCase()) || u.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) || u.roles.join(' ').toLowerCase().includes(q.toLowerCase())));
  const setUser = (id, patch) => setUsers((x) => x.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const isMe = (u) => u.name === me.person.name;
  const askDisable = (u) => {
    if (isMe(u)) { toast({ title: 'You cannot disable your own login', body: 'Ask another School Admin or the Principal.', tone: 'bad' }); return; }
    if (u.roleId === 'schooladmin') { toast({ title: 'At least one School Admin must remain', body: 'Add another admin first, then disable this one.', tone: 'bad' }); return; }
    setDisable(u);
  };
  const askReset2 = (u) => {
    if (isMe(u)) { toast({ title: 'You cannot reset your own two-step login', body: 'Another School Admin or the Principal does it, and it is logged.', tone: 'bad' }); return; }
    setReset2(u);
  };
  const actions = (u) => [
    [I.UserCog, 'Change roles and scope', () => setOpen(u)],
    ...(u.status === 'Invited' ? [[I.Send, 'Send a new invite', () => toast({ title: `New invite sent to ${u.name}`, body: `WhatsApp and SMS to ${u.phone}. The old link stops working.` })]] : []),
    ...(u.status === 'Active' ? [[I.KeyRound, 'Reset password', () => toast({ title: `Reset link sent to ${u.name}`, body: `SMS to ${u.phone}. The old password stops working once they set a new one.` })],
      [I.Smartphone, 'Reset two-step login', () => askReset2(u)],
      [I.LogOut, 'Sign out everywhere', () => toast({ title: `${u.name} signed out on ${u.devices || 1} device${u.devices > 1 ? 's' : ''}`, body: 'They can sign in again with their password.' })]] : []),
    u.status === 'Disabled' ? [I.UserCheck, 'Enable login', () => { setUser(u.id, { status: 'Active' }); toast({ title: `${u.name} can sign in again`, undo: () => setUser(u.id, { status: 'Disabled' }) }); }]
      : [I.UserX, 'Disable login', () => askDisable(u), 'bad'],
  ];

  return (
    <div>
      <ModuleHead sub="88 logins · 84 staff and 2 drivers · only the School Admin and Principal change roles"
        actions={<Button variant="primary" icon={I.UserPlus} onClick={() => setInvite(true)}>Invite a user</Button>} />
      <div className="-mx-4 px-4 @md:mx-0 @md:px-0 overflow-x-auto no-scrollbar mb-4">
        <Segmented value={view} onChange={setView} options={[{ value: 'users', label: 'Users' }, { value: 'roles', label: 'Roles' }, { value: 'matrix', label: 'Permissions' }, { value: 'rules', label: 'Sign-in rules' }]} />
      </div>

      {view === 'users' && (
        <div className="flex flex-col gap-5 @lg:gap-6">
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="user-search" value={q} onChange={setQ} placeholder="Name, mobile number or role" />
              <ExportButton what={`${rows.length} users`} />
            </Toolbar>
            <div className="px-3 pt-3 pb-1">
              <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: counts.all }, { value: 'Active', label: 'Active', count: counts.Active }, { value: 'Invited', label: 'Invited', count: counts.Invited }, { value: 'Disabled', label: 'Disabled', count: counts.Disabled }, { value: 'off', label: 'Two-step off', count: counts.off }]} />
            </div>
            <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" icon={I.Smartphone} onClick={() => { setUsers((x) => x.map((u) => (sel.has(u.id) ? { ...u, twoStep: true } : u))); toast({ title: `Two-step login required for ${sel.size} people`, body: 'They set it up at their next sign-in.' }); setSel(new Set()); }}>Require two-step login</Button>
              <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { toast({ title: `Invites sent again to ${[...sel].filter((id) => users.find((u) => u.id === id)?.status === 'Invited').length} invited people`, body: 'Others in the selection already have a login.' }); setSel(new Set()); }}>Send invite again</Button>
              <Button size="sm" variant="dangerSoft" icon={I.UserX} onClick={() => setBulkDisable(true)}>Disable</Button>
            </BulkBar>
            <DataList rows={rows} select={canEdit ? [sel, setSel] : null} onRow={setOpen} minWidth={980}
              footer={`Showing ${rows.length} of 88 logins`}
              columns={[
                { key: 'name', label: 'Name', render: (u) => <span className="flex items-center gap-3"><Avatar name={u.name} size={34} /><span className="min-w-0"><span className="block font-semibold whitespace-nowrap">{u.name}{isMe(u) && <span className="text-ink3 font-normal"> (you)</span>}</span><span className="block text-[12.5px] text-ink3">{u.belongs}</span></span></span> },
                { key: 'phone', label: 'Username (mobile)', nowrap: true, render: (u) => <span className="tnum">{u.phone}</span> },
                { key: 'roles', label: 'Roles', render: (u) => <span className="flex gap-1 flex-wrap">{u.roles.map((r) => <Pill key={r} tone="brand" className="!h-5 !text-[11px]">{r}</Pill>)}</span> },
                { key: 'scope', label: 'Scope', render: (u) => <span className="text-[13px] text-ink2">{u.scope}</span> },
                { key: 'status', label: 'Status', render: (u) => <Pill tone={STATUS_TONE[u.status]} dot>{u.status}</Pill> },
                { key: 'two', label: 'Two-step', render: (u) => (u.twoStep ? <Pill tone="ok">On</Pill> : <span className="text-ink3 text-[13px]">Off</span>) },
                { key: 'last', label: 'Last sign-in', nowrap: true, render: (u) => <span className="text-[13px] text-ink2">{u.last}</span> },
                { key: 'act', label: '', render: (u) => (canEdit ? <MoreMenu size="sm" items={actions(u)} /> : null) },
              ]}
              mobile={(u) => ({ avatar: u.name, title: u.name, sub: `${u.roles.join(', ')} · ${u.phone}`, pills: [<Pill key="s" tone={STATUS_TONE[u.status]} className="!h-5 !text-[11px]" dot>{u.status}</Pill>, u.twoStep ? <Pill key="t" tone="ok" className="!h-5 !text-[11px]">Two-step</Pill> : null], right: <span className="text-[12px] text-ink3 block max-w-[92px]">{u.last}</span> })} />
          </Card>
          <Banner tone="info" title="The mobile number is the username.">New people set their own password from the invite link. Nobody else ever sees it. Disabling a login signs the person out on every device at once.</Banner>
        </div>
      )}

      {view === 'roles' && <RolesView users={users} canEdit={canEdit} onMatrix={() => setView('matrix')} />}
      {view === 'matrix' && <MatrixView canEdit={canEdit} />}
      {view === 'rules' && <RulesView canEdit={canEdit} />}

      <InviteSheet open={invite} onClose={() => setInvite(false)} onAdd={(u) => setUsers((x) => [u, ...x])} />
      <UserSheet u={open} onClose={() => setOpen(null)} canEdit={canEdit} isMe={open && isMe(open)} actions={open ? actions(open) : []}
        onSave={(patch) => { setUser(open.id, patch); toast({ title: `Roles changed for ${open.name}`, body: 'Saved. Every School Admin was alerted, and they are signed out to pick up the change.' }); setOpen(null); }} />
      <ConfirmSheet open={!!disable} onClose={() => setDisable(null)} danger title={`Disable ${disable?.name || ''}?`}
        sub={`${disable?.name} is signed out on ${disable?.devices || 'every'} device${disable?.devices === 1 ? '' : 's'} at once and cannot sign in until enabled. Their records and history stay.`}
        confirmLabel="Disable and sign out" onConfirm={() => { const u = disable; setUser(u.id, { status: 'Disabled' }); toast({ title: `${u.name} is disabled and signed out on ${u.devices || 1} device${u.devices > 1 ? 's' : ''}`, undo: () => setUser(u.id, { status: 'Active' }) }); }} />
      <ConfirmSheet open={bulkDisable} onClose={() => setBulkDisable(false)} danger title={`Disable ${sel.size} logins?`}
        sub="Each person is signed out everywhere at once. Their records and history stay. School Admins in the selection are skipped."
        confirmLabel={`Disable ${sel.size} logins`} onConfirm={() => { const ids = new Set(sel); setUsers((x) => x.map((u) => (ids.has(u.id) && u.roleId !== 'schooladmin' && !isMe(u) ? { ...u, status: 'Disabled' } : u))); setSel(new Set()); toast({ title: `${ids.size} logins disabled`, body: 'Signed out on every device.' }); }} />
      <Reset2Sheet u={reset2} onClose={() => setReset2(null)} />
    </div>
  );
}

function InviteSheet({ open, onClose, onAdd }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('teacher');
  const [by, setBy] = useState({ WhatsApp: true, SMS: true, Email: false });
  const [err, setErr] = useState({});
  const close = () => { setName(''); setPhone(''); setErr({}); onClose(); };
  return (
    <FormSheet open={open} onClose={close} title="Invite a user" sub="They get a link to set their own password. The link works for 3 days." submitLabel="Send invite" busyLabel="Sending…"
      onSubmit={() => {
        const e = {};
        if (!name.trim()) e.name = 'Full name is needed';
        if (phone.replace(/\D/g, '').length !== 10) e.phone = 'Enter a 10-digit mobile number';
        setErr(e);
        if (Object.keys(e).length) return false;
        const ch = Object.keys(by).filter((k) => by[k]).join(' and ');
        onAdd({ id: 'U-' + Date.now(), name: name.trim(), phone, email: '', roles: [ROLE[role]?.label.replace(' / Front Office', '') || 'Teacher'], roleId: role, scope: SCOPE[role] || 'Own records', status: 'Invited', twoStep: TWO_ON.includes(role), last: 'Never · invited today', belongs: 'Staff · new record', devices: 0 });
        toast({ title: `Invite sent to ${name.trim()}`, body: `${ch} to ${phone}. Username: ${phone}` });
        setName(''); setPhone('');
      }}>
      <Field label="Full name" required id="inv-name" error={err.name}><Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} error={!!err.name} placeholder="For example, Harika Pulla" /></Field>
      <Field label="Mobile number" required id="inv-ph" error={err.phone} hint="This becomes their username">
        <div className="flex gap-2">
          <span className="h-11 px-3 rounded-xl bg-sunken border border-line grid place-items-center text-[15px] text-ink2 shrink-0">+91</span>
          <Input id="inv-ph" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98480 22145" error={!!err.phone} />
        </div>
      </Field>
      <Field label="Role" required id="inv-role" hint="You can add more roles after they join">
        <Select id="inv-role" value={role} onChange={setRole} options={ROLES.filter((r) => r.id !== 'student').map((r) => ({ value: r.id, label: r.label }))} />
      </Field>
      <Field label="Send the invite by" required>
        <div className="flex gap-4 flex-wrap">
          {Object.keys(by).map((k) => (
            <label key={k} className="flex items-center gap-2 text-[14px] cursor-pointer"><Checkbox checked={by[k]} onChange={(v) => setBy((b) => ({ ...b, [k]: v }))} label={k} />{k}</label>
          ))}
        </div>
      </Field>
      <p className="text-[12.5px] text-ink3">Staff usually get their login from Add Staff, and drivers from Transport. Use this for anyone else.</p>
    </FormSheet>
  );
}

function UserSheet({ u, onClose, canEdit, isMe, actions, onSave }) {
  const [roles, setRoles] = useState([]);
  const [scope, setScope] = useState('');
  const [editing, setEditing] = useState(false);
  React.useEffect(() => { if (u) { setRoles(u.roles); setScope(u.scope); setEditing(false); } }, [u]);
  if (!u) return null;
  const multi = u.roleId === 'principal' || u.roleId === 'schooladmin';
  const roleNames = [...ROLES.filter((r) => r.id !== 'student').map((r) => r.label.replace(' / Front Office', '')), 'Driver'];
  return (
    <Sheet open={!!u} onClose={onClose} title={u.name} sub={`${u.belongs} · username ${u.phone}`} wide
      footer={editing ? <><Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!roles.length} onClick={() => onSave({ roles, scope })}>Save roles</Button></>
        : canEdit ? <><MoreMenu items={actions.filter((a) => a[1] !== 'Change roles and scope')} /><Button variant="primary" icon={I.UserCog} onClick={() => setEditing(true)}>Change roles and scope</Button></> : null}>
      {editing ? (
        <div className="flex flex-col gap-4">
          <Field label="Roles" hint="A person can have more than one role. The menu shows what all their roles allow.">
            <div className="grid grid-cols-1 @sm:grid-cols-2 gap-1.5">
              {roleNames.map((r) => (
                <label key={r} className="flex items-center gap-2.5 h-10 px-3 rounded-xl border border-line text-[14px] cursor-pointer hover:bg-sunken">
                  <Checkbox checked={roles.includes(r)} label={r} onChange={(v) => setRoles((x) => (v ? [...x, r] : x.filter((y) => y !== r)))} />{r}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Scope" id="us-scope"><Select id="us-scope" value={scope} onChange={setScope} options={[...new Set([scope, 'Whole school', 'Kukatpally campus', 'Miyapur campus', 'Chosen classes', 'Own records'])]} /></Field>
          {!roles.length && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><I.CircleAlert size={14} />Pick at least one role</p>}
          <Banner tone="warn">Every School Admin gets an alert saying who changed what for {u.name}. It cannot be switched off.</Banner>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={u.name} size={52} />
            <div className="flex gap-1.5 flex-wrap">
              <Pill tone={STATUS_TONE[u.status]} dot>{u.status}</Pill>
              {u.roles.map((r) => <Pill key={r} tone="brand">{r}</Pill>)}
              {isMe && <Pill tone="neutral">This is you</Pill>}
            </div>
          </div>
          <div className="-mx-5"><DL rows={[
            ['Username', <span className="tnum">{u.phone}</span>], ['Email', u.email || 'Not given'], ['Scope', u.scope], ['Two-step login', u.twoStep ? 'On · code to ' + u.phone : 'Off'],
            ['Last sign-in', u.last], ['Signed in on', u.devices ? `${u.devices} device${u.devices > 1 ? 's' : ''}` : 'No devices'],
          ]} /></div>
          <div>
            <p className="eyebrow text-ink3 mb-2">School Access</p>
            <ul className="rounded-xl border border-line divide-y divide-line/70 text-[13.5px]">
              <li className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span><b className="font-semibold">Kukatpally</b><span className="text-ink3"> · {u.roles.join(', ')}</span></span><span className="text-ink3 text-right">{u.scope.replace(' · both campuses', '')}</span></li>
              {multi && <li className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span><b className="font-semibold">Miyapur campus</b><span className="text-ink3"> · {u.roles.join(', ')}</span></span><span className="text-ink3">Whole campus</span></li>}
            </ul>
            <p className="text-[12.5px] text-ink3 mt-1.5">{multi ? 'One login works in both campuses. The school switcher shows them.' : 'Works in this campus only.'}</p>
          </div>
          {u.roleId === 'accountant' && <Banner tone="brand" icon={I.Plus}>Exception: may approve concessions up to {inr(1000)} (more than the Accountant role).</Banner>}
          {u.roleId === 'officestaff' && <Banner tone="brand" icon={I.Minus}>Exception: Kukatpally campus only (narrower than Office Staff).</Banner>}
        </div>
      )}
    </Sheet>
  );
}

function Reset2Sheet({ u, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState('Lost phone');
  const [check, setCheck] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open={!!u} onClose={() => { setErr(''); setCheck(''); onClose(); }} title={`Reset two-step login for ${u?.name || ''}`} sub="They set it up again at their next sign-in. The reset is logged with your name and reason." submitLabel="Reset two-step login"
      onSubmit={() => { if (!check.trim()) { setErr('Say how you confirmed it was really them'); return false; } toast({ title: `Two-step login reset for ${u.name}`, body: 'They will set it up at their next sign-in. Logged in the audit log.' }); setCheck(''); }}>
      <Field label="Reason" required id="r2-reason"><Select id="r2-reason" value={reason} onChange={setReason} options={['Lost phone', 'New phone', 'Number changed', 'Other']} /></Field>
      <Field label="Check done" required id="r2-check" error={err} hint="For example, in person at the office"><Input id="r2-check" value={check} onChange={(e) => setCheck(e.target.value)} error={!!err} placeholder="How was the person confirmed?" /></Field>
    </FormSheet>
  );
}

const ROLE_DESC = {
  principal: 'Everything. Dashboard, Approvals and Reports first.', schooladmin: 'Everything, including Settings. Sets up the school.',
  accountant: 'Fees, Finance, Salary and money reports.', teacher: 'Own classes: attendance, homework, marks, time table.',
  classteacher: 'A teacher, plus their whole section.', receptionist: 'Front Office, new enquiries, pickups.',
  transport: 'Transport only, plus messages to a route.', librarian: 'Library, with a student and staff search.',
  warden: 'Hostel: rooms, roll call, outings, mess.', storekeeper: 'Inventory: stock, issues, purchases, assets.',
  vp: 'Runs the school day with the Principal.', academichead: 'Classes, time table, syllabus, exams.', hr: 'Staff records, leave, recruitment, exits.',
  officestaff: 'Office work: records, certificates, leave.', examincharge: 'Datesheets, admit cards, results.', admissioncounsellor: 'Enquiries to admission decisions.',
  counsellor: 'Counselling cases. Only role that sees notes.', gatesecurity: 'Visitor and gate entries.', student: 'Own homework, quizzes and classes.',
};
const ROLE_ICON = {
  principal: 'Award', schooladmin: 'ShieldCheck', accountant: 'IndianRupee', teacher: 'BookOpen', classteacher: 'GraduationCap', receptionist: 'DoorOpen',
  transport: 'Bus', librarian: 'Library', warden: 'BedDouble', storekeeper: 'Boxes', vp: 'UserCog', academichead: 'BookOpenCheck', hr: 'Users',
  officestaff: 'FileText', examincharge: 'ClipboardCheck', admissioncounsellor: 'UserPlus', counsellor: 'HeartHandshake', gatesecurity: 'IdCard', student: 'NotebookPen', driver: 'Bus',
};

function RolesView({ users, canEdit, onMatrix }) {
  const toast = useToast();
  const { go } = useNav();
  const [tmpl, setTmpl] = useState({ vp: true, academichead: true, hr: true, officestaff: true, examincharge: true, admissioncounsellor: true, counsellor: true, gatesecurity: true, driver: true, student: false });
  const [role, setRole] = useState(null);
  const [copy, setCopy] = useState(false);
  const count = (label) => users.filter((u) => u.roles.includes(label.replace(' / Front Office', '')) && u.status !== 'Disabled').length;
  const extra = { teacher: 46, classteacher: 33 };
  const people = (r) => (extra[r.id] ?? count(r.label));
  const flip = (id, label, v) => {
    if (!canEdit) return;
    if (!v && id !== 'student' && id !== 'driver' && count(label) > 0) { toast({ title: `${count(label)} person has the ${label} role`, body: 'Give them another role first, then switch the template off.', tone: 'bad' }); return; }
    setTmpl((t) => ({ ...t, [id]: v }));
    toast({ title: `${label} role ${v ? 'switched on' : 'switched off'}`, body: v ? 'You can now give it to people, and change it like any other role.' : 'It is hidden from the role list.', undo: () => setTmpl((t) => ({ ...t, [id]: !v })) });
  };
  const ready = ROLES.filter((r) => r.group === 'ready');
  const templates = [...ROLES.filter((r) => r.group === 'template' && r.id !== 'student'), { id: 'driver', label: 'Driver' }, ROLE.student];
  const TDESC = { ...ROLE_DESC, driver: 'Android driver app: trips, stops, boarding.' };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Card>
          <CardHead title="Ready roles" sub="The ten roles every school starts with" icon={I.ShieldCheck} action={<Pill tone="neutral">10</Pill>} />
          <ul className="px-2 pb-2">
            {ready.map((r) => (
              <li key={r.id}>
                <button onClick={() => setRole(r)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70 transition">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-brand/10 text-brand"><Icon name={ROLE_ICON[r.id]} size={19} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{r.label}</span><span className="block text-[12.5px] text-ink3 truncate">{ROLE_DESC[r.id]}</span></span>
                  <span className="text-[13px] text-ink2 tnum shrink-0">{people(r)} {people(r) === 1 ? 'person' : 'people'}</span>
                  <I.ChevronRight size={17} className="text-ink3 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Col>
          <Card>
            <CardHead title="Role templates" sub={`Each stays off until you switch it on · ${Object.values(tmpl).filter(Boolean).length} of 10 on here`} icon={I.ToggleRight} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {templates.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', tmpl[r.id] ? 'bg-brand/10 text-brand' : 'bg-sunken text-ink3')}><Icon name={ROLE_ICON[r.id]} size={17} /></span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => (ROLE[r.id] && tmpl[r.id] ? setRole(ROLE[r.id]) : null)}>
                    <span className="block font-semibold text-[14px] truncate">{r.label}{tmpl[r.id] && r.id !== 'student' && <span className="text-ink3 font-normal"> · {r.id === 'driver' ? 2 : count(r.label)} {(r.id === 'driver' ? 2 : count(r.label)) === 1 ? 'person' : 'people'}</span>}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{r.id === 'student' ? 'Only for schools that give students logins' : TDESC[r.id]}</span>
                  </button>
                  <Switch on={!!tmpl[r.id]} label={`${r.label} role`} onChange={(v) => flip(r.id, r.label, v)} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Your own roles" sub="Made by copying a role and changing it" icon={I.Shapes}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Copy} onClick={() => setCopy(true)}>New role</Button>} />
            <ul className="px-2 pb-2">
              {[['Sports Coordinator', 'Copied from Teacher · adds Events in full', 2], ['School Nurse', 'Copied from Counsellor · health notes only', 1]].map(([n, s, c]) => (
                <li key={n} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><I.Shapes size={18} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{n}</span><span className="block text-[12.5px] text-ink3 truncate">{s}</span></span>
                  <span className="text-[13px] text-ink2 tnum shrink-0">{c} {c === 1 ? 'person' : 'people'}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="User requests" sub="Staff who asked to join from the staff link" icon={I.UserPlus} action={<Pill tone="info">2</Pill>} />
            <ul className="px-2 pb-2">
              {[['Srikanth M.', 'Lab assistant · asked 7 Oct'], ['Bhavani K.', 'Ayah, Pre-primary · asked 8 Oct']].map(([n, s]) => (
                <li key={n} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                  <Avatar name={n} size={38} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{n}</span><span className="block text-[12.5px] text-ink3 truncate">{s}</span></span>
                  <Button size="sm" variant="secondary" onClick={() => go('approvals')}>Review</Button>
                </li>
              ))}
            </ul>
          </Card>
        </Col>
      </div>
      <RoleSheet role={role} onClose={() => setRole(null)} onMatrix={() => { setRole(null); onMatrix(); }} onCopy={() => { setRole(null); setCopy(true); }} canEdit={canEdit} />
      <FormSheet open={copy} onClose={() => setCopy(false)} title="New role" sub="Start from a role that is close, then change what differs" submitLabel="Create role"
        onSubmit={() => toast({ title: 'Role created: Transport Assistant', body: 'Copied from Transport In-charge. Change its permissions in the Permissions tab.' })}>
        <Field label="Role name" required id="nr-name"><Input id="nr-name" defaultValue="Transport Assistant" /></Field>
        <Field label="Copy from" required id="nr-from"><Select id="nr-from" value="transport" onChange={() => {}} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} /></Field>
        <Field label="Task access" id="nr-task"><Segmented value="own" onChange={() => {}} options={[{ value: 'own', label: 'Own tasks only' }, { value: 'full', label: 'Full task manager' }]} /></Field>
      </FormSheet>
    </div>
  );
}

const MARK = { full: ['Full', 'bg-brand/12 text-brand'], view: ['View', 'bg-info/10 text-info'], own: ['Own', 'bg-ok/10 text-ok'], none: ['–', 'text-ink3'] };
const MARK_WORDS = { full: 'see and do everything', view: 'see, not change', own: 'only their own classes or records', none: 'not in their menu' };
const SENSITIVE_BY = {
  principal: ['Aadhaar', 'Salary', 'Bank accounts', 'Counselling notes'], schooladmin: ['Aadhaar', 'Salary', 'Bank accounts'], accountant: ['Salary', 'Bank accounts'],
  hr: ['Aadhaar (staff)', 'Salary'], officestaff: ['Aadhaar (students)'], counsellor: ['Counselling notes'],
};

function RoleSheet({ role, onClose, onMatrix, onCopy, canEdit }) {
  if (!role) return null;
  const mods = Object.keys(MODULES);
  const has = mods.filter((m) => role.access[m]);
  return (
    <Sheet open={!!role} onClose={onClose} title={role.label} sub={`${has.length} of ${mods.length} modules · ${ROLE_DESC[role.id]}`} wide
      footer={canEdit ? <><Button variant="ghost" icon={I.Copy} onClick={onCopy}>Copy to a new role</Button><Button variant="primary" icon={I.Grid3x3} onClick={onMatrix}>Change permissions</Button></> : null}>
      <div className="flex flex-col gap-4">
        <ul className="rounded-xl border border-line divide-y divide-line/70">
          {has.map((m) => {
            const a = role.access[m];
            return (
              <li key={m} className="flex items-center gap-3 px-3.5 py-2.5">
                <Icon name={modIcon(m)} size={17} className="text-ink3 shrink-0" />
                <span className="min-w-0 flex-1 text-[14px]"><b className="font-semibold">{modLabel(m)}</b><span className="block text-[12.5px] text-ink3">{MARK_WORDS[a]}</span></span>
                <span className={cx('inline-flex items-center justify-center w-14 h-7 rounded-md text-[11.5px] font-bold', MARK[a][1])}>{MARK[a][0]}</span>
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3 text-[13.5px]">
          <div className="rounded-xl bg-sunken/70 p-3"><p className="eyebrow text-ink3 mb-1">Sensitive details</p>{(SENSITIVE_BY[role.id] || ['None']).join(', ')}</div>
          <div className="rounded-xl bg-sunken/70 p-3"><p className="eyebrow text-ink3 mb-1">Can sign in on</p>{role.id === 'gatesecurity' ? 'Mobile only' : 'Web and mobile'}</div>
          <div className="rounded-xl bg-sunken/70 p-3"><p className="eyebrow text-ink3 mb-1">Approves</p>{role.approves ? 'As set in Forms & Approvals' : 'Nothing'}</div>
        </div>
        <p className="text-[12.5px] text-ink3">Every permission is checked by the software for each action, not only hidden from the menu. “Delete” always means archive or cancel with a reason.</p>
      </div>
    </Sheet>
  );
}

function MatrixView({ canEdit }) {
  const toast = useToast();
  const [which, setWhich] = useState('ready');
  const [acc, setAcc] = useState(() => Object.fromEntries(ROLES.map((r) => [r.id, { ...r.access }])));
  const [cell, setCell] = useState(null);
  const [pick, setPick] = useState('none');
  const roles = ROLES.filter((r) => which === 'all' || (which === 'ready' ? r.group === 'ready' : r.group === 'template'));
  const mods = Object.keys(MODULES);
  const open = (r, m) => { if (!canEdit) return; setCell({ r, m }); setPick(acc[r.id][m] || 'none'); };
  const locked = cell && (cell.r.id === 'principal' || cell.r.id === 'schooladmin') && cell.m === 'settings';
  const before = cell ? acc[cell.r.id][cell.m] || 'none' : 'none';
  const save = () => {
    const { r, m } = cell;
    const prev = before;
    setAcc((x) => ({ ...x, [r.id]: { ...x[r.id], [m]: pick === 'none' ? undefined : pick } }));
    setCell(null);
    toast({ title: `${r.label}: ${modLabel(m)} is now ${MARK[pick][0] === '–' ? 'off' : MARK[pick][0]}`, body: 'Saved. Every School Admin was alerted.', undo: () => setAcc((x) => ({ ...x, [r.id]: { ...x[r.id], [m]: prev === 'none' ? undefined : prev } })) });
  };
  const ACTS = { full: ['View', 'Create', 'Edit', 'Archive', 'Approve', 'Export', 'Print'], view: ['View', 'Export', 'Print'], own: ['View', 'Create', 'Edit', 'Print'], none: [] };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <Card className="overflow-hidden">
        <CardHead title="What each role can do" sub="Modules down the side, roles across. Tap a box to change it." icon={I.Grid3x3} />
        <div className="px-5 pb-4 flex flex-col @lg:flex-row @lg:items-center gap-3 justify-between">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
            <Segmented size="sm" value={which} onChange={setWhich} options={[{ value: 'ready', label: 'Ready roles (10)' }, { value: 'template', label: 'Templates (9)' }, { value: 'all', label: 'All' }]} />
          </div>
          <div className="flex gap-3 text-[12px] text-ink2 flex-wrap">
            {['full', 'view', 'own', 'none'].map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cx('inline-grid place-items-center w-9 h-5 rounded text-[10.5px] font-bold', MARK[k][1], k === 'none' && 'bg-sunken')}>{MARK[k][0]}</span>{{ full: 'Full', view: 'View only', own: 'Only their own', none: 'Not in menu' }[k]}</span>)}
          </div>
        </div>
        <div className="overflow-x-auto scroll-thin border-t border-line">
          <table className="text-[13px] min-w-full">
            <thead>
              <tr className="border-b border-line text-ink3">
                <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[200px]">Module</th>
                {roles.map((r) => <th key={r.id} className="font-semibold px-1.5 py-2.5 text-center align-bottom"><span className="block w-[72px] mx-auto leading-tight text-[11.5px]">{ROLE_SHORT[r.id]}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {mods.map((m) => (
                <tr key={m} className="border-b border-line/60 last:border-0 hover:bg-sunken/40">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-1.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2 font-medium"><Icon name={modIcon(m)} size={15} className="text-ink3" />{modLabel(m)}</span>
                    {MODULES[m].optional && <span className="text-[11px] text-ink3 ml-1.5">optional</span>}
                  </td>
                  {roles.map((r) => {
                    const a = acc[r.id][m] || 'none';
                    return (
                      <td key={r.id} className="px-1.5 py-1.5 text-center">
                        <button onClick={() => open(r, m)} aria-label={`${r.label}, ${modLabel(m)}: ${MARK[a][0]}`} disabled={!canEdit}
                          className={cx('inline-flex items-center justify-center w-14 h-7 rounded-md text-[11.5px] font-bold transition', MARK[a][1], canEdit && 'hover:ring-2 hover:ring-brand/30')}>{MARK[a][0]}</button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Card>
          <CardHead title="Sensitive details" sub="Hidden on screen, in exports, search and AI answers from everyone else" icon={I.EyeOff} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {[['Aadhaar and other ID numbers', 'Restricted', 'Principal, School Admin, Office Staff (students), HR (staff)'], ['Salary and bank accounts', 'Restricted', 'Principal, School Admin, Accountant, HR'],
              ['Private student notes', 'Restricted', 'Principal, School Admin, the student’s class teacher'], ['Counselling notes', 'Highly restricted', 'Counsellor and Principal only']].map(([f, lvl, who]) => (
              <li key={f} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3"><b className="font-semibold text-[14px]">{f}</b><Pill tone={lvl === 'Highly restricted' ? 'bad' : 'warn'} className="!h-5 !text-[11px]">{lvl}</Pill></div>
                <p className="text-[12.5px] text-ink3 mt-0.5">Seen by: {who}. Everyone else sees XXXX XXXX 4821.</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHead title="Where people can sign in" sub="Limit a role to the web, the phone app or the API" icon={I.MonitorSmartphone} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {[['Most roles', 'Web and phone app'], ['Gate Security', 'Phone app only (gate tablet)'], ['Driver', 'Android driver app only'], ['API keys', 'None issued']].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]"><b className="font-semibold">{k}</b><span className="text-ink2 text-right">{v}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      <Sheet open={!!cell} onClose={() => setCell(null)} title={cell ? `${cell.r.label} · ${modLabel(cell.m)}` : ''} sub="Changes apply at the person’s next page load"
        footer={<><Button variant="ghost" onClick={() => setCell(null)}>Cancel</Button><Button variant="primary" disabled={locked || pick === before} onClick={save}>Save change</Button></>}>
        {cell && (
          <div className="flex flex-col gap-4">
            <Segmented value={pick} onChange={setPick} className="w-full" options={[{ value: 'full', label: 'Full' }, { value: 'view', label: 'View' }, { value: 'own', label: 'Own' }, { value: 'none', label: 'None' }]} />
            {locked ? <Banner tone="warn">The {cell.r.label} always keeps Settings, so nobody is locked out.</Banner> : pick !== before ? (
              <Banner tone={pick === 'none' ? 'warn' : 'info'}>{cell.r.label} role {pick === 'none' ? 'will no longer see' : 'can now'} {pick === 'none' ? modLabel(cell.m) : `${MARK_WORDS[pick]} in ${modLabel(cell.m)}`}. Save?</Banner>
            ) : null}
            <div>
              <p className="eyebrow text-ink3 mb-2">Allowed actions</p>
              <div className="flex flex-wrap gap-1.5">
                {['View', 'Create', 'Edit', 'Archive', 'Approve', 'Export', 'Print'].map((a) => (
                  <Pill key={a} tone={ACTS[pick].includes(a) ? 'ok' : 'neutral'} className={ACTS[pick].includes(a) ? '' : 'line-through opacity-70'}>{a}</Pill>
                ))}
              </div>
            </div>
            <Field label="Scope" id="cell-scope"><Select id="cell-scope" value={pick === 'own' ? 'own' : 'school'} onChange={() => {}} options={[{ value: 'school', label: 'Whole school' }, { value: 'campus', label: 'Their campus' }, { value: 'class', label: 'Their classes' }, { value: 'own', label: 'Own records' }]} /></Field>
            <p className="text-[12.5px] text-ink3">Every School Admin is alerted to this change. It is also checked by the software on every action, not only hidden from the menu.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function RulesView({ canEdit }) {
  const toast = useToast();
  const [signOut, setSignOut] = useState(false);
  const [len, setLen] = useState(8);
  const twoRoles = [['Principal', true, true], ['School Admin', true, true], ['Accountant', true, true], ['Vice Principal', true], ['HR', true], ['Office Staff', false], ['Class Teacher', false], ['Teacher', false]];
  return (
    <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
      <Col>
        <Card>
          <CardHead title="Password rules" sub="Checked when anyone sets or changes a password" icon={I.KeyRound} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            <SettingRow title="Shortest password" sub="Longer is safer and easy with a phrase">
              <span className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label="Fewer characters" disabled={!canEdit || len <= 6} onClick={() => setLen(len - 1)} icon={I.Minus} />
                <span className="w-24 text-center font-semibold text-[14px] tnum">{len} characters</span>
                <Button size="sm" variant="ghost" aria-label="More characters" disabled={!canEdit || len >= 14} onClick={() => { setLen(len + 1); toast({ title: `Passwords need ${len + 1} characters from now on`, body: 'People keep their current password until they change it.' }); }} icon={I.Plus} />
              </span>
            </SettingRow>
            <ValueRow title="Must contain" value="Letters and a number" onChange={() => toast({ title: 'Must contain', body: 'Choose letters, numbers and symbols. Saved and logged.', tone: 'info' })} />
            <ValueRow title="Wrong tries" sub="Then locked; the person and School Admins are told" value="5, then 15 min" onChange={() => toast({ title: 'Wrong tries', body: 'Pick 3 to 10 tries and a lock time.', tone: 'info' })} />
            <ToggleRow title="Ask to change every 180 days" sub="Off by default. Long passwords are safer than frequent changes." id="pw-expiry" />
          </div>
        </Card>
        <Card>
          <CardHead title="Sessions" sub="How long people stay signed in" icon={I.Timer} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            <ValueRow title="On computers" sub="After this long without use" value="30 minutes" onChange={() => toast({ title: 'Computer time-out', body: '15, 30 or 60 minutes.', tone: 'info' })} />
            <ValueRow title="On the installed phone app" value="7 days" onChange={() => toast({ title: 'Phone app time-out', body: '1, 7 or 30 days.', tone: 'info' })} />
            <SettingRow title="Sign out everyone now" sub="For example after a lost office laptop. Everyone signs in again.">
              {canEdit && <Button size="sm" variant="dangerSoft" icon={I.LogOut} onClick={() => setSignOut(true)}>Sign out all</Button>}
            </SettingRow>
          </div>
        </Card>
      </Col>
      <Col>
        <Card>
          <CardHead title="Two-step login" sub="A one-time code to the person’s phone after the password" icon={I.Smartphone} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            {twoRoles.map(([r, on, locked]) => locked ? (
              <SettingRow key={r} title={r} sub="Required for this role"><Pill tone="ok" className="gap-1"><I.Lock size={12} />Always on</Pill></SettingRow>
            ) : <ToggleRow key={r} title={r} on={on} id={'two-' + r.replace(/\W/g, '')} />)}
          </div>
        </Card>
        <Card>
          <CardHead title="Alerts and task access" icon={I.BellRing} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            <SettingRow title="Permission change alert" sub="Every School Admin is told who changed which role or person, and what"><Pill tone="ok" className="gap-1"><I.Lock size={12} />Cannot be switched off</Pill></SettingRow>
            <SettingRow title="Full task manager" sub="See, give and report on everyone’s tasks"><span className="text-[13.5px] font-semibold text-right block max-w-[160px]">Principal, School Admin, Vice Principal</span></SettingRow>
            <SettingRow title="Own tasks only" sub="Tasks given to or by them"><span className="text-[13.5px] font-semibold">Everyone else</span></SettingRow>
          </div>
        </Card>
      </Col>
      <ConfirmSheet open={signOut} onClose={() => setSignOut(false)} danger title="Sign out all 88 logins?" typeToConfirm="SIGN OUT"
        sub="Everyone is signed out on all 143 devices, including you. Work already saved is safe. Unsaved forms are lost."
        confirmLabel="Sign out everyone" onConfirm={() => toast({ title: '143 devices signed out', body: 'Recorded in the audit log.' })} />
    </div>
  );
}

/* =====================================================================
   3. Payment Gateways
   ===================================================================== */
const OTHER_GW = [
  { id: 'ppe', name: 'PhonePe', provider: 'PhonePe', type: 'Online', status: 'Not connected', note: 'UPI, cards and wallets' },
  { id: 'ezb', name: 'Easebuzz', provider: 'Easebuzz', type: 'Online', status: 'Not connected', note: 'UPI, cards, net banking, EMI' },
  { id: 'cash', name: 'Cash deposit at HDFC Bank', provider: 'Cash deposit', type: 'Cash deposit', status: 'Active', note: 'Parents pay at any HDFC branch with the challan · changed 14 Jun 2026' },
  { id: 'pos', name: 'Counter card machine', provider: 'POS', type: 'Online', status: 'Inactive', note: 'Pine Labs POS · switched off 3 Mar 2026' },
];
const MORE_GW = ['Cashfree', 'PayU', 'Paytm', 'SabPaisa', 'HDFC SmartGateway', 'Stripe'];

function GatewaysPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const [env, setEnv] = useState('Live');
  const [askEnv, setAskEnv] = useState(null);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState('Passed today, 8:00 AM');
  const [result, setResult] = useState(null);
  const [cred, setCred] = useState(false);
  const [confirmCred, setConfirmCred] = useState(false);
  const [add, setAdd] = useState(null);
  const [others, setOthers] = useState(OTHER_GW);
  const [flip, setFlip] = useState(null);
  const test = () => {
    setTesting(true); setResult(null);
    setTimeout(() => { setTesting(false); setTested('Passed today, 10:43 AM'); setResult(true); toast({ title: 'Razorpay test passed', body: 'Keys accepted, webhook reached in 0.4 seconds.' }); }, 900);
  };
  const hook = `https://pay.schoolos.in/hooks/razorpay/${SCHOOL_D.code}`;
  return (
    <div>
      <ModuleHead sub="Razorpay takes online fee payments. Which class or fee head uses which gateway is set in Fee Settings."
        actions={<Button variant="primary" icon={I.Plus} onClick={() => setAdd('PhonePe')}>Add gateway</Button>} />
      <Split>
        <Col>
          <Card>
            <div className="px-5 pt-5 pb-4 flex items-start gap-4 flex-wrap">
              <span className="w-12 h-12 rounded-2xl bg-info/10 text-info grid place-items-center shrink-0 font-display font-bold text-[22px]">R</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-[17px]">Razorpay</h3>
                  <Pill tone="ok" dot>Active</Pill>
                  <Pill tone={env === 'Live' ? 'brand' : 'warn'}>{env === 'Live' ? 'Live' : 'Test mode'}</Pill>
                </div>
                <p className="text-[13px] text-ink3 mt-0.5">Online · UPI, cards, net banking · the school’s main gateway</p>
              </div>
              {canEdit && (
                <Segmented size="sm" value={env} onChange={(v) => v !== env && setAskEnv(v)} options={[{ value: 'Test', label: 'Test' }, { value: 'Live', label: 'Live' }]} />
              )}
            </div>
            <div className="px-5 pb-2 border-t border-line/70 pt-3">
              <KV k="Key ID" v={env === 'Live' ? 'rzp_live_••••••••Q7mK' : 'rzp_test_••••••••8LpA'} mono />
              <KV k="Key secret" v="Saved · ends in ••3fK9 · never shown again" />
              <div className="flex items-center justify-between gap-3 py-1.5 text-[13.5px]">
                <span className="text-ink3 shrink-0">Webhook address</span>
                <span className="flex items-center gap-1 min-w-0">
                  <span className="font-mono text-[12px] truncate">{hook}</span>
                  <Button size="sm" variant="ghost" icon={I.Copy} aria-label="Copy webhook address" className="!px-2 shrink-0" onClick={() => toast({ title: 'Webhook address copied' })} />
                </span>
              </div>
              <KV k="Last test" v={tested} />
              <KV k="Last changed" v="2 Jun 2026 by Anita Sharma" />
            </div>
            {result && <Banner tone="ok" className="mx-5 mb-3" title="Test passed.">Keys accepted. Webhook reached in 0.4 seconds. A ₹1 test order was made and cancelled. Nothing was charged.</Banner>}
            <div className="px-5 pb-5 pt-2 flex gap-2 flex-wrap">
              <Button variant="secondary" icon={I.PlugZap} loading={testing} onClick={test}>{testing ? 'Testing…' : 'Test connection'}</Button>
              {canEdit && <Button variant="secondary" icon={I.KeyRound} onClick={() => setCred(true)}>Edit credentials</Button>}
              <Button variant="ghost" icon={I.Settings2} onClick={() => go('fees', { page: 'settings' })}>Which fees use it</Button>
            </div>
          </Card>

          <Card>
            <CardHead title="Bank accounts linked to Razorpay" sub="Online payments are split into these accounts by fee head (set in Fee Settings)" icon={I.Landmark}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add a bank account', body: 'Razorpay checks the account with a ₹1 deposit before splitting payments into it.', tone: 'info' })}>Add</Button>} />
            <ul className="px-2 pb-2">
              {[['HDFC Bank ••4471', 'Tuition, exam and admission fees', 'Kukatpally branch · IFSC HDFC0001847'], ['State Bank of India ••0982', 'Transport fees', 'KPHB Colony branch · IFSC SBIN0011452'], ['HDFC Bank ••5520', 'Hostel and mess fees', 'Kukatpally branch · IFSC HDFC0001847']].map(([a, h, b]) => (
                <li key={a} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><I.Landmark size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{a}</p><p className="text-[12.5px] text-ink3 truncate">{h} · {b}</p></div>
                  <Pill tone="ok" className="!h-5 !text-[11px]">Verified</Pill>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Other gateways" sub="Connect one more as a backup, or for one class group" icon={I.CreditCard} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {others.map((g) => (
                <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0 font-display font-bold', g.status === 'Active' ? 'bg-ok/10 text-ok' : 'bg-sunken text-ink3')}>{g.type === 'Cash deposit' ? <I.Banknote size={19} /> : g.provider === 'POS' ? <I.CreditCard size={19} /> : g.name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px]">{g.name} <Pill tone={STATUS_TONE[g.status]} className="!h-5 !text-[11px] ml-1 align-middle">{g.status}</Pill></p>
                    <p className="text-[12.5px] text-ink3">{g.type} · {g.note}</p>
                  </div>
                  {canEdit && (g.status === 'Not connected'
                    ? <Button size="sm" variant="secondary" onClick={() => setAdd(g.provider)}>Connect</Button>
                    : <Switch on={g.status === 'Active'} label={`${g.name} on or off`} onChange={() => setFlip(g)} />)}
                </li>
              ))}
            </ul>
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHead title="Online payments" sub="Through Razorpay, October so far" icon={I.ReceiptIndianRupee} />
            <div className="px-5 pb-5">
              <p className="font-display text-[28px] font-semibold tnum leading-tight">₹4,82,300</p>
              <p className="text-[13px] text-ink3">from 312 payments · 71% by UPI</p>
              <div className="mt-3 pt-2 border-t border-line/70">
                <KV k="Failed and retried" v="6" />
                <KV k="Matched from Razorpay’s record" v="2" />
                <KV k="Next settlement" v="Sat 10 Oct · ₹1,12,400" />
              </div>
              <Button variant="soft" className="w-full mt-3" icon={I.ChartColumn} onClick={() => go('fees', { page: 'dashboard' })}>Open Fee Dashboard</Button>
            </div>
          </Card>
          <Card>
            <CardHead title="More providers" sub="Ask DREAM TEAM SERVICES to add any other" icon={I.Plug} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {MORE_GW.map((p) => <button key={p} onClick={() => canEdit && setAdd(p)} className="h-9 px-3 rounded-xl border border-line text-[13.5px] font-semibold text-ink2 hover:bg-sunken">{p}</button>)}
            </div>
          </Card>
          <Banner tone="info" title="If a gateway is down,">parents see “Online payment is not working right now. Please try later or pay at the school.” Counter payments in cash, UPI and cheque carry on.</Banner>
        </Col>
      </Split>

      {/* Switch test / live */}
      <ConfirmSheet open={!!askEnv} onClose={() => setAskEnv(null)} danger={askEnv === 'Test'} typeToConfirm="Razorpay"
        title={askEnv === 'Test' ? 'Switch Razorpay to test mode?' : 'Switch Razorpay to live?'}
        sub={askEnv === 'Test' ? 'Parents cannot pay online until it is live again. Payment links already sent stop working while in test mode.' : 'Real money will be taken from parents from now on, using the live keys.'}
        confirmLabel={askEnv === 'Test' ? 'Switch to test mode' : 'Go live'} onConfirm={() => { const prev = env; setEnv(askEnv); toast({ title: `Razorpay is now ${askEnv === 'Live' ? 'live' : 'in test mode'}`, body: 'Recorded in the audit log.', undo: () => setEnv(prev) }); }} />

      {/* Edit credentials */}
      <Sheet open={cred} onClose={() => setCred(false)} title="Edit Razorpay credentials" sub="Saved secrets are encrypted and never shown again"
        footer={<><Button variant="ghost" onClick={() => setCred(false)}>Cancel</Button><Button variant="primary" onClick={() => { setCred(false); setConfirmCred(true); }}>Save new credentials</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Display name" required id="cr-name"><Input id="cr-name" defaultValue="Razorpay" /></Field>
          <Field label="Key ID" required id="cr-key"><Input id="cr-key" defaultValue="rzp_live_" className="font-mono" /></Field>
          <Field label="Key secret" required id="cr-sec" hint="The saved one ends in ••3fK9. Leave blank to keep it."><Input id="cr-sec" type="password" placeholder="Paste the new secret" /></Field>
          <Field label="Webhook address" id="cr-hook" hint="Filled in for Razorpay. Paste it in your Razorpay dashboard.">
            <div className="flex gap-2"><Input id="cr-hook" readOnly value={hook} className="font-mono !text-[12.5px] bg-sunken" /><Button type="button" variant="secondary" icon={I.Copy} onClick={() => toast({ title: 'Webhook address copied' })} aria-label="Copy" className="!px-3" /></div>
          </Field>
        </div>
      </Sheet>
      <ConfirmSheet open={confirmCred} onClose={() => setConfirmCred(false)} typeToConfirm="Razorpay" title="Change Razorpay credentials?"
        sub="Online payments use the new keys at once. If they are wrong, parents cannot pay online until you fix them. The old keys stop working here."
        confirmLabel="Change credentials" onConfirm={() => { setTested('Not tested since the change'); setResult(null); toast({ title: 'Razorpay credentials changed', body: 'Run a test now to be sure. Every School Admin was told.' }); }} />

      {/* Add / connect gateway */}
      <AddGatewaySheet provider={add} onClose={() => setAdd(null)} onAdded={(p) => setOthers((x) => x.map((g) => (g.provider === p ? { ...g, status: 'Inactive', note: 'Connected in test mode today · turn on after a test' } : g)))} />

      {/* Switch other gateway */}
      <ConfirmSheet open={!!flip} onClose={() => setFlip(null)} typeToConfirm={flip?.name} title={flip?.status === 'Active' ? `Switch off ${flip?.name}?` : `Switch on ${flip?.name}?`}
        sub={flip?.status === 'Active' ? 'Parents will no longer see this way to pay. Payments already made stay as they are.' : 'Parents will see this way to pay where Fee Settings uses it.'}
        confirmLabel={flip?.status === 'Active' ? 'Switch off' : 'Switch on'} danger={flip?.status === 'Active'}
        onConfirm={() => { const g = flip; setOthers((x) => x.map((y) => (y.id === g.id ? { ...y, status: g.status === 'Active' ? 'Inactive' : 'Active' } : y))); toast({ title: `${g.name} ${g.status === 'Active' ? 'switched off' : 'switched on'}` }); }} />
    </div>
  );
}

function AddGatewaySheet({ provider, onClose, onAdded }) {
  const toast = useToast();
  const [prov, setProv] = useState('PhonePe');
  const [envT, setEnvT] = useState('Test');
  const [tested, setTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enable, setEnable] = useState(false);
  React.useEffect(() => { if (provider) { setProv(provider); setTested(false); setEnable(false); setEnvT('Test'); } }, [provider]);
  const list = ['PhonePe', 'Easebuzz', 'Cashfree', 'PayU', 'Paytm', 'SabPaisa', 'HDFC SmartGateway', 'Stripe', 'POS', 'Cash deposit'];
  return (
    <FormSheet open={!!provider} onClose={onClose} title={`Add ${prov}`} sub="Starts in test mode. Turn it on after a successful test." submitLabel="Save gateway"
      onSubmit={() => { onAdded(prov); toast({ title: `${prov} saved${enable ? ' and switched on' : ''}`, body: 'Secrets are encrypted and will not be shown again.' }); }}>
      <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
        <Field label="Provider" required id="gw-prov"><Select id="gw-prov" value={prov} onChange={(v) => { setProv(v); setTested(false); }} options={list} /></Field>
        <Field label="Display name" required id="gw-name" hint="Use a distinct name for a second account of the same provider"><Input id="gw-name" key={prov} defaultValue={prov} /></Field>
      </div>
      <Field label="Merchant ID" required id="gw-mid"><Input id="gw-mid" className="font-mono" placeholder={`${prov.toUpperCase().replace(/\s/g, '')}SPS001`} /></Field>
      <Field label="Salt key" required id="gw-salt" hint="Encrypted. Only the last 4 characters are shown after saving."><Input id="gw-salt" type="password" placeholder="Paste from your provider dashboard" /></Field>
      <Field label="Environment" required><Segmented value={envT} onChange={setEnvT} options={[{ value: 'Test', label: 'Test (sandbox)' }, { value: 'Live', label: 'Live' }]} /></Field>
      <Field label="Webhook address" hint="Filled in for this provider · read-only"><div className="rounded-xl bg-sunken px-3.5 py-3 font-mono text-[12.5px] break-all">https://pay.schoolos.in/hooks/{prov.toLowerCase().replace(/\s/g, '')}/{SCHOOL_D.code}</div></Field>
      <div className="rounded-xl border border-line p-3.5 flex items-center gap-3 flex-wrap">
        <Button type="button" variant="secondary" icon={tested ? I.CircleCheck : I.PlugZap} loading={testing} onClick={() => { setTesting(true); setTimeout(() => { setTesting(false); setTested(true); }, 800); }}>{tested ? 'Test passed' : 'Test connection'}</Button>
        <label className="flex items-center gap-2.5 text-[14px] ml-auto">
          <Switch on={enable} label="Enable" onChange={(v) => { if (!tested) { toast({ title: 'Test the connection first', body: 'Turn it on after a successful test.', tone: 'bad' }); return; } setEnable(v); }} />Enable
        </label>
      </div>
    </FormSheet>
  );
}

/* =====================================================================
   4. SMS, WhatsApp & Email
   ===================================================================== */
const NOTIF_TYPES = [
  ['Approvals waiting for me', true, [1, 1, 0, 0]], ['Tasks given to me', false, [1, 1, 0, 0]], ['Fee payments received', false, [1, 0, 0, 0]],
  ['Students absent today', false, [1, 0, 0, 0]], ['Leave decided', false, [1, 1, 0, 1]], ['Exams and marks deadlines', false, [1, 1, 0, 0]],
  ['Security alerts (new sign-in)', true, [1, 1, 1, 0]], ['Daily summary', false, [0, 0, 1, 0]],
];
const CREDIT_HISTORY = [
  ['Oct 2026', '10,000 SMS', '6,214 SMS · 9,980 WhatsApp'], ['Sep 2026', '—', '11,402 SMS · 14,210 WhatsApp'], ['Aug 2026', '15,000 SMS', '10,118 SMS · 12,906 WhatsApp'],
  ['Jul 2026', '10,000 WhatsApp', '12,437 SMS · 13,588 WhatsApp'], ['Jun 2026', '20,000 SMS', '8,206 SMS · 9,140 WhatsApp'],
];

function MessagingPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const [on, setOn] = useState({ wa: true, sms: true, email: true, push: true, voice: false });
  const [dlt, setDlt] = useState({ entity: '1201161234567890123', header: 'SUNPSH' });
  const [edit, setEdit] = useState(null);
  const [buy, setBuy] = useState(false);
  const [pack, setPack] = useState('sms10');
  const [notif, setNotif] = useState(() => NOTIF_TYPES.map((n) => [...n[2]]));
  const [dltErr, setDltErr] = useState('');
  const [draft, setDraft] = useState(dlt);
  const flip = (id, name, v) => {
    if (!canEdit) return;
    if (id === 'voice' && v) { setEdit('voice'); return; }
    if (id === 'sms' && v && (!dlt.entity || !dlt.header)) { toast({ title: 'Add your DLT entity ID and sender header first', body: 'Both come from the telecom DLT portal.', tone: 'bad' }); setDraft(dlt); setEdit('sms'); return; }
    setOn((x) => ({ ...x, [id]: v }));
    toast({ title: `${name} ${v ? 'switched on' : 'switched off'} for the school`, body: v ? 'Messages go out on it again.' : 'Messages wait in the queue or go by another channel, as Message Settings allows.', undo: () => setOn((x) => ({ ...x, [id]: !v })) });
  };
  const CH = [
    { id: 'wa', name: 'WhatsApp', icon: I.MessageCircle, status: 'Connected', provider: 'Gupshup · WhatsApp Business API', credit: '8,420 conversations left', lines: [['Business number', '+91 90000 41122'], ['Display name', 'Sunrise Public School (verified)'], ['Approved templates', '31'], ['Last test', 'Today, 7:30 AM']] },
    { id: 'sms', name: 'SMS', icon: I.MessageSquareText, status: dlt.entity && dlt.header ? 'Connected' : 'Error', provider: 'MSG91', credit: '12,850 SMS left', lines: [['DLT entity ID', dlt.entity || 'Not entered'], ['Sender header', dlt.header ? `${dlt.header}, SUNRSE` : 'Not entered'], ['Templates with a DLT ID', '24 of 24'], ['Last test', 'Today, 7:31 AM']] },
    { id: 'email', name: 'Email', icon: I.Mail, status: 'Connected', provider: 'Zoho ZeptoMail', credit: '3,000 a day', lines: [['From', 'office@sunriseps.in'], ['From name', 'Sunrise Public School'], ['Domain check', 'SPF and DKIM passed'], ['Last test', '2 Oct, 4:10 PM']] },
    { id: 'push', name: 'App notifications', icon: I.BellRing, status: 'Connected', provider: 'School OS app', credit: 'Free', lines: [['Staff with the app', '74 of 86'], ['iPhone alerts', '18 staff, added to home screen']] },
    { id: 'voice', name: 'Voice calls', icon: I.PhoneCall, status: 'Not connected', provider: 'Not set up', credit: '', lines: [['Used for', 'Recorded calls about urgent closures']] },
  ];
  return (
    <div>
      <ModuleHead sub="Every message to parents and staff goes out through these. Message wording lives in Communication, Message Templates."
        actions={<><Button variant="secondary" icon={I.Send} onClick={() => toast({ title: 'Test sent to you', body: `WhatsApp, SMS and email to ${'Anita Sharma'}. Check your phone.` })}>Send a test to me</Button><Button variant="primary" icon={I.Plus} onClick={() => setBuy(true)}>Buy credits</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'SMS credits left', value: '12,850', sub: 'about 2 months at this pace', icon: 'MessageSquareText' },
          { label: 'WhatsApp left', value: '8,420', sub: 'conversations', icon: 'MessageCircle' },
          { label: 'Used this month', value: '16,194', sub: '6,214 SMS · 9,980 WhatsApp', icon: 'Send' },
          { label: 'Low-credit alert', value: 'Below 100', sub: 'shows on the Dashboard', icon: 'BellRing', onClick: canEdit ? () => toast({ title: 'Low-credit alert level', body: 'Pick 100, 500 or 1,000 credits.', tone: 'info' }) : undefined },
        ]} />
        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-5 @lg:gap-6 items-start">
          {CH.map((c) => (
            <Card key={c.id}>
              <div className="px-5 pt-4 pb-3 flex items-start gap-3">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', on[c.id] && c.status === 'Connected' ? 'bg-brand/10 text-brand' : 'bg-sunken text-ink3')}><c.icon size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] leading-tight flex items-center gap-2 flex-wrap">{c.name}<Pill tone={STATUS_TONE[c.status]} className="!h-5 !text-[11px]" dot>{c.status}</Pill></p>
                  <p className="text-[12.5px] text-ink3 mt-0.5">{c.provider}{c.credit && ` · ${c.credit}`}</p>
                </div>
                <Switch on={on[c.id]} label={`${c.name} on or off`} onChange={(v) => flip(c.id, c.name, v)} />
              </div>
              <div className="px-5 pb-2 border-t border-line/70 pt-2">
                {c.lines.map(([k, v]) => <KV key={k} k={k} v={v} mono={k === 'DLT entity ID'} />)}
              </div>
              <div className="px-5 pb-4 pt-1 flex gap-2 flex-wrap">
                {c.status !== 'Not connected' && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => toast({ title: `Test ${c.name.toLowerCase()} sent to you`, body: c.id === 'email' ? 'To office@sunriseps.in' : 'To 98490 11223' })}>Test</Button>}
                {canEdit && <Button size="sm" variant="ghost" icon={c.status === 'Not connected' ? I.Plug : I.Pencil} onClick={() => { setDraft(dlt); setDltErr(''); setEdit(c.id); }}>{c.status === 'Not connected' ? 'Connect' : 'Edit details'}</Button>}
              </div>
            </Card>
          ))}
          <Card>
            <CardHead title="Credits added and used" icon={I.History} action={<button onClick={() => go('communication', { page: 'history' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Message history</button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {CREDIT_HISTORY.map(([m, a, u]) => (
                <li key={m} className="px-5 py-2.5 grid grid-cols-[76px_1fr] gap-3 text-[13px]">
                  <span className="font-semibold">{m}</span>
                  <span className="min-w-0"><span className="block text-ink2">Used {u}</span><span className="block text-ink3">Added {a}</span></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHead title="Notification settings" sub="The default for staff. Each person can change their own in My profile." icon={I.Bell} />
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="text-[13.5px] min-w-full">
              <thead>
                <tr className="border-b border-line text-ink3 text-[12px]">
                  <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-5 py-2.5 min-w-[210px]">Kind of notification</th>
                  {['In the app', 'Push', 'Email', 'WhatsApp'].map((h) => <th key={h} className="font-semibold px-3 py-2.5 text-center whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {NOTIF_TYPES.map(([t, locked], i) => (
                  <tr key={t} className="border-b border-line/60 last:border-0">
                    <td className="sticky left-0 z-10 bg-surface px-5 py-2.5 font-medium">{t}{locked && <span className="block text-[11.5px] text-ink3 font-normal">Cannot be switched off</span>}</td>
                    {notif[i].map((v, j) => (
                      <td key={j} className="px-3 py-2.5 text-center">
                        <span className="inline-flex"><Checkbox checked={!!v} label={`${t} by ${['app', 'push', 'email', 'WhatsApp'][j]}`}
                          onChange={(nv) => { if (!canEdit || (locked && j === 0)) return; setNotif((x) => x.map((row, ri) => (ri === i ? row.map((c, ci) => (ci === j ? (nv ? 1 : 0) : c)) : row))); }} /></span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit channel */}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === 'sms' ? 'SMS provider and DLT' : edit === 'wa' ? 'WhatsApp Business' : edit === 'email' ? 'Email provider' : edit === 'voice' ? 'Connect voice calls' : 'App notifications'}
        sub="Account keys are encrypted and never shown again"
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => {
          if (edit === 'sms') {
            if (!draft.entity.trim() || !draft.header.trim()) { setDltErr('Add your DLT entity ID and sender header first'); return; }
            if (draft.header.trim().length !== 6) { setDltErr('A sender header has exactly 6 letters, like SUNPSH'); return; }
            setDlt({ entity: draft.entity.trim(), header: draft.header.trim().toUpperCase() });
          }
          setEdit(null); toast({ title: 'Saved', body: 'Send a test to be sure it works.' });
        }}>Save</Button></>}>
        {edit === 'sms' && (
          <div className="flex flex-col gap-4">
            <Field label="Provider" required id="sms-prov"><Select id="sms-prov" value="MSG91" onChange={() => {}} options={['MSG91', 'Kaleyra', 'Textlocal', 'Gupshup SMS']} /></Field>
            <Field label="DLT entity ID" required id="sms-ent" hint="19 digits, from the telecom DLT portal (Jio, Airtel or Vi)" error={dltErr && !draft.entity.trim() ? dltErr : ''}>
              <Input id="sms-ent" value={draft.entity} onChange={(e) => setDraft({ ...draft, entity: e.target.value })} inputMode="numeric" className="font-mono" error={!!dltErr && !draft.entity.trim()} />
            </Field>
            <Field label="Sender header" required id="sms-hdr" hint="6 letters registered on DLT. Parents see it as the sender." error={dltErr && draft.entity.trim() ? dltErr : ''}>
              <Input id="sms-hdr" value={draft.header} onChange={(e) => setDraft({ ...draft, header: e.target.value.toUpperCase() })} className="font-mono" maxLength={6} error={!!dltErr && !!draft.entity.trim()} />
            </Field>
            <Field label="API key" id="sms-key" hint="Saved one ends in ••a71c. Leave blank to keep it."><Input id="sms-key" type="password" placeholder="Paste a new key" /></Field>
            <p className="text-[12.5px] text-ink3">Every SMS template also needs its own DLT template ID, in Communication, Message Templates. An SMS can only go out from a template that has one.</p>
          </div>
        )}
        {edit === 'wa' && (
          <div className="flex flex-col gap-4">
            <Field label="Provider" required id="wa-prov"><Select id="wa-prov" value="Gupshup" onChange={() => {}} options={['Gupshup', 'Interakt', 'AiSensy', 'Meta Cloud API']} /></Field>
            <Field label="WhatsApp Business number" required id="wa-no"><Input id="wa-no" defaultValue="+91 90000 41122" inputMode="tel" /></Field>
            <Field label="Display name" id="wa-dn" hint="Verified by Meta. Changing it needs a new check."><Input id="wa-dn" defaultValue="Sunrise Public School" /></Field>
            <Field label="App ID and key" id="wa-key" hint="Saved one ends in ••K2pd"><Input id="wa-key" type="password" placeholder="Paste a new key" /></Field>
          </div>
        )}
        {edit === 'email' && (
          <div className="flex flex-col gap-4">
            <Field label="Provider" required id="em-prov"><Select id="em-prov" value="Zoho ZeptoMail" onChange={() => {}} options={['Zoho ZeptoMail', 'Amazon SES', 'Google Workspace (SMTP)', 'Microsoft 365 (SMTP)']} /></Field>
            <Field label="From name" required id="em-fn"><Input id="em-fn" defaultValue="Sunrise Public School" /></Field>
            <Field label="From address" required id="em-fa"><Input id="em-fa" defaultValue="office@sunriseps.in" type="email" /></Field>
          </div>
        )}
        {edit === 'push' && <p className="text-[14px] text-ink2">App notifications need no account. Staff turn them on when they install the School OS app. On iPhones they add it to the home screen first (iOS 16.4 or later).</p>}
        {edit === 'voice' && (
          <div className="flex flex-col gap-4">
            <Field label="Provider" required id="vc-prov"><Select id="vc-prov" value="Exotel" onChange={() => {}} options={['Exotel', 'Knowlarity', 'MyOperator']} /></Field>
            <Field label="Caller number" required id="vc-no" hint="The number parents see when the school calls"><Input id="vc-no" placeholder="040 ..." inputMode="tel" /></Field>
            <Field label="API key" required id="vc-key"><Input id="vc-key" type="password" placeholder="Paste from Exotel" /></Field>
          </div>
        )}
      </Sheet>

      {/* Buy credits */}
      <Sheet open={buy} onClose={() => setBuy(false)} title="Buy message credits" sub="Added within an hour. Billed by DREAM TEAM SERVICES on your next invoice."
        footer={<><Button variant="ghost" onClick={() => setBuy(false)}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setBuy(false); toast({ title: 'Credits requested', body: `${{ sms10: '10,000 SMS', sms25: '25,000 SMS', wa5: '5,000 WhatsApp conversations', wa15: '15,000 WhatsApp conversations' }[pack]} · you get a notification when they are added.` }); }}>
          Buy for {{ sms10: '₹2,360', sms25: '₹5,310', wa5: '₹2,065', wa15: '₹5,900' }[pack]}</Button></>}>
        <div className="flex flex-col gap-2">
          {[['sms10', '10,000 SMS', '₹2,000 + GST'], ['sms25', '25,000 SMS', '₹4,500 + GST · best value'], ['wa5', '5,000 WhatsApp conversations', '₹1,750 + GST'], ['wa15', '15,000 WhatsApp conversations', '₹5,000 + GST']].map(([v, l, p]) => (
            <button key={v} onClick={() => setPack(v)} aria-pressed={pack === v}
              className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition', pack === v ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
              <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', pack === v ? 'border-brand' : 'border-line')}>{pack === v && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
              <span className="flex-1"><span className="block font-semibold text-[14.5px]">{l}</span><span className="block text-[12.5px] text-ink3">{p}</span></span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/* =====================================================================
   Document drawings (tokens only), used by School Profile and Document Designs.
   Sizes are in em: set fontSize on the outer element to scale the whole page.
   ===================================================================== */
function MiniLogo({ className, inverse }) {
  return (
    <span className={cx('grid place-items-center rounded-[0.6em] shrink-0 w-[3.4em] h-[3.4em]', inverse ? 'bg-white/15 text-brandink' : 'bg-brand text-brandink', className)} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" className="w-[62%] h-[62%]">
        <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}
function DocHeader({ title, variant = 'Classic', className, style, right }) {
  if (variant === 'Modern') {
    return (
      <div className={className} style={style}>
        <div className="rounded-[0.5em] bg-brand text-brandink px-[1em] py-[0.8em] flex items-center gap-[0.8em]">
          <MiniLogo inverse className="!w-[2.8em] !h-[2.8em]" />
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold text-[1.35em] leading-tight">Sunrise Public School</p>
            <p className="text-[0.85em] opacity-80">Kukatpally, Hyderabad 500072 · 040 2305 4410</p>
          </div>
          {right}
        </div>
        {title && <p className="mt-[0.8em] font-bold tracking-[0.12em] text-[1em] text-brand">{title}</p>}
      </div>
    );
  }
  const center = variant === 'CBSE format';
  return (
    <div className={className} style={style}>
      <div className={cx('flex items-center gap-[0.8em] pb-[0.7em] border-b-[0.2em] border-brand', center && 'flex-col text-center gap-[0.4em]')}>
        <MiniLogo className={center ? '!w-[3em] !h-[3em]' : ''} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[1.4em] leading-tight text-ink">Sunrise Public School</p>
          <p className="text-[0.85em] text-ink3">KPHB Colony, Kukatpally, Hyderabad 500072 · 040 2305 4410</p>
          <p className="text-[0.85em] text-ink3">CBSE Affiliation No. 3630417 · School code 55417</p>
        </div>
        {right}
      </div>
      {title && <p className={cx('mt-[0.8em] font-bold tracking-[0.12em] text-[1em] text-ink', center && 'text-center')}>{title}</p>}
    </div>
  );
}
function Paper({ variant = 'Classic', children, style, className, width = 34 }) {
  return (
    <div style={{ ...style }} className={cx('bg-surface text-ink border border-line rounded-[0.5em] shadow-card leading-snug shrink-0', className)}>
      <div style={{ width: `${width}em` }} className={cx('p-[1.4em]', variant === 'CBSE format' && 'm-[0.5em] border-[0.15em] border-double border-ink/40 !p-[1em]')}>{children}</div>
    </div>
  );
}
function Sign({ who, className }) {
  return (
    <div className={cx('text-center', className)}>
      <svg viewBox="0 0 120 34" className="w-[7.5em] h-[2.1em] mx-auto text-info" fill="none" aria-hidden="true">
        <path d="M6 25c8-14 14-20 18-14s-6 16 2 12 10-18 16-16-4 18 4 14 8-10 14-10 4 8 10 6 10-8 18-9 10 3 22 1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <div className="border-t border-ink/30 pt-[0.25em] text-[0.82em] text-ink2">{who}</div>
    </div>
  );
}
function Seal() {
  return (
    <div className="w-[5em] h-[5em] rounded-full border-[0.18em] border-brand/50 text-brand grid place-items-center text-center shrink-0 rotate-[-12deg]" aria-hidden="true">
      <span className="text-[0.55em] font-bold leading-tight px-[0.6em]">SUNRISE PUBLIC SCHOOL<br />KUKATPALLY</span>
    </div>
  );
}
function MiniQR({ className }) {
  const cells = useMemo(() => { let s = 5; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647); return Array.from({ length: 21 * 21 }, () => r() > 0.5); }, []);
  const finder = (x, y) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  return (
    <svg viewBox="0 0 21 21" shapeRendering="crispEdges" className={cx('text-ink', className)} aria-hidden="true">
      {cells.map((on, i) => { const x = i % 21, y = Math.floor(i / 21); return !finder(x, y) && on ? <rect key={i} x={x} y={y} width="1" height="1" fill="currentColor" /> : null; })}
      {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => <g key={x + '-' + y}><rect x={x} y={y} width="7" height="7" fill="currentColor" /><rect x={x + 1} y={y + 1} width="5" height="5" style={{ fill: 'rgb(var(--surface))' }} /><rect x={x + 2} y={y + 2} width="3" height="3" fill="currentColor" /></g>)}
    </svg>
  );
}
const Line2 = ({ k, v }) => <div className="flex gap-[0.5em] py-[0.18em]"><span className="text-ink3 shrink-0 w-[9.5em]">{k}</span><span className="font-semibold min-w-0">{v}</span></div>;

function ReceiptDoc({ variant, style, logo = true, sign = true, qr = true }) {
  return (
    <Paper variant={variant} style={style}>
      <DocHeader variant={variant} title="FEE RECEIPT" right={logo ? null : null} />
      <div className="flex justify-between mt-[0.4em] text-[0.9em]"><span className="font-mono font-semibold">R/26/05191</span><span className="text-ink3">9 Oct 2026 · 2026–27</span></div>
      <div className="mt-[0.7em] grid grid-cols-2 gap-x-[1em] text-[0.9em]">
        <span><span className="text-ink3">Student </span><b>Aarav Sharma</b></span><span><span className="text-ink3">Class </span><b>7 B · Roll 12</b></span>
        <span><span className="text-ink3">Adm. no </span><b className="font-mono">SPS/2021/0417</b></span><span><span className="text-ink3">Father </span><b>Rajesh Sharma</b></span>
      </div>
      <table className="w-full mt-[0.8em] text-[0.9em]">
        <thead><tr className="border-y border-line text-ink3"><th className="text-left font-semibold py-[0.3em]">Fee head</th><th className="text-right font-semibold py-[0.3em]">Amount</th></tr></thead>
        <tbody>
          {[['Tuition fee · Q2 balance', 8500], ['Late fee', 250], ['Transport fee · Oct', 2200]].map(([h, a]) => <tr key={h} className="border-b border-line/60"><td className="py-[0.3em]">{h}</td><td className="text-right tnum">{inr(a)}</td></tr>)}
          <tr><td className="py-[0.4em] font-bold">Total paid</td><td className="text-right font-bold tnum">{inr(10950)}</td></tr>
        </tbody>
      </table>
      <p className="text-[0.85em] text-ink3">Rupees ten thousand nine hundred and fifty only · UPI · Ref 428915620344</p>
      <div className="flex items-end justify-between mt-[1em] gap-[1em]">
        {qr ? <div className="flex items-center gap-[0.5em]"><MiniQR className="w-[4em] h-[4em]" /><span className="text-[0.75em] text-ink3 w-[8em]">Scan to check this receipt is real</span></div> : <span />}
        {sign && <Sign who="Accountant" />}
      </div>
    </Paper>
  );
}
function TCDoc({ variant, style, sign = true }) {
  return (
    <Paper variant={variant} style={style}>
      <DocHeader variant={variant} title="TRANSFER CERTIFICATE" />
      <div className="flex justify-between text-[0.88em] text-ink3 mt-[0.2em]"><span>TC No. <b className="font-mono text-ink">TC/26/0031</b></span><span>Date 30 Sep 2026</span></div>
      <ol className="mt-[0.6em] text-[0.9em]">
        {[['1. Name of pupil', 'Rohan Gupta'], ['2. Father’s name', 'Anil Gupta'], ['3. Date of birth', '22-08-2013'], ['4. Admission no.', 'SPS/2019/0284'], ['5. Class last studied', 'Class 7 A (2026–27)'],
          ['6. Date of leaving', '30-09-2026'], ['7. Fees paid up to', 'September 2026'], ['8. Conduct', 'Good'], ['9. Reason for leaving', 'Parent moved to Pune']].map(([k, v]) => <li key={k}><Line2 k={k} v={v} /></li>)}
      </ol>
      {sign && <div className="flex items-end justify-between mt-[0.8em]"><Sign who="Class teacher" /><Seal /><Sign who="Principal" /></div>}
    </Paper>
  );
}
function BonafideDoc({ variant, style, sign = true }) {
  return (
    <Paper variant={variant} style={style}>
      <DocHeader variant={variant} title="BONAFIDE CERTIFICATE" />
      <div className="flex justify-between text-[0.88em] text-ink3 mt-[0.2em]"><span>No. <b className="font-mono text-ink">BC/26/0118</b></span><span>9 Oct 2026</span></div>
      <p className="mt-[0.9em] text-[0.95em] leading-relaxed">This is to certify that <b>Aarav Sharma</b>, son of <b>Rajesh Sharma</b>, is a bonafide student of this school, studying in <b>Class 7 B</b> in the academic year <b>2026–27</b>. His admission number is <b className="font-mono">SPS/2021/0417</b> and his date of birth as per our records is <b>14-03-2014</b>.</p>
      <p className="mt-[0.6em] text-[0.95em] leading-relaxed">This certificate is issued at the request of the parent for a passport application.</p>
      {sign && <div className="flex items-end justify-between mt-[1.2em]"><Seal /><Sign who="Principal · Lakshmi Rao" /></div>}
    </Paper>
  );
}
function IDCardDoc({ style, qr = true, variant }) {
  return (
    <div style={style} className="shrink-0">
      <div className="w-[20em] bg-surface border border-line rounded-[1em] overflow-hidden shadow-card text-ink leading-snug">
        <div className={cx('px-[1em] py-[0.8em] flex items-center gap-[0.6em]', variant === 'Classic' ? 'border-b-[0.2em] border-brand' : 'bg-brand text-brandink')}>
          <MiniLogo inverse={variant !== 'Classic'} className="!w-[2.6em] !h-[2.6em]" />
          <div className="min-w-0"><p className="font-display font-semibold text-[1.15em] leading-tight">Sunrise Public School</p><p className="text-[0.75em] opacity-80">Kukatpally, Hyderabad · 040 2305 4410</p></div>
        </div>
        <div className="px-[1em] pt-[1em] pb-[0.8em] flex flex-col items-center text-center">
          <span className="rounded-[0.6em] bg-brand/10 text-brand grid place-items-center font-display font-bold text-[1.8em] border border-brand/20" style={{ width: '3.6em', height: '4.2em' }}>AS</span>
          <p className="font-display font-semibold text-[1.35em] mt-[0.5em]">Aarav Sharma</p>
          <p className="text-[0.95em] text-ink2">Class 7 B · Roll 12</p>
          <div className="w-full mt-[0.6em] text-left text-[0.85em]">
            {[['Adm. no', 'SPS/2021/0417'], ['Blood group', 'B+'], ['Father', 'Rajesh Sharma'], ['Phone', '98490 31277'], ['Bus', 'Route 4 · Miyapur']].map(([k, v]) => <div key={k} className="flex justify-between py-[0.12em]"><span className="text-ink3">{k}</span><b>{v}</b></div>)}
          </div>
          <div className="w-full flex items-end justify-between mt-[0.6em]">
            {qr ? <MiniQR className="w-[3.6em] h-[3.6em]" /> : <span />}
            <div className="text-right text-[0.75em] text-ink3">Valid till 31 May 2027<Sign who="Principal" className="mt-[0.2em]" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
function AdmitDoc({ variant, style, sign = true }) {
  const ds = [['Mon 12 Oct', 'English'], ['Wed 14 Oct', 'Mathematics'], ['Thu 15 Oct', 'Science'], ['Fri 16 Oct', 'Telugu'], ['Mon 26 Oct', 'Social Studies'], ['Tue 27 Oct', 'Hindi']];
  return (
    <Paper variant={variant} style={style}>
      <DocHeader variant={variant} title="ADMIT CARD · HALF-YEARLY EXAMINATION 2026–27" />
      <div className="mt-[0.6em] flex gap-[0.9em]">
        <span className="rounded-[0.5em] bg-brand/10 text-brand grid place-items-center font-display font-bold text-[1.4em] border border-brand/20 shrink-0" style={{ width: '3.2em', height: '3.8em' }}>AS</span>
        <div className="text-[0.9em] flex-1 min-w-0">
          <Line2 k="Name" v="Aarav Sharma" /><Line2 k="Class and roll" v="7 B · Roll 12" /><Line2 k="Adm. no" v="SPS/2021/0417" /><Line2 k="Room and seat" v="Room 204 · Seat B-12" />
        </div>
      </div>
      <table className="w-full mt-[0.7em] text-[0.88em]">
        <thead><tr className="border-y border-line text-ink3"><th className="text-left font-semibold py-[0.25em]">Date</th><th className="text-left font-semibold">Subject</th><th className="text-right font-semibold">Time</th></tr></thead>
        <tbody>{ds.map(([d, s]) => <tr key={d} className="border-b border-line/60"><td className="py-[0.22em]">{d}</td><td>{s}</td><td className="text-right tnum">9:00–11:30 AM</td></tr>)}</tbody>
      </table>
      <p className="text-[0.8em] text-ink3 mt-[0.4em]">Report by 8:15 AM. Bring this card and two pencils.</p>
      {sign && <div className="flex items-end justify-between mt-[0.6em]"><Sign who="Exam In-charge" /><Sign who="Principal" /></div>}
    </Paper>
  );
}
const cbseGrade = (p) => (p >= 91 ? 'A1' : p >= 81 ? 'A2' : p >= 71 ? 'B1' : p >= 61 ? 'B2' : p >= 51 ? 'C1' : p >= 41 ? 'C2' : p >= 33 ? 'D' : 'E');
function ReportDoc({ variant, style, sign = true }) {
  const rows = STUDENT_PROFILE.exams.map((e) => ({ ...e, tot: e.ut1 + e.ut2, g: cbseGrade(((e.ut1 + e.ut2) / (e.max * 2)) * 100) }));
  const all = rows.reduce((a, r) => a + r.tot, 0);
  return (
    <Paper variant={variant} style={style}>
      <DocHeader variant={variant} title="REPORT CARD 2026–27 · TERM 1" />
      <div className="mt-[0.4em] text-[0.88em] flex flex-wrap gap-x-[1.2em]"><span><span className="text-ink3">Student </span><b>Aarav Sharma</b></span><span><span className="text-ink3">Class </span><b>7 B · Roll 12</b></span><span><span className="text-ink3">Adm. no </span><b className="font-mono">SPS/2021/0417</b></span></div>
      <table className="w-full mt-[0.6em] text-[0.88em]">
        <thead><tr className="border-y border-line text-ink3"><th className="text-left font-semibold py-[0.25em]">Subject</th><th className="text-right font-semibold">UT 1</th><th className="text-right font-semibold">UT 2</th><th className="text-right font-semibold">Total (50)</th><th className="text-right font-semibold">Grade</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.sub} className="border-b border-line/60"><td className="py-[0.22em]">{r.sub}</td><td className="text-right tnum">{r.ut1}</td><td className="text-right tnum">{r.ut2}</td><td className="text-right tnum font-semibold">{r.tot}</td><td className="text-right font-bold text-brand">{r.g}</td></tr>)}
          <tr><td className="py-[0.3em] font-bold">Overall</td><td /><td /><td className="text-right font-bold tnum">{all} / 300</td><td className="text-right font-bold text-brand">{cbseGrade((all / 300) * 100)}</td></tr>
        </tbody>
      </table>
      <p className="text-[0.85em] mt-[0.4em]"><span className="text-ink3">Attendance </span><b>94%</b> <span className="text-ink3">· Remarks </span>Attentive and does very well in Mathematics. Should read more for Social Studies.</p>
      {sign && <div className="flex items-end justify-between mt-[0.7em]"><Sign who="Class teacher" /><Sign who="Principal" /><Sign who="Parent" /></div>}
    </Paper>
  );
}

/* =====================================================================
   5. Document Designs
   ===================================================================== */
const DESIGNS = [
  { id: 'receipt', name: 'Fee receipt', group: 'Fees', use: 'Classic', ver: 4, changed: '2 Jun 2026', where: 'Collect Fee and online payments', Doc: ReceiptDoc, fields: ['{receipt_no}', '{student_name}', '{class}', '{admission_no}', '{father_name}', '{fee_heads}', '{amount}', '{amount_in_words}', '{payment_mode}', '{date}'] },
  { id: 'tc', name: 'Transfer certificate', group: 'Certificates', use: 'CBSE format', ver: 2, changed: '18 Jul 2026', where: 'Leaving & Alumni', Doc: TCDoc, fields: ['{tc_no}', '{student_name}', '{father_name}', '{date_of_birth}', '{admission_no}', '{class_last_studied}', '{date_of_leaving}', '{conduct}', '{reason}'] },
  { id: 'bonafide', name: 'Bonafide certificate', group: 'Certificates', use: 'Classic', ver: 3, changed: '4 Aug 2026', where: 'Certificates & ID Cards', Doc: BonafideDoc, fields: ['{certificate_no}', '{student_name}', '{son_daughter}', '{father_name}', '{class}', '{year}', '{admission_no}', '{date_of_birth}', '{purpose}'] },
  { id: 'idcard', name: 'Student ID card', group: 'ID cards', use: 'Modern', ver: 2, changed: '20 May 2026', where: 'Certificates & ID Cards', Doc: IDCardDoc, fields: ['{photo}', '{student_name}', '{class}', '{roll_no}', '{admission_no}', '{blood_group}', '{father_name}', '{parent_phone}', '{bus_route}', '{valid_till}'] },
  { id: 'admit', name: 'Admit card', group: 'Exams', use: 'Classic', ver: 1, changed: '1 Oct 2026', where: 'Admit Cards', Doc: AdmitDoc, fields: ['{exam_name}', '{student_name}', '{class}', '{roll_no}', '{admission_no}', '{room}', '{seat}', '{datesheet}'] },
  { id: 'report', name: 'Report card', group: 'Exams', use: 'CBSE format', ver: 5, changed: '22 Sep 2026', where: 'Report Cards', Doc: ReportDoc, fields: ['{student_name}', '{class}', '{roll_no}', '{marks_table}', '{grades}', '{attendance}', '{remarks}', '{result}'] },
];
const OTHER_DESIGNS = [
  ['Fee invoice', 'Fees', 'Classic'], ['Tax invoice', 'Fees', 'GST format · shows GSTIN'], ['Fee certificate', 'Fees', 'Classic · for income tax'], ['Salary slip', 'Staff & letters', 'Classic'],
  ['Study certificate', 'Certificates', 'Classic'], ['Character certificate', 'Certificates', 'Classic'], ['Final result', 'Exams', 'CBSE format'],
  ['Staff ID card', 'ID cards', 'Modern'], ['Bus pass', 'ID cards', 'Credit card size'], ['Library card', 'ID cards', 'Credit card size · barcode'], ['Visitor pass', 'ID cards', 'Mini · printed at the desk'],
  ['Experience letter', 'Staff & letters', 'Letterhead'], ['Offer letter', 'Staff & letters', 'Letterhead'], ['Letters to parents', 'Staff & letters', 'Letterhead'],
];

function DesignsPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const [g, setG] = useState('all');
  const [edit, setEdit] = useState(null);
  const [designs, setDesigns] = useState(DESIGNS);
  const shown = designs.filter((d) => g === 'all' || d.group === g);
  const others = OTHER_DESIGNS.filter((d) => g === 'all' || d[1] === g);
  return (
    <div>
      <ModuleHead sub="Receipts, certificates, ID cards and report cards print with the school’s logo, signatures and the right year"
        actions={<Button variant="secondary" icon={I.PenLine} onClick={() => document.getElementById('sig-card')?.scrollIntoView({ behavior: 'smooth' })}>Signatures</Button>} />
      <Chips className="mb-4" value={g} onChange={setG} options={[{ value: 'all', label: 'All', count: DESIGNS.length + OTHER_DESIGNS.length }, ...['Fees', 'Certificates', 'ID cards', 'Exams', 'Staff & letters'].map((x) => ({ value: x, label: x, count: DESIGNS.filter((d) => d.group === x).length + OTHER_DESIGNS.filter((d) => d[1] === x).length }))]} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {shown.length > 0 && (
          <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-5 @lg:gap-6">
            {shown.map((d) => (
              <Card key={d.id} className="overflow-hidden flex flex-col">
                <button onClick={() => setEdit(d)} className="relative h-[250px] overflow-hidden bg-sunken flex justify-center pt-4 text-left group" aria-label={`Open ${d.name} design`}>
                  <d.Doc variant={d.use === 'Modern' ? 'Modern' : d.use} style={{ fontSize: d.id === 'idcard' ? 8.2 : 6.6 }} />
                  <span className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-sunken to-sunken/0 pointer-events-none" />
                </button>
                <div className="px-4 py-3.5 flex items-center gap-3 border-t border-line/70">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] truncate">{d.name}</p>
                    <p className="text-[12.5px] text-ink3 truncate">In use: {d.use} · version {d.ver} · {d.changed}</p>
                  </div>
                  <Button size="sm" variant={canEdit ? 'secondary' : 'ghost'} icon={canEdit ? I.Pencil : I.Eye} onClick={() => setEdit(d)}>{canEdit ? 'Edit' : 'View'}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
        {others.length > 0 && (
          <Card>
            <CardHead title={g === 'all' ? 'Other designs' : `More ${g.toLowerCase()} designs`} sub="Each one has ready designs to choose from and a preview with sample data" icon={I.LayoutTemplate} />
            <ul className="grid grid-cols-1 @lg:grid-cols-2 px-2 pb-2">
              {others.map(([n, grp, use]) => (
                <li key={n}>
                  <button onClick={() => toast({ title: `${n}: ${use.split(' · ')[0]}`, body: 'Opens the same editor with sample data.', tone: 'info' })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70 transition">
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2">{grp === 'ID cards' ? <I.IdCard size={18} /> : grp === 'Fees' ? <I.ReceiptText size={18} /> : <I.FileText size={18} />}</span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{n}</span><span className="block text-[12.5px] text-ink3 truncate">{grp} · {use}</span></span>
                    <I.ChevronRight size={17} className="text-ink3 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card id="sig-card">
            <CardHead title="Signatures" sub="Printed on documents. Each upload is logged." icon={I.PenLine}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Upload} onClick={() => toast({ title: 'Signature uploaded', body: 'Meena Pillai (Academic Head) · used on question papers' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {[['Lakshmi Rao', 'Principal', 'TC, bonafide, report cards, ID cards', '2 Jun 2026'], ['Suresh Babu', 'Accountant', 'Fee receipts, fee certificates', '2 Jun 2026'], ['Prakash Joshi', 'Exam In-charge', 'Admit cards', '1 Oct 2026'], ['Class teachers', '38 of 43 uploaded', 'Report cards of their section', '5 missing']].map(([n, r, u, d]) => (
                <li key={n} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-16 h-10 rounded-lg bg-sunken grid place-items-center shrink-0 text-info" style={{ fontSize: 6 }}><svg viewBox="0 0 120 34" className="w-[7.5em] h-[2.1em]" fill="none" aria-hidden="true"><path d="M6 25c8-14 14-20 18-14s-6 16 2 12 10-18 16-16-4 18 4 14 8-10 14-10 4 8 10 6 10-8 18-9 10 3 22 1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{n} <span className="text-ink3 font-normal">· {r}</span></p><p className="text-[12.5px] text-ink3 truncate">{u}</p></div>
                  <span className={cx('text-[12px] shrink-0', d.includes('missing') ? 'text-warn font-semibold' : 'text-ink3')}>{d}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-line/70"><ToggleRow title="Digital signature on PDFs" sub="Sign PDFs with the Principal’s Class 3 digital signature certificate" id="dsc" /></div>
          </Card>
          <Card>
            <CardHead title="ID card settings" sub="Also opened from Certificates & ID Cards" icon={I.IdCard} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <ValueRow title="Size" value="Standard (CR80)" onChange={() => toast({ title: 'ID card size', body: 'Standard, credit card, mini or vertical.', tone: 'info' })} />
              <ValueRow title="Orientation" value="Vertical" onChange={() => toast({ title: 'Orientation', body: 'Vertical or horizontal.', tone: 'info' })} />
              <ValueRow title="Cards per A4 sheet" value="10" onChange={() => toast({ title: 'Cards per sheet', body: '8 or 10, for the school’s PVC printer sheets.', tone: 'info' })} />
              <ValueRow title="Valid until" value="31 May 2027" />
              <ToggleRow title="QR code" sub="Gate staff scan it to see the pickup list" on id="id-qr" />
              <ToggleRow title="Library barcode" on id="id-bar" />
            </div>
            <div className="px-5 py-4 border-t border-line/70">
              <p className="text-[12px] text-ink3 font-semibold mb-2">Fields on the card</p>
              <IdFields />
            </div>
          </Card>
        </div>
      </div>
      <DesignEditor d={edit} onClose={() => setEdit(null)} canEdit={canEdit}
        onSave={(d, use) => { setDesigns((x) => x.map((y) => (y.id === d.id ? { ...y, use, ver: y.ver + 1, changed: '9 Oct 2026' } : y))); toast({ title: `${d.name} saved as version ${d.ver + 1}`, body: `Version ${d.ver} is kept. New documents use it from now on.` }); setEdit(null); }} />
    </div>
  );
}
function IdFields() {
  const all = ['Photo', 'Name', 'Admission no', 'Roll no', 'Class', 'Date of birth', 'Blood group', 'Parent phone', 'Parents’ names', 'Address', 'Bus route'];
  const [on, setOn] = useState(new Set(['Photo', 'Name', 'Admission no', 'Roll no', 'Class', 'Blood group', 'Parent phone', 'Parents’ names', 'Bus route']));
  const canEdit = useCanEdit();
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((f) => (
        <button key={f} onClick={() => canEdit && setOn((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; })} aria-pressed={on.has(f)}
          className={cx('h-8 px-2.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition', on.has(f) ? 'bg-brand/10 border-brand/25 text-brand' : 'border-line text-ink3 hover:text-ink')}>
          {on.has(f) && <I.Check size={13} strokeWidth={3} />}{f}
        </button>
      ))}
    </div>
  );
}
function DesignEditor({ d, onClose, onSave, canEdit }) {
  const toast = useToast();
  const [use, setUse] = useState('Classic');
  const [sign, setSign] = useState(true);
  const [qr, setQr] = useState(true);
  const [adm, setAdm] = useState('SPS/2021/0417');
  React.useEffect(() => { if (d) setUse(d.use); }, [d]);
  if (!d) return null;
  const options = d.id === 'idcard' ? ['Classic', 'Modern'] : ['Classic', 'Modern', 'CBSE format'];
  return (
    <Sheet open={!!d} onClose={onClose} title={d.name} sub={`Used by ${d.where} · version ${d.ver}`} wide
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => onSave(d, use)}>Save as version {d.ver + 1}</Button></> : null}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-sunken p-4 flex justify-center overflow-x-auto scroll-thin">
          <d.Doc variant={use} sign={sign} qr={qr} style={{ fontSize: d.id === 'idcard' ? 11 : 8.4 }} />
        </div>
        {canEdit && (
          <>
            <Field label="Ready design"><Segmented value={use} onChange={setUse} options={options} /></Field>
            <div className="rounded-xl border border-line divide-y divide-line/70">
              <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><span className="flex-1"><b className="font-semibold block">Signatures and seal</b><span className="text-[12.5px] text-ink3">From the Signatures list</span></span><Switch on={sign} onChange={setSign} label="Signatures" /></label>
              {(d.id === 'receipt' || d.id === 'idcard') && <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><span className="flex-1"><b className="font-semibold block">QR code</b><span className="text-[12.5px] text-ink3">Anyone can scan it to check the document is real</span></span><Switch on={qr} onChange={setQr} label="QR code" /></label>}
            </div>
            <Field label="Merge fields" hint="Tap one to put it in the text where your cursor is">
              <div className="flex flex-wrap gap-1.5">
                {d.fields.map((f) => <button key={f} type="button" onClick={() => toast({ title: `Added ${f}`, body: 'Filled from each record when printed.', tone: 'info' })} className="h-8 px-2.5 rounded-lg bg-sunken hover:bg-line/70 font-mono text-[12px]">{f}</button>)}
              </div>
            </Field>
            <Field label="Preview with a real record" id="de-adm" hint="Admission number or name">
              <div className="flex gap-2"><Input id="de-adm" value={adm} onChange={(e) => setAdm(e.target.value)} className="font-mono" /><Button type="button" variant="secondary" icon={I.Eye} onClick={() => toast({ title: 'Preview opened', body: `${d.name} for ${adm} · nothing is saved or sent`, tone: 'info' })}>Preview</Button></div>
            </Field>
          </>
        )}
        <p className="text-[12.5px] text-ink3">Documents always use the right academic year and the branding of the student’s campus. Earlier versions are kept.</p>
      </div>
    </Sheet>
  );
}

/* =====================================================================
   6. Forms & Approvals
   ===================================================================== */
const RULES = [
  { id: 'concession', name: 'Discounts and concessions', icon: 'BadgePercent', steps: [{ who: 'School Admin', upto: 2000 }, { who: 'Principal' }], esc: 2, waiting: 1 },
  { id: 'refund', name: 'Refunds', icon: 'Undo2', steps: [{ who: 'Accountant', upto: 5000 }, { who: 'Principal' }], esc: 2, waiting: 0 },
  { id: 'expense', name: 'Expenses', icon: 'ReceiptText', steps: [{ who: 'School Admin', upto: 10000 }, { who: 'Principal', upto: 100000 }, { who: 'K. Ramachandra Rao (Chairman)' }], esc: 3, waiting: 1 },
  { id: 'purchase', name: 'Purchases', icon: 'ShoppingCart', steps: [{ who: 'School Admin', upto: 25000 }, { who: 'Principal' }], esc: 3, waiting: 2 },
  { id: 'staffleave', name: 'Staff leave', icon: 'CalendarDays', steps: [{ who: 'Vice Principal', note: 'up to 3 days' }, { who: 'Principal', note: 'more than 3 days' }], esc: 1, waiting: 3 },
  { id: 'studentleave', name: 'Student leave', icon: 'CalendarX2', steps: [{ who: 'Class Teacher', note: 'up to 3 days' }, { who: 'Vice Principal', note: 'more than 3 days' }], esc: 1, waiting: 2 },
  { id: 'admission', name: 'Admissions', icon: 'UserPlus', steps: [{ who: 'Admission Counsellor', note: 'checks documents and test' }, { who: 'Principal', note: 'decides' }], esc: 2, waiting: 4 },
  { id: 'certificate', name: 'Certificates (TC, bonafide)', icon: 'Award', steps: [{ who: 'Accountant', note: 'no dues, for a TC' }, { who: 'Principal', note: 'signs' }], esc: 2, waiting: 2 },
  { id: 'salary', name: 'Month’s salary', icon: 'Wallet', steps: [{ who: 'Accountant', note: 'prepares' }, { who: 'Principal', note: 'approves before paying' }], esc: 1, waiting: 0 },
  { id: 'results', name: 'Results', icon: 'ClipboardCheck', steps: [{ who: 'Exam In-charge', note: 'checks marks' }, { who: 'Academic Head' }, { who: 'Principal', note: 'publishes' }], esc: 2, waiting: 0 },
  { id: 'attcorr', name: 'Attendance corrections', icon: 'CalendarCheck2', steps: [{ who: 'Vice Principal' }], esc: 1, waiting: 1 },
  { id: 'outing', name: 'Hostel outings', icon: 'DoorOpen', steps: [{ who: 'Hostel Warden' }], esc: 1, waiting: 3 },
  { id: 'deletion', name: 'Data deletion', icon: 'Trash2', steps: [{ who: 'Principal' }, { who: 'School Admin' }], esc: 5, waiting: 1 },
];
const APPROVERS = ['Principal', 'School Admin', 'Vice Principal', 'Accountant', 'Academic Head', 'Exam In-charge', 'Class Teacher', 'Hostel Warden', 'Admission Counsellor', 'HR', 'K. Ramachandra Rao (Chairman)', 'Bursar'];
const ruleText = (r) => {
  const s = r.steps;
  let t;
  if (s.some((x) => x.upto)) {
    t = s.map((x, i) => (x.upto ? `${i === 0 ? 'Up to' : `then up to`} ${inr(x.upto)} the ${x.who} approves` : `above that, ${x.who.startsWith('K.') ? x.who : 'the ' + x.who}`)).join('; ');
  } else if (s.some((x) => x.note && /days/.test(x.note))) {
    t = s.map((x) => `${x.note}: the ${x.who}`).join('; ');
    t = t[0].toUpperCase() + t.slice(1);
  } else {
    t = s.map((x, i) => `${i === 0 ? 'First' : 'then'} the ${x.who}${x.note ? ` (${x.note})` : ''}`).join(', ');
  }
  return `${t}. Escalate after ${r.esc} working day${r.esc > 1 ? 's' : ''}.`;
};
const CUSTOM_FIELDS = [
  { id: 'cf1', rec: 'Student', label: 'APAAR ID', type: 'Text', req: 'Yes', vis: 'Everyone who can see the record' },
  { id: 'cf2', rec: 'Student', label: 'Mother tongue', type: 'Choice', req: 'No', vis: 'Everyone who can see the record' },
  { id: 'cf3', rec: 'Student', label: 'Allergies', type: 'Text', req: 'No', vis: 'Restricted: class teacher, nurse' },
  { id: 'cf4', rec: 'Parent', label: 'Second WhatsApp number', type: 'Text', req: 'No', vis: 'Everyone who can see the record' },
  { id: 'cf5', rec: 'Staff', label: 'Vehicle number', type: 'Text', req: 'No', vis: 'HR and gate security' },
  { id: 'cf6', rec: 'Enquiry', label: 'How did you hear about us', type: 'Choice', req: 'Yes', vis: 'Everyone who can see the record' },
  { id: 'cf7', rec: 'Application', label: 'Sibling in this school', type: 'Yes or no', req: 'Yes', vis: 'Everyone who can see the record' },
];
const FORMS = [
  { id: 'f1', name: 'Staff appraisal 2026–27', fields: 14, status: 'Published', resp: '52 of 86 filled' },
  { id: 'f2', name: 'Annual day participation', fields: 6, status: 'Published', resp: '418 parents replied' },
  { id: 'f3', name: 'Bus stop change request', fields: 5, status: 'Published', resp: '9 this month' },
  { id: 'f4', name: 'Sports day volunteer form', fields: 7, status: 'Draft', resp: 'Not sent' },
];

function FormsPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const [rules, setRules] = useState(RULES);
  const [edit, setEdit] = useState(null);
  const [fields, setFields] = useState(CUSTOM_FIELDS);
  const [addField, setAddField] = useState(false);
  const [ftype, setFtype] = useState('Text');
  const [fq, setFq] = useState('');
  const [rec, setRec] = useState('all');
  const fshown = fields.filter((f) => (rec === 'all' || f.rec === rec) && (!fq || f.label.toLowerCase().includes(fq.toLowerCase())));
  const archive = (f) => { setFields((x) => x.filter((y) => y.id !== f.id)); toast({ title: `Archived: ${f.label}`, body: 'Existing answers are kept.', undo: () => setFields((x) => [...x, f]) }); };
  return (
    <div>
      <ModuleHead sub="Who approves what, up to which amount, plus extra fields and the school’s own forms"
        actions={<><Button variant="secondary" icon={I.FormInput} onClick={() => toast({ title: 'New form', body: 'Pick fields, preview it, then publish.', tone: 'info' })}>New form</Button><Button variant="primary" icon={I.Plus} onClick={() => setAddField(true)}>Add custom field</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Banner tone="brand" icon={I.ShieldCheck} title="Nobody approves their own request.">If the person who asked is also the approver at a step, the request moves to the next step, or to the Principal.</Banner>
        <Card>
          <CardHead title="Approval rules" sub="Each request goes through these steps. The plain-words line is what approvers see." icon={I.Workflow} action={<Pill tone="info">{rules.reduce((a, r) => a + r.waiting, 0)} waiting now</Pill>} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {rules.map((r) => (
              <li key={r.id} className="px-5 py-3.5 flex items-start gap-3.5">
                <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={r.icon} size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] flex items-center gap-2 flex-wrap">{r.name}{r.waiting > 0 && <Pill tone="warn" className="!h-5 !text-[11px]">{r.waiting} waiting</Pill>}</p>
                  <p className="text-[13px] text-ink2 mt-0.5">{ruleText(r)}</p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {r.steps.map((s, i) => (
                      <React.Fragment key={i}>
                        {i > 0 && <I.ChevronRight size={14} className="text-ink3" />}
                        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-sunken text-[12.5px] font-semibold"><span className="w-4 h-4 rounded-full bg-brand text-brandink text-[10px] grid place-items-center tnum">{i + 1}</span>{s.who}{s.upto ? <span className="text-ink3 font-normal">≤ {inr(s.upto)}</span> : null}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                {canEdit && <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setEdit(r)} className="shrink-0">Edit</Button>}
              </li>
            ))}
          </ul>
        </Card>

        <Split side={380}>
          <Card className="overflow-hidden min-w-0">
            <CardHead title="Custom fields" sub="Extra fields on records. Archived fields keep their answers." icon={I.TextCursorInput} />
            <Toolbar className="border-t">
              <SearchBox id="cf-search" value={fq} onChange={setFq} placeholder="Search fields" />
              <Select id="cf-rec" value={rec} onChange={setRec} className="@md:w-44" options={[{ value: 'all', label: 'All records' }, 'Student', 'Parent', 'Staff', 'Enquiry', 'Application']} />
            </Toolbar>
            <DataList rows={fshown} minWidth={620} footer={`${fshown.length} custom fields`}
              empty={<Empty icon={I.TextCursorInput} title="No custom fields here" body="Add a field to keep something extra on these records." action={canEdit && <Button variant="soft" icon={I.Plus} onClick={() => setAddField(true)}>Add custom field</Button>} />}
              columns={[
                { key: 'label', label: 'Field', render: (f) => <b className="font-semibold">{f.label}</b> },
                { key: 'rec', label: 'Record' }, { key: 'type', label: 'Type' },
                { key: 'req', label: 'Required', render: (f) => (f.req === 'Yes' ? <Pill tone="info" className="!h-5 !text-[11px]">Required</Pill> : <span className="text-ink3">No</span>) },
                { key: 'vis', label: 'Visible to', render: (f) => <span className="text-[13px] text-ink2">{f.vis}</span> },
                { key: 'a', label: '', render: (f) => canEdit && <MoreMenu size="sm" items={[[I.Pencil, 'Edit', () => setAddField(true)], [I.Archive, 'Archive', () => archive(f), 'bad']]} /> },
              ]}
              mobile={(f) => ({ icon: 'TextCursorInput', title: f.label, sub: `${f.rec} · ${f.type} · ${f.vis}`, pills: f.req === 'Yes' ? [<Pill key="r" tone="info" className="!h-5 !text-[11px]">Required</Pill>] : null, right: canEdit ? <MoreMenu size="sm" items={[[I.Pencil, 'Edit', () => setAddField(true)], [I.Archive, 'Archive', () => archive(f), 'bad']]} /> : null })} />
          </Card>
          <Card className="min-w-0">
            <CardHead title="School’s own forms" sub="Built from fields; can show a field only when another answer matches" icon={I.ClipboardList} />
            <ul className="px-2 pb-2">
              {FORMS.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><I.ClipboardList size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{f.name}</p><p className="text-[12.5px] text-ink3 truncate">{f.fields} fields · {f.resp}</p></div>
                  <Pill tone={f.status === 'Published' ? 'ok' : 'neutral'} className="!h-5 !text-[11px] shrink-0">{f.status}</Pill>
                  <MoreMenu size="sm" items={[[I.Eye, 'Preview', () => toast({ title: `Preview: ${f.name}`, body: 'Opens as people see it. Nothing is saved.', tone: 'info' })], ...(canEdit ? [[I.Pencil, 'Edit', () => toast({ title: `Editing ${f.name}`, tone: 'info' })], [I.Send, f.status === 'Draft' ? 'Publish' : 'Send again', () => toast({ title: f.status === 'Draft' ? `${f.name} published` : `${f.name} sent again` })]] : [])]} />
                </li>
              ))}
            </ul>
          </Card>
        </Split>
      </div>

      <RuleSheet r={edit} onClose={() => setEdit(null)} onSave={(nr) => { const old = rules.find((x) => x.id === nr.id); setRules((x) => x.map((y) => (y.id === nr.id ? nr : y))); setEdit(null); toast({ title: `Rule saved: ${nr.name}`, body: ruleText(nr), undo: () => setRules((x) => x.map((y) => (y.id === old.id ? old : y))) }); }} />
      <FormSheet open={addField} onClose={() => setAddField(false)} title="Custom field" sub="Shows on the record’s form and profile" submitLabel="Save field"
        onSubmit={() => { setFields((x) => [...x, { id: 'cf' + Date.now(), rec: 'Student', label: 'Uniform size', type: ftype, req: 'No', vis: 'Everyone who can see the record' }]); toast({ title: 'Field added: Uniform size', body: 'Shows on Student profiles and the Add Student form.' }); }}>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4">
          <Field label="Record" required id="cf-r"><Select id="cf-r" value="Student" onChange={() => {}} options={['Student', 'Parent', 'Staff', 'Enquiry', 'Application', 'Visitor']} /></Field>
          <Field label="Type" required id="cf-t"><Select id="cf-t" value={ftype} onChange={setFtype} options={['Text', 'Number', 'Date', 'Choice', 'Yes or no', 'File']} /></Field>
        </div>
        <Field label="Label" required id="cf-l"><Input id="cf-l" defaultValue="Uniform size" /></Field>
        {ftype === 'Choice' && <Field label="Choices" required id="cf-c" hint="One per line"><Textarea id="cf-c" value={'26\n28\n30\n32\n34'} onChange={() => {}} rows={3} /></Field>}
        <Field label="Required"><Segmented value="no" onChange={() => {}} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} /></Field>
        <Field label="Visible to" required id="cf-v"><Select id="cf-v" value="all" onChange={() => {}} options={[{ value: 'all', label: 'Everyone who can see the record' }, { value: 'r', label: 'Restricted: choose roles' }]} /></Field>
      </FormSheet>
    </div>
  );
}
function RuleSheet({ r, onClose, onSave }) {
  const [steps, setSteps] = useState([]);
  const [esc, setEsc] = useState(2);
  React.useEffect(() => { if (r) { setSteps(r.steps.map((s) => ({ ...s }))); setEsc(r.esc); } }, [r]);
  if (!r) return null;
  const bad = steps.findIndex((s) => s.who === 'Bursar');
  const draft = { ...r, steps, esc };
  const set = (i, patch) => setSteps((x) => x.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <Sheet open={!!r} onClose={onClose} title={r.name} sub="Steps run in order. Amounts are per request." wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={bad >= 0 || !steps.length} onClick={() => onSave(draft)}>Save rule</Button></>}>
      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={i} className="rounded-2xl border border-line p-3.5 flex flex-col @md:flex-row gap-3 @md:items-end">
            <span className="w-7 h-7 rounded-full bg-brand text-brandink grid place-items-center text-[12px] font-bold shrink-0 @md:mb-2">{i + 1}</span>
            <Field label="Approver" id={`st-${i}`} className="flex-1" error={s.who === 'Bursar' ? 'No active user has the Bursar role. Pick another approver.' : ''}>
              <Select id={`st-${i}`} value={s.who} onChange={(v) => set(i, { who: v })} options={APPROVERS} error={s.who === 'Bursar'} />
            </Field>
            <Field label="Up to amount" id={`up-${i}`} className="@md:w-40" hint={i === steps.length - 1 ? 'Last step: no limit' : ''}>
              <Input id={`up-${i}`} inputMode="numeric" value={s.upto || ''} placeholder="No limit" onChange={(e) => set(i, { upto: Number(e.target.value.replace(/\D/g, '')) || undefined })} />
            </Field>
            {steps.length > 1 && <Button variant="ghost" icon={I.X} aria-label="Remove step" className="!px-3 self-end" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} />}
          </div>
        ))}
        <Button variant="soft" icon={I.Plus} className="self-start" onClick={() => setSteps((x) => [...x, { who: 'Principal' }])}>Add step</Button>
        <Field label="Escalate after" id="esc" hint="If nobody decides, it goes up one step and both people are told">
          <Select id="esc" value={String(esc)} onChange={(v) => setEsc(Number(v))} options={['1', '2', '3', '5'].map((n) => ({ value: n, label: `${n} working day${n === '1' ? '' : 's'}` }))} />
        </Field>
        <div className="rounded-xl bg-sunken/70 p-3.5 text-[14px]"><p className="eyebrow text-ink3 mb-1">In plain words</p>{ruleText(draft)}</div>
      </div>
    </Sheet>
  );
}

/* =====================================================================
   7. Modules On/Off
   ===================================================================== */
const OPT_DATA = { transport: '6 routes, 9 buses and 251 students on buses', library: '8,412 books, 312 on loan, 1,236 member cards', inventory: '1,148 items, 46 assets, 12 vendors', hostel: '2 hostels, 96 boarders, mess menus' };
const OPT_IDS = Object.keys(MODULES).filter((m) => MODULES[m].optional);
const TEMPLATES = [
  { id: 'cbse-day', name: 'CBSE day school', mods: { transport: true, library: true, inventory: true, hostel: false }, settings: 12 },
  { id: 'cbse-hostel', name: 'CBSE day school with hostel', mods: { transport: true, library: true, inventory: true, hostel: true }, settings: 14 },
  { id: 'state-day', name: 'State board day school', mods: { transport: true, library: true, inventory: false, hostel: false }, settings: 15 },
  { id: 'boarding', name: 'Boarding school', mods: { transport: false, library: true, inventory: true, hostel: true }, settings: 18 },
  { id: 'pre', name: 'Pre-school', mods: { transport: true, library: false, inventory: false, hostel: false }, settings: 9 },
];
const AI_FEATURES = [
  ['Ask and Do', 'Type a question or a job in plain words, with ready-made questions', true], ['Smart Import', 'Matches Excel columns when importing', true],
  ['Auto-reply to enquiries', 'Drafts replies to admission enquiries for a person to send', false], ['Student insights and early warnings', 'Flags falling attendance or marks', true],
  ['Forecasts', 'Fee collection and admissions for the coming months', true], ['Teacher assistant', 'Drafts lesson plans, worksheets and remarks', true],
  ['AI question papers', 'Drafts papers from the syllabus for the teacher to edit', false], ['Translate typed messages', 'Into each parent’s language; the sender checks each one. Labelled “Translated from English”.', false],
];
const INTEGRATIONS = [
  { name: 'Google Workspace', sub: 'Staff sign in with Google · calendars', status: 'Connected', icon: 'Globe' },
  { name: 'Tally Prime', sub: 'Last sync failed 8 Oct, 6:00 PM: ledger “Transport Fee” not found in Tally', status: 'Error', icon: 'Calculator' },
  { name: 'Counter printer', sub: 'Epson TM-T82 at the fee counter', status: 'Connected', icon: 'Printer' },
  { name: 'Attendance devices', sub: '3 face devices (staff room, gates 1 and 2)', status: 'Connected', icon: 'Fingerprint' },
  { name: 'Bus GPS', sub: 'From the Android driver app on 9 buses', status: 'Connected', icon: 'MapPin' },
  { name: 'Microsoft 365', sub: 'Teams classes and Outlook', status: 'Not connected', icon: 'Mail' },
  { name: 'CCTV links', sub: 'View gate cameras from Front Office', status: 'Not connected', icon: 'Cctv' },
  { name: 'Outside learning platform', sub: 'Moodle, Google Classroom', status: 'Not connected', icon: 'GraduationCap' },
  { name: 'Webhooks to other software', sub: 'Send chosen events to the school’s own systems', status: 'Not connected', icon: 'Webhook' },
];

function ModulesPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const { modulesOn, setModule } = useRole();
  const [ask, setAsk] = useState(null);
  const [tpl, setTpl] = useState(false);
  const [pick, setPick] = useState('cbse-hostel');
  const [ai, setAi] = useState(true);
  const [aiRoles, setAiRoles] = useState(new Set(['principal', 'schooladmin', 'accountant', 'teacher', 'classteacher', 'vp', 'academichead', 'officestaff', 'examincharge', 'admissioncounsellor']));
  const [feat, setFeat] = useState(() => Object.fromEntries(AI_FEATURES.map((f) => [f[0], f[2]])));
  const [integ, setInteg] = useState(INTEGRATIONS);
  const isOn = (id) => modulesOn[id] !== false;
  const flip = (id, v) => {
    if (!canEdit) return;
    if (!v) { setAsk(id); return; }
    setModule(id, true);
    toast({ title: `${modLabel(id)} switched on`, body: 'Back in the menu with all its data.', undo: () => setModule(id, false) });
  };
  const t = TEMPLATES.find((x) => x.id === pick);
  const diff = OPT_IDS.filter((m) => t.mods[m] !== isOn(m));
  const core = NAV_ITEMS.filter((it) => !MODULES[it.id]?.optional);
  return (
    <div>
      <ModuleHead sub="Switching a module off hides it from every menu, search and home screen. Its data is kept and returns when you switch it on."
        actions={<Button variant="secondary" icon={I.LayoutTemplate} onClick={() => setTpl(true)}>Start from a template</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Split>
          <Col>
            <Card>
              <CardHead title="Modules you can switch off" sub="Optional modules. Try one: the menu changes at once." icon={I.ToggleRight} />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {OPT_IDS.map((id) => (
                  <li key={id} className="flex items-center gap-3.5 px-5 py-3.5">
                    <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', isOn(id) ? 'bg-brand/10 text-brand' : 'bg-sunken text-ink3')}><Icon name={modIcon(id)} size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px]">{modLabel(id)} <Pill tone={isOn(id) ? 'ok' : 'neutral'} className="!h-5 !text-[11px] ml-1 align-middle">{isOn(id) ? 'On' : 'Off'}</Pill></p>
                      <p className="text-[12.5px] text-ink3">{isOn(id) ? OPT_DATA[id] : `Hidden. ${OPT_DATA[id]} are kept.`}</p>
                    </div>
                    <Switch on={isOn(id)} label={`${modLabel(id)} on or off`} onChange={(v) => flip(id, v)} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Always on" sub="The core of School OS. These cannot be switched off." icon={I.Lock} />
              <div className="px-5 pb-5 grid grid-cols-1 @sm:grid-cols-2 gap-2">
                {core.map((it) => (
                  <button key={it.id} onClick={() => go(it.id)} className="flex items-center gap-2.5 h-11 px-3 rounded-xl bg-sunken/70 hover:bg-sunken text-left text-[13.5px] font-semibold min-w-0">
                    <Icon name={it.icon} size={17} className="text-brand shrink-0" /><span className="truncate">{it.label}</span><I.Lock size={13} className="text-ink3 ml-auto shrink-0" />
                  </button>
                ))}
              </div>
            </Card>
            <SettingsCard title="Optional pages" sub="Pages inside modules that a school can do without" icon={I.SlidersHorizontal} rows={[
              { title: 'Online classes', sub: 'Homework & Learning', on: true }, { title: 'Quizzes', sub: 'Homework & Learning', on: true },
              { title: 'Gallery', sub: 'Events & Calendar · needs photo consent', on: true }, { title: 'Postal & Deliveries', sub: 'Front Office', on: true },
              { title: 'Budget', sub: 'Finance Management', on: false }, { title: 'Recruitment & Appraisal', sub: 'Staff & HR Management', on: true },
            ]} />
          </Col>
          <Col>
            <Card>
              <CardHead title="AI assistant" sub="Suggests and drafts. It never approves, pays, sends or deletes by itself." icon={I.Sparkles}
                action={<Switch on={ai} label="AI assistant" onChange={(v) => { if (!canEdit) return; setAi(v); toast({ title: `AI assistant ${v ? 'switched on' : 'switched off'} for the school`, undo: () => setAi(!v) }); }} />} />
              {ai ? (
                <>
                  <div className="px-5 pb-4 border-t border-line/70 pt-3">
                    <p className="text-[12px] text-ink3 font-semibold mb-2">Roles that may use it</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ROLES.filter((r) => r.id !== 'student').map((r) => {
                        const on = aiRoles.has(r.id);
                        return (
                          <button key={r.id} aria-pressed={on} onClick={() => canEdit && setAiRoles((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })}
                            className={cx('h-8 px-2.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 border transition', on ? 'bg-brand/10 border-brand/25 text-brand' : 'border-line text-ink3 hover:text-ink')}>
                            {on && <I.Check size={13} strokeWidth={3} />}{ROLE_SHORT[r.id]}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[12.5px] text-ink3 mt-2">{aiRoles.size} roles. AI answers only show what that person’s role may see.</p>
                  </div>
                  <ul className="divide-y divide-line/70 border-t border-line/70">
                    {AI_FEATURES.map(([n, s]) => (
                      <li key={n} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">{n}</b><span className="block text-[12.5px] text-ink3 mt-0.5">{s}</span></div>
                        <Switch on={feat[n]} label={n} onChange={(v) => { if (!canEdit) return; setFeat((x) => ({ ...x, [n]: v })); toast({ title: `${n}: ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} />
                      </li>
                    ))}
                  </ul>
                </>
              ) : <p className="px-5 pb-5 text-[14px] text-ink3 border-t border-line/70 pt-3">Off for everyone. Search still finds students and pages; it just does not answer questions or draft text.</p>}
            </Card>
            <SettingsCard title="System preferences" icon={I.Settings2} rows={[
              { title: 'Week starts on', value: 'Monday' }, { title: 'Roll numbers', sub: 'Order in each section', value: 'By first name' },
              { title: '2nd and 4th Saturday holiday', on: true }, { title: 'Photos in lists', sub: 'Small photo next to each name', on: true },
            ]} />
          </Col>
        </Split>

        <Card>
          <CardHead title="Connected tools" sub="Health is checked every 15 minutes" icon={I.Plug} action={<Pill tone={integ.some((x) => x.status === 'Error') ? 'bad' : 'ok'}>{integ.filter((x) => x.status === 'Error').length} with errors</Pill>} />
          <ul className="grid grid-cols-1 @lg:grid-cols-2 px-2 pb-2">
            {integ.map((x) => (
              <li key={x.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', x.status === 'Error' ? 'bg-bad/10 text-bad' : x.status === 'Connected' ? 'bg-ok/10 text-ok' : 'bg-sunken text-ink3')}><Icon name={x.icon} size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px] flex items-center gap-2">{x.name}<Pill tone={STATUS_TONE[x.status]} className="!h-5 !text-[11px]">{x.status}</Pill></p>
                  <p className={cx('text-[12.5px] truncate', x.status === 'Error' ? 'text-bad' : 'text-ink3')}>{x.sub}</p>
                </div>
                {canEdit && (x.status === 'Error' ? <Button size="sm" variant="secondary" onClick={() => { setInteg((l) => l.map((y) => (y.name === x.name ? { ...y, status: 'Connected', sub: 'Synced today, 10:44 AM · 38 receipts sent to Tally' } : y))); toast({ title: 'Tally synced again', body: 'Ledger “Transport Fee” matched to “Transport Fees Received”.' }); }}>Fix</Button>
                  : x.status === 'Connected' ? <Button size="sm" variant="ghost" onClick={() => toast({ title: `${x.name} is working`, body: 'Test finished in 0.6 seconds.' })}>Test</Button>
                    : <Button size="sm" variant="ghost" onClick={() => toast({ title: `Connect ${x.name}`, body: 'Sign in to the other account to link it. Nothing is shared until you allow it.', tone: 'info' })}>Connect</Button>)}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ConfirmSheet open={!!ask} onClose={() => setAsk(null)} danger title={`Switch off ${ask ? modLabel(ask) : ''}?`}
        sub={ask ? `${MODULES[ask].short} will be hidden from the menu, search, home screens and student profiles for everyone. Its data stays (${OPT_DATA[ask]}) and returns when you switch it on.` : ''}
        confirmLabel={`Switch off ${ask ? MODULES[ask].short : ''}`}
        onConfirm={() => { const id = ask; setModule(id, false); toast({ title: `${modLabel(id)} switched off`, body: 'Hidden from every menu. Its data is kept.', undo: () => setModule(id, true) }); }} />

      <Sheet open={tpl} onClose={() => setTpl(false)} title="Start from a school-type template" sub="Switches on the right modules and fills settings you have not set yet"
        footer={<><Button variant="ghost" onClick={() => setTpl(false)}>Cancel</Button><Button variant="primary" disabled={!canEdit} onClick={() => {
          const prev = Object.fromEntries(OPT_IDS.map((m) => [m, isOn(m)]));
          OPT_IDS.forEach((m) => setModule(m, t.mods[m]));
          setTpl(false);
          toast({ title: `Applied: ${t.name}`, body: `${diff.length ? `${diff.length} module${diff.length > 1 ? 's' : ''} changed, ` : ''}${t.settings} settings filled where empty.`, undo: () => OPT_IDS.forEach((m) => setModule(m, prev[m])) });
        }}>Apply template</Button></>}>
        <div className="flex flex-col gap-2">
          {TEMPLATES.map((x) => (
            <button key={x.id} onClick={() => setPick(x.id)} aria-pressed={pick === x.id}
              className={cx('flex items-start gap-3 p-3 rounded-2xl border text-left transition', pick === x.id ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
              <span className={cx('w-5 h-5 mt-0.5 rounded-full border-2 grid place-items-center shrink-0', pick === x.id ? 'border-brand' : 'border-line')}>{pick === x.id && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
              <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{x.name}</span><span className="block text-[12.5px] text-ink3">{OPT_IDS.filter((m) => x.mods[m]).map((m) => MODULES[m].short).join(', ') || 'Core modules only'} · {x.settings} settings</span></span>
            </button>
          ))}
          <Banner tone={diff.length ? 'warn' : 'ok'} className="mt-1">
            {diff.length ? `This will ${[['on', diff.filter((m) => t.mods[m])], ['off', diff.filter((m) => !t.mods[m])]].filter(([, l]) => l.length).map(([w, l]) => `switch ${w} ${l.map((m) => MODULES[m].short).join(l.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1')}`).join(', ')} and fill ${t.settings} settings. Settings you have already set stay as they are.` : `Your modules already match. ${t.settings} settings will be filled where empty.`}
          </Banner>
        </div>
      </Sheet>
    </div>
  );
}

/* =====================================================================
   8. Data Backup & Security
   ===================================================================== */
const AUDIT = [
  { id: 'a1', when: 'Today, 10:31 AM', who: 'Anita Sharma', act: 'Changed', rec: 'Student · Aarav Sharma (SPS/2021/0417)', field: 'Father’s phone', before: '98490 31270', after: '98490 31277', device: 'Chrome on Windows · Office PC' },
  { id: 'a2', when: 'Today, 10:12 AM', who: 'Suresh Babu', act: 'Cancelled', rec: 'Receipt R/26/05102 · Rohan Gupta', field: 'Status', before: 'Posted', after: 'Cancelled · reason: cheque bounced', device: 'Chrome on Windows · Accounts counter' },
  { id: 'a3', when: 'Today, 9:58 AM', who: 'Lakshmi Rao', act: 'Approved', rec: 'Concession · Kavya Rao, 5 A', field: 'Status', before: 'Waiting', after: 'Approved · ₹4,000', device: 'iPhone 14 · School OS app' },
  { id: 'a4', when: 'Today, 9:40 AM', who: 'Anita Sharma', act: 'Changed role', rec: 'User · Ravi Teja', field: 'Roles', before: 'Teacher', after: 'Teacher, Class Teacher (7 B)', device: 'Chrome on Windows · Office PC' },
  { id: 'a5', when: 'Yesterday, 6:15 PM', who: 'Prakash Joshi', act: 'Changed', rec: 'Datesheet · Half-yearly, Class 7', field: 'Mathematics', before: 'Tue 13 Oct', after: 'Wed 14 Oct', device: 'Chrome on Windows · Exam cell' },
  { id: 'a6', when: 'Yesterday, 4:02 PM', who: 'Anita Sharma', act: 'Changed', rec: 'Student · Sneha Rao (new admission)', field: 'Admission no.', before: 'SPS/2026/0981', after: 'SPS/2026/0918', device: 'Chrome on Windows · Office PC' },
  { id: 'a7', when: 'Yesterday, 3:30 PM', who: 'Anita Sharma', act: 'Disabled', rec: 'User · Ravi Kumar', field: 'Status', before: 'Active', after: 'Disabled · signed out on 2 devices', device: 'Chrome on Windows · Office PC' },
  { id: 'a8', when: 'Yesterday, 11:20 AM', who: 'Suresh Babu', act: 'Exported', rec: 'Defaulters list', field: 'Rows', before: '—', after: '61 rows · Excel', device: 'Chrome on Windows · Accounts counter' },
  { id: 'a9', when: '7 Oct, 5:48 PM', who: 'Anita Sharma', act: 'Changed setting', rec: 'Fee Settings · late fee', field: 'Late fee per month', before: '₹200', after: '₹250', device: 'Chrome on Windows · Office PC' },
  { id: 'a10', when: '7 Oct, 9:05 AM', who: 'Ravi Teja', act: 'Corrected', rec: 'Attendance · 7 B, 6 Oct', field: 'Harini Reddy', before: 'Absent', after: 'Late (came 9:20)', device: 'Samsung Galaxy A34 · School OS app' },
];
const DEVICES = [
  { id: 'v1', who: 'Lakshmi Rao', device: 'iPhone 14 · School OS app', place: 'Hyderabad', last: 'Now', kind: 'Smartphone' },
  { id: 'v2', who: 'Lakshmi Rao', device: 'Chrome on Windows', place: 'Principal’s office', last: '9:12 AM', kind: 'Monitor' },
  { id: 'v3', who: 'Anita Sharma', device: 'Chrome on Windows', place: 'Office', last: 'Now', kind: 'Monitor' },
  { id: 'v4', who: 'Suresh Babu', device: 'Chrome on Windows', place: 'Accounts counter', last: '10:38 AM', kind: 'Monitor' },
  { id: 'v5', who: 'Suresh Babu', device: 'Redmi Note 12 · new device', place: 'Hyderabad', last: '8:02 AM', kind: 'Smartphone', isNew: true },
  { id: 'v6', who: 'Ravi Teja', device: 'Samsung Galaxy A34 · School OS app', place: 'Hyderabad', last: '8:52 AM', kind: 'Smartphone' },
  { id: 'v7', who: 'Imran Shaikh', device: 'Vivo Y56 · School OS app', place: 'Hyderabad', last: '9:31 AM', kind: 'Smartphone' },
  { id: 'v8', who: 'Kavitha Nair', device: 'Chrome on Windows', place: 'Front desk', last: '10:20 AM', kind: 'Monitor' },
  { id: 'v9', who: 'Bhaskar Rao', device: 'Gate tablet · School OS app', place: 'Main gate', last: '10:35 AM', kind: 'Tablet' },
  { id: 'v10', who: 'Padma Iyer', device: 'Chrome on Windows', place: 'Library', last: '10:02 AM', kind: 'Monitor' },
  { id: 'v11', who: 'Venkatesh Goud', device: 'Realme 11 · School OS app', place: 'Hyderabad', last: '7:58 AM', kind: 'Smartphone' },
];
const SIGNINS = [
  ['10:40 AM', 'Anita Sharma', 'Signed in', 'Chrome on Windows · Office', 'ok'], ['10:31 AM', 'Lakshmi Rao', 'Signed in · two-step code', 'iPhone 14 · Hyderabad', 'ok'],
  ['9:14 AM', 'Naveen Kumar', 'Wrong password (5th try) · locked 15 minutes', 'Chrome on Android · Hyderabad', 'bad'], ['8:52 AM', 'Ravi Teja', 'Signed in', 'Samsung Galaxy A34 · Hyderabad', 'ok'],
  ['8:02 AM', 'Suresh Babu', 'Signed in from a new device · two-step code', 'Redmi Note 12 · Hyderabad', 'warn'], ['7:58 AM', 'Venkatesh Goud', 'Signed in', 'Realme 11 · Hyderabad', 'ok'],
  ['Yesterday 9:40 PM', 'Unknown', 'Wrong username · 98480 2214', 'Chrome on Windows · Vijayawada', 'bad'],
];
const IMPORTS = [
  { id: 'IMP-0047', what: 'Library books', by: 'Padma Iyer', when: '8 Oct 2026', res: '1,240 added · 12 skipped (error file)', undo: true },
  { id: 'IMP-0046', what: 'Transport stops', by: 'Venkatesh Goud', when: '2 Oct 2026', res: '61 updated', undo: true },
  { id: 'IMP-0045', what: 'Opening fee balances', by: 'Suresh Babu', when: '15 Jun 2026', res: '1,236 updated', undo: false, why: 'Payments were received against these balances' },
  { id: 'IMP-0044', what: 'Students and parents', by: 'Anita Sharma', when: '4 Jun 2026', res: '1,236 added · 6 fixed and imported again', undo: false, why: 'Students already have attendance, fees and marks' },
  { id: 'IMP-0043', what: 'Staff', by: 'Anita Sharma', when: '2 Jun 2026', res: '84 added', undo: false, why: 'Staff are signed in and have attendance' },
];
const EXPORTS = [
  ['Yesterday, 11:20 AM', 'Suresh Babu', 'Defaulters list', '61 rows · Excel'], ['7 Oct, 4:10 PM', 'Anita Sharma', 'Student list (all classes)', '1,236 rows · Excel · flagged as a large export'],
  ['6 Oct, 12:02 PM', 'Lakshmi Rao', 'Fee collection report, September', 'PDF'], ['3 Oct, 5:30 PM', 'Shalini Verma', 'Staff attendance, September', '86 rows · Excel'],
  ['1 Sep, 6:00 PM', 'Anita Sharma', 'All school data', 'Full download · link expired 2 Sep'],
];
const CONSENTS = [
  { id: 'dpdp', name: 'Data processing (DPDP Act 2023)', ver: 2, given: 1194, not: 42, wd: 0 },
  { id: 'photo', name: 'Photo consent (gallery and social media)', ver: 3, given: 1102, not: 118, wd: 16 },
  { id: 'apaar', name: 'APAAR ID consent', ver: 1, given: 1009, not: 227, wd: 0 },
  { id: 'msg', name: 'WhatsApp message opt-in', ver: 1, given: 1221, not: 15, wd: 0 },
];
const DELETIONS = [
  { id: 'DEL-0009', who: 'Swathi Varma (enquiry, Nursery 2027–28)', what: 'All personal data', asked: 'By the parent on WhatsApp, 6 Oct', status: 'Waiting', note: 'Needs approval from the Principal' },
  { id: 'DEL-0008', who: 'Varun Joshi (left in 2023)', what: 'Photos and phone numbers', asked: 'By the father by email, 22 Sep', status: 'Done', note: 'Approved by Lakshmi Rao on 28 Sep · removed 29 Sep' },
  { id: 'DEL-0007', who: 'Ramesh K. (former driver)', what: 'All personal data except salary records', asked: 'By letter, 2 Sep', status: 'Done', note: 'Approved 5 Sep · salary kept 8 years by law' },
];

function SecurityPage() {
  const canEdit = useCanEdit();
  const toast = useToast();
  const { go } = useNav();
  const [tab, setTab] = useState('backup');
  const [exportAll, setExportAll] = useState(false);
  const [restore, setRestore] = useState(false);
  const [audit, setAudit] = useState(null);
  const [aq, setAq] = useState('');
  const [aw, setAw] = useState('all');
  const [devices, setDevices] = useState(DEVICES);
  const [dsel, setDsel] = useState(new Set());
  const [dq, setDq] = useState('');
  const [imports, setImports] = useState(IMPORTS);
  const [undoImp, setUndoImp] = useState(null);
  const [del, setDel] = useState(false);
  const [dels, setDels] = useState(DELETIONS);
  const [consentText, setConsentText] = useState(null);
  const [ask, setAsk] = useState(null);
  const [consents, setConsents] = useState(CONSENTS);
  const [runImp, setRunImp] = useState(false);
  const arows = AUDIT.filter((a) => (aw === 'all' || a.who === aw) && (!aq || `${a.rec} ${a.field} ${a.before} ${a.after}`.toLowerCase().includes(aq.toLowerCase())));
  const drows = devices.filter((d) => !dq || d.who.toLowerCase().includes(dq.toLowerCase()) || d.device.toLowerCase().includes(dq.toLowerCase()));
  const signOutDev = (d) => { setDevices((x) => x.filter((y) => y.id !== d.id)); toast({ title: `${d.who} signed out on ${d.device.split(' · ')[0]}`, body: 'They need their password to sign in there again.', undo: () => setDevices((x) => [...x, d]) }); };
  return (
    <div>
      <ModuleHead sub="Backups, who changed what, sign-ins, imports and privacy requests. Server backups are run by DREAM TEAM."
        actions={<Button variant="secondary" icon={I.Download} onClick={() => setExportAll(true)}>Export all school data</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Last backup', value: 'Today, 2:00 AM', sub: 'plus every change since', tone: 'ok', icon: 'DatabaseBackup', onClick: () => setTab('backup') },
          { label: 'Restore test', value: 'Passed 1 Oct', sub: 'tested every month', icon: 'RotateCcw', onClick: () => setTab('backup') },
          { label: 'Security alerts', value: '2 new', sub: 'new device, locked login', tone: 'warn', icon: 'ShieldAlert', onClick: () => setTab('signins') },
          { label: 'Data consent', value: '1,194 / 1,236', sub: '42 guardians have not given it', icon: 'BadgeCheck', onClick: () => setTab('privacy') },
        ]} />
        <Chips value={tab} onChange={setTab} options={[{ value: 'backup', label: 'Backups' }, { value: 'audit', label: 'Audit log' }, { value: 'signins', label: 'Sign-ins and devices' }, { value: 'imports', label: 'Imports and exports' }, { value: 'privacy', label: 'Privacy and consent' }]} />

        {tab === 'backup' && (
          <Split>
            <Col>
              <Card>
                <CardHead title="Backups" sub="Nothing to do here: they run by themselves" icon={I.DatabaseBackup} action={<Pill tone="ok" dot>Healthy</Pill>} />
                <div className="px-5 pb-4 flex items-center gap-4">
                  <Ring value={100} size={64} tone="ok"><I.Check size={24} className="text-ok" strokeWidth={2.6} /></Ring>
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-[22px] leading-tight">Last backup: today, 2:00 AM</p>
                    <p className="text-[13px] text-ink3">Full copy every night, and every change saved as it happens</p>
                  </div>
                </div>
                <div className="px-5 pb-5 grid @sm:grid-cols-2 gap-x-6 border-t border-line/70 pt-2">
                  <KV k="Can go back to" v="Any moment in the last 7 days" />
                  <KV k="Nightly copies kept" v="30 days" />
                  <KV k="Monthly copies kept" v="1 year" />
                  <KV k="Where" v="Two separate places in India" />
                  <KV k="Most data that can be lost" v="15 minutes" />
                  <KV k="Back within" v="4 hours after a major failure" />
                </div>
              </Card>
              <Card>
                <CardHead title="Recent backups" icon={I.History} />
                <div className="px-5 pb-1">
                  <Timeline items={[
                    { when: 'Today, 2:00 AM · 4.8 GB · 12 minutes', what: 'Nightly full copy finished', icon: 'CircleCheck', tone: 'ok' },
                    { when: 'Yesterday, 2:00 AM · 4.8 GB', what: 'Nightly full copy finished', icon: 'CircleCheck', tone: 'ok' },
                    { when: '7 Oct, 2:00 AM · 4.7 GB', what: 'Nightly full copy finished', icon: 'CircleCheck', tone: 'ok' },
                    { when: '1 Oct, 3:10 AM · 38 minutes', what: 'Monthly restore test passed: 1,236 students and 41,602 fee payments matched', icon: 'RotateCcw', tone: 'brand' },
                  ]} />
                </div>
              </Card>
            </Col>
            <Col>
              <Card>
                <CardHead title="Restore tests" sub="A copy is restored every month and checked" icon={I.RotateCcw} />
                <ul className="divide-y divide-line/70 border-t border-line/70">
                  {[['1 Oct 2026', '38 minutes'], ['1 Sep 2026', '35 minutes'], ['1 Aug 2026', '41 minutes']].map(([d, t]) => (
                    <li key={d} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]"><span><b className="font-semibold">{d}</b><span className="text-ink3"> · {t}</span></span><Pill tone="ok">Passed</Pill></li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHead title="Request a restore" icon={I.LifeBuoy} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  <p className="text-[14px] text-ink2">Something deleted or changed by mistake? DREAM TEAM can bring back this school’s data as it was at a moment you choose, without touching other schools.</p>
                  {canEdit && <Button variant="secondary" icon={I.RotateCcw} onClick={() => setRestore(true)}>Request a restore</Button>}
                </div>
              </Card>
              <Card>
                <CardHead title="Download all school data" icon={I.Download} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  <p className="text-[14px] text-ink2">Every record and file in one download. It is prepared in the background; the link comes as a notification and works for 24 hours.</p>
                  <p className="text-[12.5px] text-ink3">Last full download: 1 Sep 2026 by Anita Sharma</p>
                  <Button variant="secondary" icon={I.Download} onClick={() => setExportAll(true)}>Export all school data</Button>
                </div>
              </Card>
            </Col>
          </Split>
        )}

        {tab === 'audit' && (
          <Split>
            <Card className="overflow-hidden min-w-0">
              <Toolbar>
                <SearchBox id="audit-search" value={aq} onChange={setAq} placeholder="Record, field or value, like SPS/2021/0417" />
                <Select id="audit-who" value={aw} onChange={setAw} className="@md:w-48" options={[{ value: 'all', label: 'Everyone' }, ...[...new Set(AUDIT.map((a) => a.who))].map((w) => ({ value: w, label: w }))]} />
                <ExportButton what="audit log" />
              </Toolbar>
              <DataList rows={arows} onRow={setAudit} minWidth={900} footer={`Showing ${arows.length} of 18,406 entries this year`}
                columns={[
                  { key: 'when', label: 'When', nowrap: true, render: (a) => <span className="text-[13px] text-ink2">{a.when}</span> },
                  { key: 'who', label: 'Who', nowrap: true, render: (a) => <span className="flex items-center gap-2"><Avatar name={a.who} size={26} />{a.who}</span> },
                  { key: 'act', label: 'Action', render: (a) => <Pill tone={a.act === 'Cancelled' || a.act === 'Disabled' ? 'bad' : a.act === 'Exported' ? 'info' : a.act === 'Approved' ? 'ok' : 'neutral'} className="!h-5 !text-[11px]">{a.act}</Pill> },
                  { key: 'rec', label: 'Record', render: (a) => <span className="text-[13px]">{a.rec}<span className="block text-ink3 text-[12px]">{a.field}</span></span> },
                  { key: 'chg', label: 'Before → after', render: (a) => <span className="text-[13px]"><span className="text-ink3 line-through">{a.before}</span> <I.ArrowRight size={12} className="inline text-ink3" /> <b className="font-semibold">{a.after}</b></span> },
                ]}
                mobile={(a) => ({ avatar: a.who, title: `${a.act}: ${a.rec}`, sub: `${a.who} · ${a.when}`, pills: [<span key="c" className="text-[12.5px]"><span className="text-ink3 line-through">{a.before}</span> → <b className="font-semibold">{a.after}</b></span>] })} />
            </Card>
            <Card className="min-w-0">
              <CardHead title="Security alerts" sub="Unusual sign-ins and large exports" icon={I.ShieldAlert} action={<Pill tone="warn">2 new</Pill>} />
              <ul className="px-3 pb-3 flex flex-col gap-1">
                {[['warn', 'New device for Suresh Babu', 'Redmi Note 12 · Hyderabad · today 8:02 AM', 'It was him', 'Sign out that device'],
                  ['bad', '5 wrong passwords for Naveen Kumar', 'Locked 15 minutes · today 9:14 AM', 'Mark as seen', 'Reset password'],
                  ['info', 'Large export: Student list (1,236 rows)', 'Anita Sharma · 7 Oct, 4:10 PM', 'Mark as seen', null]].map(([tone, t, s, a1, a2]) => (
                  <li key={t} className="p-2.5 rounded-xl hover:bg-sunken/70">
                    <div className="flex items-start gap-3">
                      <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', TONE_SOFT[tone])}><I.ShieldAlert size={17} /></span>
                      <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold leading-snug">{t}</p><p className="text-[12.5px] text-ink3">{s}</p></div>
                    </div>
                    <div className="flex gap-2 mt-2 pl-12 flex-wrap">
                      <Button size="sm" variant="soft" onClick={() => toast({ title: 'Marked as seen', body: t })}>{a1}</Button>
                      {a2 && <Button size="sm" variant="ghost" onClick={() => toast({ title: a2 === 'Reset password' ? 'Reset link sent to Naveen Kumar' : 'Redmi Note 12 signed out', body: 'Recorded in the audit log.' })}>{a2}</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </Split>
        )}

        {tab === 'signins' && (
          <div className="flex flex-col gap-5 @lg:gap-6">
            <Card className="overflow-hidden">
              <CardHead title="Signed-in devices" sub="Every staff login that is signed in right now" icon={I.MonitorSmartphone} action={<Pill tone="neutral">{devices.length} shown of 143</Pill>} />
              <Toolbar className="border-t">
                <SearchBox id="dev-search" value={dq} onChange={setDq} placeholder="Person or device" />
              </Toolbar>
              <BulkBar count={dsel.size} onClear={() => setDsel(new Set())}>
                <Button size="sm" variant="dangerSoft" icon={I.LogOut} onClick={() => { const n = dsel.size; setDevices((x) => x.filter((d) => !dsel.has(d.id))); setDsel(new Set()); toast({ title: `Signed out on ${n} devices` }); }}>Sign out selected</Button>
              </BulkBar>
              <DataList rows={drows} select={canEdit ? [dsel, setDsel] : null} minWidth={720} footer={`${drows.length} devices`}
                columns={[
                  { key: 'who', label: 'Person', nowrap: true, render: (d) => <span className="flex items-center gap-2.5"><Avatar name={d.who} size={30} /><b className="font-semibold">{d.who}</b></span> },
                  { key: 'device', label: 'Device', render: (d) => <span className="flex items-center gap-2"><Icon name={d.kind} size={16} className="text-ink3" />{d.device}{d.isNew && <Pill tone="warn" className="!h-5 !text-[11px]">New</Pill>}</span> },
                  { key: 'place', label: 'Place' }, { key: 'last', label: 'Last used', nowrap: true },
                  { key: 'a', label: '', render: (d) => canEdit && <Button size="sm" variant="ghost" icon={I.LogOut} onClick={() => signOutDev(d)}>Sign out</Button> },
                ]}
                mobile={(d) => ({ icon: d.kind, title: d.who, sub: `${d.device} · ${d.place}`, pills: d.isNew ? [<Pill key="n" tone="warn" className="!h-5 !text-[11px]">New device</Pill>] : null, right: canEdit ? <Button size="sm" variant="ghost" onClick={() => signOutDev(d)}>Sign out</Button> : <span className="text-[12px] text-ink3">{d.last}</span> })} />
            </Card>
            <Card className="overflow-hidden">
              <CardHead title="Sign-in history" sub="Today and yesterday · failed tries are kept too" icon={I.History} action={<ExportButton what="sign-in history" />} />
              <DataList rows={SIGNINS.map((s, i) => ({ id: i, when: s[0], who: s[1], res: s[2], dev: s[3], tone: s[4] }))} minWidth={760} footer="Showing 7 of 412 this week"
                columns={[
                  { key: 'when', label: 'When', nowrap: true }, { key: 'who', label: 'Person', nowrap: true, render: (s) => <b className="font-semibold">{s.who}</b> },
                  { key: 'res', label: 'Result', render: (s) => <span className={cx('inline-flex items-center gap-1.5', s.tone === 'bad' ? 'text-bad' : s.tone === 'warn' ? 'text-warn' : 'text-ink2')}>{s.tone === 'ok' ? <I.CircleCheck size={15} className="text-ok" /> : <I.TriangleAlert size={15} />}{s.res}</span> },
                  { key: 'dev', label: 'Device and place', render: (s) => <span className="text-ink2 text-[13px]">{s.dev}</span> },
                ]}
                mobile={(s) => ({ icon: s.tone === 'ok' ? 'CircleCheck' : 'TriangleAlert', iconTone: s.tone, title: `${s.who} · ${s.when}`, sub: s.res, pills: [<span key="d" className="text-[12px] text-ink3">{s.dev}</span>] })} />
            </Card>
          </div>
        )}

        {tab === 'imports' && (
          <div className="flex flex-col gap-5 @lg:gap-6">
            <Card className="overflow-hidden">
              <CardHead title="Import history" sub="Every Import button in School OS uses this importer. A whole import can be undone while nothing depends on it." icon={I.FileUp}
                action={canEdit && <Button size="sm" variant="soft" icon={I.Upload} onClick={() => setRunImp(true)}>Run an import</Button>} />
              <DataList rows={imports} minWidth={820} footer={`${imports.length} imports this year`}
                columns={[
                  { key: 'id', label: 'Import', nowrap: true, render: (m) => <span><b className="font-semibold">{m.what}</b><span className="block font-mono text-[12px] text-ink3">{m.id}</span></span> },
                  { key: 'by', label: 'By', nowrap: true, render: (m) => <span>{m.by}<span className="block text-[12px] text-ink3">{m.when}</span></span> },
                  { key: 'res', label: 'Result', render: (m) => <span className="text-[13px]">{m.undone ? <Pill tone="neutral">Undone today</Pill> : m.res}</span> },
                  { key: 'u', label: '', render: (m) => (m.undone ? null : m.undo ? (canEdit && <Button size="sm" variant="secondary" icon={I.Undo2} onClick={() => setUndoImp(m)}>Undo import</Button>) : <span className="text-[12px] text-ink3 block max-w-[220px]">Cannot undo: {m.why.toLowerCase()}</span>) },
                ]}
                mobile={(m) => ({ icon: 'FileUp', title: m.what, sub: `${m.id} · ${m.by} · ${m.when}`, pills: [<span key="r" className="text-[12.5px] text-ink2">{m.undone ? 'Undone today' : m.res}</span>], right: !m.undone && m.undo && canEdit ? <Button size="sm" variant="secondary" onClick={() => setUndoImp(m)}>Undo</Button> : null })} />
            </Card>
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
              <Card>
                <CardHead title="Import templates" sub="Download, fill in Excel, then import" icon={I.FileSpreadsheet} />
                <ul className="grid grid-cols-1 @sm:grid-cols-2 px-2 pb-2">
                  {['Students and parents', 'Staff', 'Opening fee balances', 'Library books', 'Inventory items', 'Marks', 'Transport stops', 'Enquiries'].map((t) => (
                    <li key={t}><button onClick={() => toast({ title: `Downloaded: ${t} template`, body: `${t.toLowerCase().replace(/\s/g, '-')}-template.xlsx` })} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left text-[14px] font-medium"><I.FileSpreadsheet size={17} className="text-ok shrink-0" /><span className="truncate flex-1">{t}</span><I.Download size={15} className="text-ink3 shrink-0" /></button></li>
                  ))}
                </ul>
              </Card>
              <Card className="overflow-hidden">
                <CardHead title="Export log" sub="Who downloaded what" icon={I.FileDown} />
                <ul className="divide-y divide-line/70 border-t border-line/70">
                  {EXPORTS.map(([w, who, what, d]) => (
                    <li key={w + what} className="px-5 py-3">
                      <p className="text-[14px]"><b className="font-semibold">{who}</b> exported {what}</p>
                      <p className={cx('text-[12.5px]', d.includes('flagged') ? 'text-warn' : 'text-ink3')}>{w} · {d}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}

        {tab === 'privacy' && (
          <div className="flex flex-col gap-5 @lg:gap-6">
            <Card>
              <CardHead title="Parent consent (DPDP Act 2023)" sub="Guardians agree on the admission form or through Parent Link, confirmed by a code to their mobile" icon={I.BadgeCheck} />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {consents.map((c) => {
                  const total = c.given + c.not;
                  return (
                    <li key={c.id} className="px-5 py-4 flex flex-col @lg:flex-row @lg:items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px]">{c.name} <span className="text-ink3 font-normal text-[13px]">· text version {c.ver}</span></p>
                        <Progress value={(c.given / total) * 100} tone={c.not > 100 ? 'warn' : 'ok'} className="mt-2 max-w-md" />
                        <p className="text-[12.5px] text-ink3 mt-1.5 tnum">{c.given.toLocaleString('en-IN')} given · {c.not} not given{c.wd ? ` · ${c.wd} withdrawn` : ''}</p>
                      </div>
                      {canEdit && (
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setConsentText(c)}>Edit text</Button>
                          <Button size="sm" variant="soft" icon={I.Send} onClick={() => setAsk(c)}>Ask {c.not} guardians</Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
              <Card>
                <CardHead title="Recent consent entries" sub="A withdrawal is a new entry, never an edit" icon={I.ScrollText} action={<button onClick={() => go('students', { page: 'parents' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Guardians</button>} />
                <div className="px-5 pb-1">
                  <Timeline items={[
                    { when: '3 Oct · by letter · recorded by Anita Sharma', what: 'Kumar Reddy withdrew photo consent for Harini Reddy (7 B). She is left out of shared photos.', icon: 'CircleX', tone: 'bad' },
                    { when: '28 Sep · Parent Link · code to 98495 60211', what: 'Priya Sharma agreed to photo consent version 3 for Aarav and Anaya', icon: 'CircleCheck', tone: 'ok' },
                    { when: '12 Jun · admission form · code to 98491 22760', what: 'Lavanya Rao agreed to data processing version 2 for Ishaan Rao (LKG A)', icon: 'CircleCheck', tone: 'ok' },
                  ]} />
                </div>
              </Card>
              <Card>
                <CardHead title="Data deletion requests" sub="Nothing is removed until the request is approved" icon={I.Trash2}
                  action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setDel(true)}>Record</Button>} />
                <ul className="px-2 pb-2">
                  {dels.map((d) => (
                    <li key={d.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', d.status === 'Done' ? 'bg-ok/10 text-ok' : 'bg-warn/12 text-warn')}>{d.status === 'Done' ? <I.CircleCheck size={18} /> : <I.Hourglass size={18} />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px]">{d.who}</p>
                        <p className="text-[12.5px] text-ink3">{d.what} · {d.asked}</p>
                        <p className="text-[12.5px] text-ink2 mt-0.5"><span className="font-mono text-[11.5px] text-ink3">{d.id}</span> · {d.note}</p>
                      </div>
                      <Pill tone={d.status === 'Done' ? 'ok' : 'warn'} className="!h-5 !text-[11px] shrink-0">{d.status === 'Done' ? 'Approved · done' : 'Needs approval'}</Pill>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHead title="How long data is kept" sub="Past its period, data is listed for your approval before removal" icon={I.Clock} />
                <ul className="divide-y divide-line/70 border-t border-line/70">
                  {[['Student records, results, certificates', 'While the school uses School OS'], ['Fee, salary and finance records', '8 years'], ['Audit log', '8 years'], ['Enquiries that did not join', '2 years'], ['Visitor photos and gate entries', '1 year'], ['Message history', '3 years']].map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13.5px]"><span className="min-w-0">{k}</span><b className="font-semibold text-right shrink-0">{v}</b></li>
                  ))}
                </ul>
                <div className="px-5 py-3 border-t border-line/70 flex items-center gap-3 flex-wrap">
                  <p className="text-[13px] text-ink2 flex-1 min-w-[180px]">214 visitor photos are older than 1 year.</p>
                  {canEdit && <Button size="sm" variant="secondary" onClick={() => go('approvals')}>Review</Button>}
                </div>
              </Card>
              <Card>
                <CardHead title="One person’s data" sub="When a parent or staff member asks for a copy" icon={I.UserCheck} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  <p className="text-[14px] text-ink2">Makes a file with everything School OS keeps about one person: profile, fees, attendance, marks, messages and consent records.</p>
                  <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Preparing Priya Sharma’s data', body: 'You get a notification with the link. Logged in the export log.' })}>Export one person’s data</Button>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      <ConfirmSheet open={exportAll} onClose={() => setExportAll(false)} title="Export all school data?" typeToConfirm="Sunrise Public School"
        sub="Every record and file of Sunrise Public School is put into one download (about 4.8 GB). It is prepared in the background; you get a notification with a link that works for 24 hours. This is logged and every School Admin is told."
        confirmLabel="Prepare the download" onConfirm={() => toast({ title: 'Preparing the full download', body: 'About 20 minutes. The link comes as a notification.' })} />
      <FormSheet open={restore} onClose={() => setRestore(false)} title="Request a restore" sub="Goes to DREAM TEAM support. They call you before anything is restored." submitLabel="Send request" busyLabel="Sending…"
        onSubmit={() => toast({ title: 'Restore request sent: SUP-2291', body: 'DREAM TEAM will call Anita Sharma on 98490 11223 before restoring.' })}>
        <Field label="What went wrong" required id="rs-what"><Textarea id="rs-what" value="Fee concessions for Class 4 were removed by mistake during an import on 8 Oct." onChange={() => {}} rows={3} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bring back data as it was on" required id="rs-date"><Input id="rs-date" defaultValue="08-10-2026" /></Field>
          <Field label="At" required id="rs-time"><Input id="rs-time" defaultValue="11:00 AM" /></Field>
        </div>
        <Field label="What to restore"><Segmented value="some" onChange={() => {}} options={[{ value: 'some', label: 'Only some records' }, { value: 'all', label: 'Whole school' }]} /></Field>
        <p className="text-[12.5px] text-ink3">Restoring brings back only this school’s data. Changes made after that moment to the same records are listed for you first.</p>
      </FormSheet>
      <ConfirmSheet open={!!undoImp} onClose={() => setUndoImp(null)} danger title={`Undo import ${undoImp?.id || ''}?`}
        sub={undoImp ? `${undoImp.what} by ${undoImp.by} on ${undoImp.when}: ${undoImp.res.split(' · ')[0]} will be reversed. Records it added are archived; values it changed go back. Nothing else changes.` : ''}
        confirmLabel="Undo whole import" onConfirm={() => { const m = undoImp; setImports((x) => x.map((y) => (y.id === m.id ? { ...y, undone: true } : y))); toast({ title: `Import ${m.id} undone`, body: m.res.split(' · ')[0] + ' reversed. Logged in the audit log.' }); }} />
      <Sheet open={runImp} onClose={() => setRunImp(false)} title="Run an import" sub="Students and parents · new admissions 2026–27" wide
        footer={<><Button variant="ghost" onClick={() => setRunImp(false)}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setRunImp(false); setImports((x) => [{ id: 'IMP-0048', what: 'Students and parents (new admissions)', by: 'Anita Sharma', when: '9 Oct 2026', res: '48 added · 2 skipped (error file)', undo: true }, ...x]); toast({ title: '48 students imported, 2 skipped', body: 'Download the 2 rows with their errors, fix and import them again.' }); }}>Import 48 good rows</Button></>}>
        <div className="flex flex-col gap-4">
          <ol className="flex flex-wrap gap-1.5 text-[12.5px]">
            {['Template', 'Upload', 'Match columns', 'Preview', 'Import', 'Summary'].map((s, i) => (
              <li key={s} className={cx('h-7 px-2.5 rounded-lg inline-flex items-center gap-1.5 font-semibold', i < 3 ? 'bg-ok/10 text-ok' : i === 3 ? 'bg-brand text-brandink' : 'bg-sunken text-ink3')}>{i < 3 ? <I.Check size={13} strokeWidth={3} /> : <span className="tnum">{i + 1}</span>}{s}</li>
            ))}
          </ol>
          <Banner tone="warn" title="48 rows ready, 2 with problems.">Only the good rows are imported. You can undo the whole import from the history.</Banner>
          <ul className="rounded-xl border border-line divide-y divide-line/70 text-[13.5px]">
            <li className="px-3.5 py-2.5 flex gap-3"><span className="font-mono text-ink3 w-14 shrink-0">Row 17</span><span>Kiran Goud · <span className="text-bad">Parent phone has 9 digits (98490 3127)</span></span></li>
            <li className="px-3.5 py-2.5 flex gap-3"><span className="font-mono text-ink3 w-14 shrink-0">Row 33</span><span>Meghana Rao · <span className="text-bad">Class “7 D” does not exist. Did you mean 7 B?</span></span></li>
          </ul>
          <p className="text-[12.5px] text-ink3">File: new-admissions-oct.xlsx · 50 rows · 14 columns matched by name</p>
        </div>
      </Sheet>
      <FormSheet open={del} onClose={() => setDel(false)} title="Record a data deletion request" sub="It goes to Approvals. Nothing is deleted until it is approved." submitLabel="Send for approval"
        onSubmit={() => { setDels((x) => [{ id: 'DEL-0010', who: 'Tejas Patel (left in 2024)', what: 'All personal data', asked: 'By the mother by email, today', status: 'Waiting', note: 'Needs approval from the Principal' }, ...x]); toast({ title: 'Request DEL-0010 sent to Approvals', body: 'Nothing is deleted until it is approved.' }); }}>
        <Field label="Person" required id="dl-who" hint="Student, parent or staff"><Input id="dl-who" defaultValue="Tejas Patel (SPS/2018/0233)" /></Field>
        <Field label="What to delete" required id="dl-what"><Select id="dl-what" value="all" onChange={() => {}} options={[{ value: 'all', label: 'All personal data' }, { value: 'some', label: 'Chosen parts' }]} /></Field>
        <Field label="Reason and who asked" required id="dl-why"><Textarea id="dl-why" value="Mother asked by email after the family moved abroad." onChange={() => {}} rows={2} /></Field>
        <Field label="Proof" hint="Letter or email, optional">
          <button type="button" onClick={() => toast({ title: 'email-request.pdf attached', tone: 'info' })} className="h-11 rounded-xl border border-dashed border-line hover:bg-sunken text-[14px] text-ink3 inline-flex items-center justify-center gap-2"><I.Paperclip size={16} />Attach a file</button>
        </Field>
        <p className="text-[12.5px] text-ink3">Fee and salary records are kept 8 years by law even when a deletion is approved; the rest is removed or made anonymous.</p>
      </FormSheet>
      <FormSheet open={!!consentText} onClose={() => setConsentText(null)} title={`Edit: ${consentText?.name || ''}`} sub={`Saving makes version ${(consentText?.ver || 0) + 1}. Guardians who agreed keep the version they agreed to.`} submitLabel={`Save version ${(consentText?.ver || 0) + 1}`}
        onSubmit={() => { const c = consentText; setConsents((x) => x.map((y) => (y.id === c.id ? { ...y, ver: y.ver + 1 } : y))); toast({ title: `Version ${c.ver + 1} saved`, body: `${c.given.toLocaleString('en-IN')} guardians agreed to version ${c.ver}. You can ask them to agree again.` }); }}>
        <Field label="Language" id="ct-lang"><Segmented value="en" onChange={() => {}} options={[{ value: 'en', label: 'English' }, { value: 'te', label: 'Telugu' }, { value: 'hi', label: 'Hindi' }]} /></Field>
        <Field label="Text" required id="ct-text"><Textarea id="ct-text" rows={5} onChange={() => {}} value={consentText?.id === 'photo' ? 'I agree that photos and videos of my child taken at school events may be shown in the school gallery on Parent Link and on the school’s social media pages. I can withdraw this at any time.' : 'I agree that Sunrise Public School may keep and use my child’s details for admission, studies, fees, safety and messages to me, as explained in the school’s privacy notice. I can withdraw this at any time.'} /></Field>
        <ToggleRowLite title="Asked on the admission form" on />
      </FormSheet>
      <ConfirmSheet open={!!ask} onClose={() => setAsk(null)} title={`Ask ${ask?.not || ''} guardians for ${ask?.name.split(' (')[0].toLowerCase() || ''}?`}
        sub="Each guardian gets a WhatsApp message with their Parent Link. They read the text and agree with a code to their mobile."
        confirmLabel={`Send to ${ask?.not || ''} guardians`} onConfirm={() => toast({ title: `Consent request sent to ${ask.not} guardians`, body: 'WhatsApp, with SMS backup. Answers show here as they come in.' })} />
    </div>
  );
}

export const SETTINGS_PAGES = {
  profile: ProfilePage, users: UsersPage, gateways: GatewaysPage, messaging: MessagingPage,
  designs: DesignsPage, forms: FormsPage, modules: ModulesPage, security: SecurityPage,
};
