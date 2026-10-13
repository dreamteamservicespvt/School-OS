// Student Management: parents, behaviour and counselling, promotion, leaving and alumni, certificates and ID cards, settings.
// The Student List and Student Profile live in students.jsx. All data here is example data.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, CLASS_7B, FEATURED, inr } from './data.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Input, Field, Segmented, Tabs, Empty, Sheet, Switch, Checkbox, useToast } from './ui.jsx';
import { useNav, useRole, canDo, canOpen } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Icon, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingRow, ToggleRow, SettingsCard,
  Banner, Progress, HBars, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton,
  DatePeriod, PERIODS, fmtRange,
} from './kit.jsx';
import { inMenu } from './config.js';
// "9 Oct 2026" or "9 Oct" to "2026-10-09", for the date filter
const MONS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoOf = (t) => { const m = /(\d{1,2}) (\w{3})(?: (\d{4}))?/.exec(t || ''); return m ? `${m[3] || 2026}-${String(MONS[m[2]]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const inPeriod = (t, per) => { const d = isoOf(t); return d >= per.from && d <= per.to; };

/* ======================= Helpers and sample data ======================= */
const lab = (s) => (s.cls.startsWith('Class ') ? `${s.cls.slice(6)} ${s.sec}` : `${s.cls} ${s.sec}`);
const inClass = (id, sec) => STUDENTS.filter((s) => s.clsId === id && s.sec === sec);
const pickS = (id, sec, i = 0) => inClass(id, sec)[i] || inClass(id, sec)[0] || STUDENTS[0];
const BackLink = ({ onClick, label, sub }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
    <I.ArrowLeft size={17} />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
  </button>
);
const PRIVATE = 'Private: counselling note (only the counsellor can read this)';
const PrivateNote = ({ className }) => (
  <span className={cx('inline-flex items-center gap-1.5 text-[13px] text-ink3 italic', className)}><I.Lock size={13} className="shrink-0 not-italic" />{PRIVATE}</span>
);
const SubHead = ({ children }) => <p className="eyebrow text-ink3 -mb-1 pt-1">{children}</p>;

/* ---------- Guardians ---------- */
const OCC = ['Software engineer', 'Business', 'Doctor', 'Bank officer', 'Teacher', 'Govt. employee', 'Pharmacist', 'Civil contractor', 'Chartered accountant', 'Sales manager'];
const kid = (s) => ({ id: s.id, name: s.name, label: lab(s) });
const GUARDIANS = [
  { id: 'G0001', name: 'Priya Sharma', rel: 'Mother', phone: '98495 60211', email: 'priya.sharma@gmail.com', job: 'Teacher', kids: [kid(FEATURED), { id: null, name: 'Anaya Sharma', label: 'UKG A' }], optOut: false, consent: 'Given', photo: 'Given', link: 'Active', opened: 'Today, 7:58 AM', primary: true },
  { id: 'G0002', name: 'Rajesh Sharma', rel: 'Father', phone: '98490 31277', email: 'rajesh.s@infosys.com', job: 'Software engineer', kids: [kid(FEATURED), { id: null, name: 'Anaya Sharma', label: 'UKG A' }], optOut: false, consent: 'Given', photo: 'Given', link: 'Active', opened: '6 Oct, 9:12 PM' },
  { id: 'G0003', name: 'Vikram Naidu', rel: 'Father', phone: '99491 20573', email: '', job: 'Business', kids: [kid(pickS('3', 'A', 1))], optOut: false, consent: 'Not given', photo: 'Not given', link: 'Revoked', opened: null, custody: 'Court order, March 2025: no pickup and no contact at school. Mother is the only authorised guardian.' },
  ...STUDENTS.filter((s, i) => i % 9 === 4 && s.id !== FEATURED.id).slice(0, 15).map((s, i) => ({
    id: 'G' + String(1004 + i).padStart(4, '0'), name: s.father, rel: 'Father', phone: s.phone, email: '', job: OCC[i % OCC.length], kids: [kid(s)],
    optOut: i === 5, consent: i % 6 === 2 ? 'Not given' : i === 9 ? 'Withdrawn' : 'Given', photo: i % 5 === 1 ? 'Not given' : i === 9 ? 'Withdrawn' : 'Given',
    link: i % 6 === 2 ? 'Not sent' : i === 11 ? 'Revoked' : 'Active', opened: i % 6 === 2 || i === 11 ? null : i % 4 === 3 ? null : ['Today, 8:20 AM', 'Yesterday', '5 Oct'][i % 3],
  })),
];
const CONSENT_TONE = { Given: 'ok', 'Not given': 'warn', Withdrawn: 'bad' };
const LINK_TONE = { Active: 'ok', 'Not sent': 'neutral', Revoked: 'bad' };

/* ======================= Parents & Guardians ======================= */
function Parents({ params }) {
  return params?.id ? <Parent360 id={params.id} /> : <ParentList />;
}
function ParentList() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [list, setList] = useState(GUARDIANS);
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [consentAsk, setConsentAsk] = useState(false);
  const [add, setAdd] = useState(false);
  const QF = { all: () => true, nocons: (g) => g.consent === 'Not given', withdrawn: (g) => g.consent === 'Withdrawn', nophoto: (g) => g.photo !== 'Given', notopen: (g) => !g.opened };
  const t = q.trim().toLowerCase();
  const d = t.replace(/\D/g, '');
  const rows = list.filter((g) => QF[f](g) && (!t || g.name.toLowerCase().includes(t) || g.kids.some((k) => k.name.toLowerCase().includes(t)) || (d.length >= 3 && g.phone.replace(/\D/g, '').includes(d))));
  const chosen = list.filter((g) => sel.has(g.id));
  return (
    <div>
      <ModuleHead sub="Parents’ details and phone numbers, linked to all their children in the school"
        actions={<Button variant="primary" icon={I.UserPlus} onClick={() => setAdd(true)}>Add parent or guardian</Button>} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: 'Parents and guardians', value: '2,108', sub: 'For 1,236 students', icon: 'Users' },
          { label: 'Data consent not given', value: '146', sub: 'Send a consent request', tone: 'warn', icon: 'ShieldAlert', onClick: () => setF('nocons') },
          { label: 'Parent Link active', value: '1,961', sub: '93% opened at least once', tone: 'ok', icon: 'Smartphone' },
          { label: 'Custody flags', value: '3', sub: 'Shown in red at pickup', tone: 'bad', icon: 'ShieldX' },
        ]} />
        <Chips value={f} onChange={setF} options={[
          { value: 'all', label: 'All', count: list.length }, { value: 'nocons', label: 'Consent not given', count: list.filter(QF.nocons).length },
          { value: 'withdrawn', label: 'Consent withdrawn', count: list.filter(QF.withdrawn).length }, { value: 'nophoto', label: 'Photo consent not given', count: list.filter(QF.nophoto).length },
          { value: 'notopen', label: 'Parent Link not opened yet', count: list.filter(QF.notopen).length },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="par-search" value={q} onChange={setQ} placeholder="Parent name, child’s name or phone" />
            <ExportButton what={`${rows.length} parents`} />
          </Toolbar>
          {canEdit && (
            <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" icon={I.ShieldCheck} onClick={() => setConsentAsk(true)}>Send consent request</Button>
              <Button size="sm" variant="secondary" icon={I.Send} onClick={() => toast({ title: `Message ready for ${sel.size} parents`, body: 'Opening Send Message…', tone: 'info' })}>Message</Button>
            </BulkBar>
          )}
          <DataList rows={rows} select={canEdit ? [sel, setSel] : undefined} onRow={(g) => go('students', { page: 'parents', id: g.id })} minWidth={1020}
            footer={`Showing ${rows.length} of 2,108`}
            empty={<Empty icon={I.SearchX} title="No parents match" body="Try the child’s name or the phone number." action={<Button variant="secondary" onClick={() => { setQ(''); setF('all'); }}>Clear filters</Button>} />}
            columns={[
              { key: 'n', label: 'Name', render: (g) => <div className="flex items-center gap-3"><Avatar name={g.name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight flex items-center gap-1.5 whitespace-nowrap">{g.name}{g.custody && <I.ShieldX size={15} className="text-bad" aria-label="Custody restriction" />}</p><p className="text-[12px] text-ink3">{g.rel}</p></div></div> },
              { key: 'p', label: 'Phone', nowrap: true, render: (g) => <span className="tnum text-[13.5px]">{g.phone}</span> },
              { key: 'k', label: 'Children', render: (g) => <div className="flex flex-col gap-0.5">{g.kids.map((k) => <span key={k.name} className="text-[13.5px] whitespace-nowrap">{k.name} <span className="text-ink3">· {k.label}</span></span>)}</div> },
              { key: 'j', label: 'Occupation', render: (g) => <span className="text-[13.5px]">{g.job}</span> },
              { key: 'o', label: 'Opted out', render: (g) => <span className={cx('text-[13.5px]', g.optOut && 'text-warn font-semibold')}>{g.optOut ? 'Yes' : 'No'}</span> },
              { key: 'c', label: 'Data consent', render: (g) => <Pill tone={CONSENT_TONE[g.consent]}>{g.consent}</Pill> },
              { key: 'l', label: 'Parent Link', render: (g) => <div><Pill tone={LINK_TONE[g.link]}>{g.link}</Pill>{g.link === 'Active' && <p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">{g.opened ? `Opened ${g.opened}` : 'Not opened yet'}</p>}</div> },
            ]}
            mobile={(g) => ({ title: <span className="inline-flex items-center gap-1.5">{g.name}{g.custody && <I.ShieldX size={15} className="text-bad" />}</span>, sub: `${g.rel} of ${g.kids.map((k) => `${k.name.split(' ')[0]} (${k.label})`).join(', ')}`, avatar: g.name,
              pills: [<Pill key="c" tone={CONSENT_TONE[g.consent]} className="!h-[22px] !text-[11.5px]">Consent {g.consent.toLowerCase()}</Pill>, <Pill key="l" tone={LINK_TONE[g.link]} className="!h-[22px] !text-[11.5px]">Link {g.link.toLowerCase()}</Pill>] })} />
        </Card>
      </div>
      <ConfirmSheet open={consentAsk} onClose={() => setConsentAsk(false)} title={`Send consent request to ${sel.size} ${sel.size === 1 ? 'parent' : 'parents'}`} sub="Through Parent Link. Each guardian agrees with a one-time code to their registered mobile. Staff can never tick consent for them."
        confirmLabel={`Send to ${sel.size} ${sel.size === 1 ? 'parent' : 'parents'}`} onConfirm={() => { toast({ title: `Consent request sent to ${sel.size} parents`, body: 'Data and photo consent · version 2.1. Answers show here as they come in.' }); setSel(new Set()); }}>
        <ul className="flex flex-col gap-1.5 text-[13.5px] max-h-52 overflow-y-auto scroll-thin">
          {chosen.map((g) => <li key={g.id} className="flex items-center justify-between gap-3"><span>{g.name} <span className="text-ink3">· {g.kids[0].label}</span></span><Pill tone={CONSENT_TONE[g.consent]} className="!h-5 !text-[11px]">{g.consent}</Pill></li>)}
        </ul>
      </ConfirmSheet>
      <AddParentSheet open={add} onClose={() => setAdd(false)} onAdd={(g) => setList((l) => [g, ...l])} />
    </div>
  );
}

function AddParentSheet({ open, onClose, onAdd }) {
  const toast = useToast();
  const { go } = useNav();
  const blank = { rel: 'Father', name: '', phone: '', child: FEATURED.id, email: '', job: '', dob: '', emergency: false, custody: false, note: '' };
  const [f, setF] = useState(blank);
  const [tch, setTch] = useState(false);
  const [match, setMatch] = useState(null);
  React.useEffect(() => { if (open) { setF(blank); setTch(false); setMatch(null); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const digits = f.phone.replace(/\D/g, '');
  const err = { name: !f.name.trim() ? 'Enter the full name' : '', phone: !digits ? 'Enter a mobile number' : digits.length !== 10 || !/^[6-9]/.test(digits) ? 'Enter a 10-digit Indian mobile number' : '', note: f.custody && !f.note.trim() ? 'Add a note so the gate knows what to do' : '' };
  const kids = [FEATURED, ...CLASS_7B.filter((s) => s.id !== FEATURED.id).slice(0, 8)];
  const ch = kids.find((s) => s.id === f.child) || FEATURED;
  return (
    <FormSheet open={open} onClose={onClose} title="Add parent or guardian" sub="Linked to a student now. Link more children from the parent’s page." submitLabel="Add and link"
      onSubmit={() => { setTch(true); if (Object.values(err).some(Boolean)) return false; onAdd({ id: 'G2109', name: f.name.trim(), rel: f.rel, phone: f.phone, email: f.email, job: f.job || '—', kids: [kid(ch)], optOut: false, consent: 'Not given', photo: 'Not given', link: 'Not sent', opened: null, custody: f.custody ? f.note : null }); toast({ title: `${f.name.trim()} added as ${f.rel.toLowerCase()} of ${ch.name}`, body: 'Consent is not given yet. Send a consent request from their page.' }); }}>
      <Field label="Relation" required id="ap-rel"><Segmented value={f.rel} onChange={set('rel')} options={['Father', 'Mother', 'Guardian', 'Other']} className="w-full" size="sm" /></Field>
      <Field label="Full name" required id="ap-name" error={tch && err.name}><Input id="ap-name" value={f.name} onChange={set('name')} error={tch && err.name} /></Field>
      <Field label="Phone" required id="ap-phone" error={tch && err.phone} hint="If the phone is already a parent’s, we offer to link them instead">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
          <Input id="ap-phone" inputMode="numeric" value={f.phone} onChange={(e) => { set('phone')(e.target.value.replace(/[^\d ]/g, '').slice(0, 11)); setMatch(null); }} onBlur={() => setMatch(digits === '9849031277' || digits === '9849560211' ? GUARDIANS.find((g) => g.phone.replace(' ', '') === digits) : null)} error={tch && err.phone} className="pl-12 tnum" placeholder="98480 12345" />
        </div>
      </Field>
      {match && (
        <div className="rounded-xl border border-warn/40 bg-warn/12 p-3.5">
          <p className="font-semibold text-[14px] flex gap-2"><I.TriangleAlert size={17} className="text-warn shrink-0 mt-0.5" />This phone belongs to {match.name}, {match.rel.toLowerCase()} of {match.kids.map((k) => `${k.name} (${k.label})`).join(' and ')}</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button type="button" size="sm" variant="soft" icon={I.Link} onClick={() => { onClose(); toast({ title: `${match.name} linked to ${ch.name}`, body: 'One parent record, now with one more child.' }); }}>Link existing parent</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { onClose(); go('students', { page: 'parents', id: match.id }); }}>Open existing</Button>
          </div>
        </div>
      )}
      <Field label="Link to student" required id="ap-child"><Select id="ap-child" value={f.child} onChange={set('child')} options={kids.map((s) => ({ value: s.id, label: `${s.name} · ${lab(s)}` }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" id="ap-email"><Input id="ap-email" value={f.email} onChange={set('email')} placeholder="Optional" /></Field>
        <Field label="Occupation" id="ap-job"><Input id="ap-job" value={f.job} onChange={set('job')} placeholder="Optional" /></Field>
      </div>
      <Field label="Date of birth" id="ap-dob" hint="Used for parents’ birthdays on the Dashboard"><Input id="ap-dob" value={f.dob} onChange={set('dob')} placeholder="DD-MM-YYYY" className="tnum" /></Field>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={f.emergency} onChange={set('emergency')} label="Emergency contact" /><span><b className="font-semibold">Emergency contact</b><span className="block text-[12.5px] text-ink3">Adds them to the student’s emergency contacts</span></span></label>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={f.custody} onChange={set('custody')} label="Custody or access restriction" /><span><b className="font-semibold">Custody or access restriction</b><span className="block text-[12.5px] text-ink3">Not on the pickup list. Shown in red at the gate.</span></span></label>
      {f.custody && <Field label="Note for the gate and office" required id="ap-note" error={tch && err.note}><Textarea id="ap-note" value={f.note} onChange={set('note')} rows={2} placeholder="For example: court order, no pickup" /></Field>}
    </FormSheet>
  );
}

function Parent360({ id }) {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const base = GUARDIANS.find((g) => g.id === id) || GUARDIANS[0];
  const [g, setG] = useState(base);
  const [sheet, setSheet] = useState(null);
  const [primary, setPrimary] = useState(() => Object.fromEntries(g.kids.map((k) => [k.name, !!g.primary])));
  const featured = g.kids.some((k) => k.id === FEATURED.id);
  const kids = g.kids.map((k) => { const s = STUDENTS.find((x) => x.id === k.id); return { ...k, att: s ? s.att : 98, due: s ? s.due : 0, state: s ? s.feeState : 'Paid', teacher: k.label === '7 B' ? 'Ravi Teja' : k.label === 'UKG A' ? 'Sunitha Mohan' : 'Usha Rani' }; });
  const totalDue = kids.reduce((a, k) => a + k.due, 0);
  // Fee figures only for roles with Fee Management; the custody flag only for the Principal and School Admin
  const fees = !!role.access.fees;
  const admin = ['principal', 'schooladmin'].includes(role.id);
  return (
    <div>
      <BackLink onClick={() => go('students', { page: 'parents' })} label="Parents & Guardians" sub={g.name} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {g.custody && <Banner tone="bad" icon="ShieldX" title="Custody restriction.">{g.custody} Not on the pickup list for any child.</Banner>}
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={g.name} size={60} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[23px] @md:text-[26px] font-semibold tracking-tight leading-tight">{g.name}</h1><Pill tone={CONSENT_TONE[g.consent]} dot>Consent {g.consent.toLowerCase()}</Pill></div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{g.rel} · <span className="tnum">+91 {g.phone}</span>{g.email && <> · {g.email}</>} · {g.job}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {role.access.communication && <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: `Message to ${g.name}`, body: 'Opening WhatsApp message with the school template', tone: 'info' })}>Message</Button>}
            {canEdit && <Button variant="secondary" icon={I.RefreshCw} onClick={() => setSheet('resend')}>Resend Parent Link</Button>}
            {canEdit && <MoreMenu items={[
              ['ShieldCheck', 'Send consent request', () => setSheet('consent')],
              ['ShieldOff', 'Record consent withdrawal', () => setSheet('withdraw')],
              ['Link', 'Link another child', () => toast({ title: 'Link another child', body: 'Search a student and pick the relation.', tone: 'info' })],
              ['Merge', 'Merge with another record', () => toast({ title: 'Merge two records', body: 'Pick the duplicate. All links and history are kept.', tone: 'info' })],
              ...(admin ? [['ShieldX', g.custody ? 'Change custody flag' : 'Add custody flag', () => setSheet('custody')]] : []),
              ['Ban', 'Revoke Parent Link', () => setSheet('revoke'), 'bad'],
            ]} />}
          </div>
        </Card>
        <Stats items={[
          { label: 'Children here', value: String(kids.length), sub: kids.map((k) => k.label).join(' · '), icon: 'GraduationCap' },
          ...(fees ? [{ label: 'Fees due, all children', value: totalDue ? inr(totalDue) : 'Nothing due', tone: totalDue ? 'bad' : 'ok', sub: totalDue ? 'Overdue since 10 Jul' : 'All paid', icon: 'IndianRupee' }] : []),
          { label: 'Parent Link', value: g.link, tone: LINK_TONE[g.link] === 'neutral' ? undefined : LINK_TONE[g.link], sub: g.opened ? `Last opened ${g.opened}` : 'Not opened yet', icon: 'Smartphone' },
          { label: 'Messages', value: g.optOut ? 'Opted out' : 'WhatsApp', sub: g.optOut ? 'Only urgent notices by SMS' : 'SMS if WhatsApp fails', icon: 'MessageCircle' },
        ]} />
        <Split>
          <Col>
            <Card>
              <CardHead title="Children" sub="Tap a child to open the profile" icon={I.GraduationCap} />
              <div className="grid @md:grid-cols-2 gap-3 px-5 pb-5">
                {kids.map((k) => (
                  <div key={k.name} className="rounded-xl border border-line p-3.5 flex flex-col gap-3">
                    <button disabled={!k.id} onClick={() => go('student', { id: k.id })} className="flex items-center gap-3 text-left enabled:hover:opacity-80">
                      <Avatar name={k.name} size={42} />
                      <span className="min-w-0 flex-1"><b className="font-semibold text-[15px] block truncate">{k.name}</b><span className="text-[12.5px] text-ink3">{k.label} · class teacher {k.teacher}</span></span>
                      {k.id && <I.ChevronRight size={17} className="text-ink3" />}
                    </button>
                    <div className={cx('grid gap-2 text-[13px]', fees ? 'grid-cols-2' : 'grid-cols-1')}>
                      <div className="rounded-lg bg-sunken/60 px-2.5 py-2"><p className="text-ink3 text-[12px] font-semibold">Attendance</p><p className={cx('font-semibold tnum', k.att < 85 && 'text-warn')}>{k.att}% this year</p></div>
                      {fees && <div className="rounded-lg bg-sunken/60 px-2.5 py-2"><p className="text-ink3 text-[12px] font-semibold">Fees</p><p className={cx('font-semibold tnum', k.due && 'text-bad')}>{k.due ? `${inr(k.due)} ${k.state === 'Overdue' ? 'overdue' : 'due'}` : 'Paid'}</p></div>}
                    </div>
                    {canEdit ? <label className="flex items-center gap-3 text-[13.5px]">
                      <Switch on={primary[k.name]} label={`Primary contact for ${k.name}`} onChange={(v) => { setPrimary((p) => ({ ...p, [k.name]: v })); toast({ title: v ? `${g.name} is now the primary contact for ${k.name.split(' ')[0]}` : `${g.name} is no longer the primary contact`, body: 'This number gets WhatsApp and SMS first.' }); }} />
                      <span className="font-semibold">Primary contact for messages</span>
                    </label> : primary[k.name] && <p className="text-[13px] text-ink2 flex items-center gap-1.5"><I.CircleCheck size={15} className="text-ok shrink-0" />Primary contact for messages</p>}
                    {k.due > 0 && canDo(role, 'fees.collect') && <Button size="sm" variant="soft" icon={I.IndianRupee} onClick={() => go('fees', { student: k.id })}>Collect {inr(k.due)}</Button>}
                  </div>
                ))}
              </div>
            </Card>
            {fees && <Card>
              <CardHead title="Fees and payments" sub="All children, newest first" icon={I.ReceiptIndianRupee} />
              <ul className="px-2 pb-2">
                {(featured ? [['R/26/04412', '12 Jul', 'Aarav · Tuition fee Q2 (part)', 10000, 'UPI'], ['R/26/04398', '10 Jul', 'Anaya · Tuition fee Q1 and Q2', 21600, 'Razorpay'], ['R/26/04102', '5 Apr', 'Aarav · Transport fee Apr–Sep', 13200, 'Cash'], ['R/26/04011', '10 Apr', 'Aarav · Tuition fee Q1', 18500, 'Razorpay']]
                  : [['R/26/04877', '9 Jul', `${kids[0].name.split(' ')[0]} · Tuition fee Q2`, 16000, 'UPI'], ['R/26/04210', '8 Apr', `${kids[0].name.split(' ')[0]} · Tuition fee Q1`, 16000, 'Cash']]).map(([r, d, w, a, m]) => (
                  <Row key={r} icon="ReceiptIndianRupee" title={w} sub={<><span className="font-mono text-[11.5px]">{r}</span> · {d} · {m}</>} right={<span className="font-semibold tnum text-[14px]">{inr(a)}</span>} />
                ))}
              </ul>
            </Card>}
            <Card>
              <CardHead title="Messages, PTMs and requests" icon={I.MessagesSquare} />
              <div className="px-5"><Timeline items={[
                { what: featured ? 'Leave request for Aarav, Mon 12 Oct (family function). Waiting for Ravi Teja.' : 'Asked for the bus route change to Route 2.', when: 'Today, 8:40 AM · through Parent Link', icon: 'CalendarDays', tone: 'info' },
                { what: 'PTM booked: Sat 17 Oct, 10:20 AM with the class teacher.', when: '7 Oct 2026', icon: 'Users', tone: 'brand' },
                ...(fees ? [{ what: 'Fee reminder on WhatsApp. Seen by parent.', when: '6 Oct 2026, 10:00 AM', icon: 'MessageCircle' }] : []),
                { what: 'Complaint: Bus 4 late twice last week. Resolved by Venkatesh Goud.', when: '5 Oct 2026', icon: 'Bus', tone: 'ok' },
                { what: 'Notice: Dussehra holidays 19–25 Oct.', when: '3 Oct 2026', icon: 'Megaphone' },
              ]} /></div>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Consent records" sub="DPDP Act 2023 · given by the guardian, never by staff" icon={I.ShieldCheck} />
              <ul className="px-5 pb-5 flex flex-col gap-3">
                {[['Data consent', g.consent, g.consent === 'Given' ? 'Version 2.1 · 3 Jun 2026 · one-time code on the application form' : g.consent === 'Withdrawn' ? 'Withdrawn 28 Sep 2026 at the office · was version 2.0' : 'Consent request not answered yet'],
                  ['Photo consent', g.photo, g.photo === 'Given' ? 'Version 1.3 · 3 Jun 2026 · Parent Link' : g.photo === 'Withdrawn' ? 'Withdrawn 28 Sep 2026 · photos hidden from the gallery' : 'Not given · child’s photo stays out of the gallery']].map(([k, v, s]) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', v === 'Given' ? 'bg-ok/10 text-ok' : v === 'Withdrawn' ? 'bg-bad/10 text-bad' : 'bg-warn/12 text-warn')}>{v === 'Given' ? <I.ShieldCheck size={17} /> : <I.ShieldAlert size={17} />}</span>
                    <div className="min-w-0"><p className="font-semibold text-[14px]">{k}: {v}</p><p className="text-[12.5px] text-ink3">{s}</p></div>
                  </li>
                ))}
                {g.consent !== 'Given' && canEdit && <Button variant="soft" icon={I.Send} onClick={() => setSheet('consent')}>Send consent request</Button>}
              </ul>
            </Card>
            <Card>
              <CardHead title="Parent Link" sub="One personal link. No password. Owned by Communication." icon={I.Smartphone} />
              <DL cols={1} rows={[['Status', <Pill key="s" tone={LINK_TONE[g.link]}>{g.link}</Pill>], ['Last opened', g.opened ? `${g.opened} · Android phone` : 'Never'], ['Sent to', `+91 ${g.phone} on WhatsApp`]]} />
            </Card>
            {featured && (
              <Card>
                <CardHead title="Transport" icon={I.Bus} />
                <DL cols={1} rows={[['Route', 'Route 4 · Miyapur · Bus 4 (Mallesh Kumar)'], ['Stop', 'KPHB 6th Phase · 7:42 AM pickup'], ['Authorised for pickup', 'Priya Sharma, Rajesh Sharma, Kamala Sharma']]} />
              </Card>
            )}
            <Card>
              <CardHead title="Documents" icon={I.FolderOpen} />
              <ul className="px-3 pb-3">
                {[['Parent ID (Aadhaar)', 'XXXX XXXX 4821 · restricted · 2 Jun 2021'], ['Address proof', 'Electricity bill · 2 Jun 2021']].map(([n, m]) => (
                  <li key={n} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                    <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.FileText size={19} /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12.5px] text-ink3 truncate tnum">{m}</p></div>
                    <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => toast({ title: `Opening ${n}`, tone: 'info' })}>View</Button>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <ConfirmSheet open={sheet === 'resend'} onClose={() => setSheet(null)} title="Resend Parent Link?" sub={`${g.name}’s personal link goes again to +91 ${g.phone} on WhatsApp, with SMS backup.`} confirmLabel={`Send to ${g.name}`}
        onConfirm={() => { setG({ ...g, link: 'Active' }); toast({ title: 'Parent Link sent again', body: `To +91 ${g.phone}. On a new phone it asks for a one-time code.` }); }} />
      <ConfirmSheet open={sheet === 'revoke'} onClose={() => setSheet(null)} danger title="Revoke Parent Link?" sub="Use this when a phone is lost. The old link stops opening at once. A new link can be sent to the registered number." confirmLabel="Revoke and send a new link" typeToConfirm="REVOKE"
        onConfirm={() => toast({ title: 'Parent Link revoked. A new link was sent.', body: `To 98xxxxx${g.phone.slice(-2)}. The old link no longer opens.` })} />
      <ConfirmSheet open={sheet === 'consent'} onClose={() => setSheet(null)} title="Send consent request?" sub={`Through Parent Link to ${g.name}. They agree with a one-time code to +91 ${g.phone}.`} confirmLabel={`Send to ${g.name}`}
        onConfirm={() => toast({ title: 'Consent request sent', body: 'Data and photo consent, version 2.1.' })} />
      {sheet === 'withdraw' && <WithdrawSheet g={g} onClose={() => setSheet(null)} onSave={(type) => { setG({ ...g, ...(type === 'photo' ? { photo: 'Withdrawn' } : { consent: 'Withdrawn', photo: 'Withdrawn' }) }); toast({ title: type === 'photo' ? 'Photo consent withdrawn' : 'Data consent withdrawn', body: type === 'photo' ? 'The child’s photos are hidden from the gallery and social posts.' : 'Recorded with today’s date. Listed in Needs Attention.' }); }} />}
      {sheet === 'custody' && <CustodySheet g={g} onClose={() => setSheet(null)} onSave={(note) => { setG({ ...g, custody: note || null }); toast({ title: note ? 'Custody flag saved' : 'Custody flag removed', body: 'Shown in red at Front Office, Student Pickup. Logged with your reason.' }); }} />}
    </div>
  );
}
function WithdrawSheet({ g, onClose, onSave }) {
  const [type, setType] = useState('photo');
  return (
    <FormSheet open onClose={onClose} title="Record consent withdrawal" sub={`${g.name} asked the office to withdraw consent`} submitLabel="Record withdrawal" onSubmit={() => onSave(type)}>
      <Field label="Which consent" required id="wd-type"><Segmented value={type} onChange={setType} options={[{ value: 'photo', label: 'Photo consent only' }, { value: 'data', label: 'Data consent' }]} className="w-full" /></Field>
      <Field label="How it was asked" id="wd-how"><Select id="wd-how" value="office" onChange={() => {}} options={[{ value: 'office', label: 'In person at the office' }, { value: 'letter', label: 'Signed letter' }]} /></Field>
    </FormSheet>
  );
}
function CustodySheet({ g, onClose, onSave }) {
  const [on, setOn] = useState(!!g.custody);
  const [note, setNote] = useState(g.custody || '');
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Custody or access restriction" sub="Only an admin can change this. Every change needs a reason." submitLabel="Save"
      onSubmit={() => { if (!why.trim()) { setErr('Give a reason for this change'); return false; } onSave(on ? note : ''); }}>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={on} onChange={setOn} label="Restriction on" /><b className="font-semibold">Restriction on</b></label>
      {on && <Field label="Note for the gate and office" id="cu-note"><Textarea id="cu-note" value={note} onChange={setNote} rows={2} /></Field>}
      <Field label="Reason for the change" required id="cu-why" error={err}><Input id="cu-why" value={why} onChange={(x) => { setWhy(x.target.value); setErr(''); }} error={err} placeholder="For example: copy of court order received" /></Field>
    </FormSheet>
  );
}

/* ======================= Behaviour & Counselling ======================= */
const TYPES = ['Incident', 'Warning', 'Suspension', 'Reward', 'Recognition'];
const TYPE_TONE = { Incident: 'warn', Warning: 'bad', Suspension: 'bad', Reward: 'ok', Recognition: 'ok' };
const TYPE_PTS = { Incident: -2, Warning: -3, Suspension: -10, Reward: 5, Recognition: 10 };
const k7 = (i) => CLASS_7B[i];
export const INCIDENTS = [
  { id: 'BH-0231', date: '9 Oct', kids: [k7(4)], type: 'Incident', what: 'Pushed a classmate in the bus queue. No one was hurt.', by: 'Ravi Teja', action: 'Spoke to both. Apology given.', status: 'Closed', pts: -2 },
  { id: 'BH-0230', date: '8 Oct', kids: [pickS('7', 'A', 1)], type: 'Reward', what: 'Helped a new student settle in and showed her around the school.', by: 'Imran Shaikh', action: 'Praised in assembly', status: 'Closed', pts: 5 },
  { id: 'BH-0229', date: '8 Oct', kids: [k7(17), k7(22)], type: 'Warning', what: 'Using phones in the Science lab during the practical.', by: 'Ravi Teja', action: 'Phones kept in the office till 3:30 PM. Parents informed.', status: 'Closed', pts: -3, informed: true },
  { id: 'BH-0228', date: '7 Oct', kids: [pickS('9', 'C', 0)], type: 'Suspension', what: 'Fight on Bus 3 (Bachupally). Second time this term.', by: 'Deepak Verma', action: 'Suspended Thu 8 Oct to Fri 9 Oct, approved by Lakshmi Rao. Parent meeting with the Principal.', status: 'Open', pts: -10, referred: true },
  { id: 'BH-0227', date: '6 Oct', kids: [pickS('6', 'B', 0)], type: 'Incident', what: 'Maths homework not given for the 4th time. Seems withdrawn in class.', by: 'Imran Shaikh', action: 'Referred to counselling', status: 'Open', pts: 0, referred: true },
  { id: 'BH-0226', date: '5 Oct', kids: [FEATURED], type: 'Recognition', what: 'Science Exhibition: 2nd prize for the water filter model.', by: 'Ravi Teja', action: 'Merit certificate', status: 'Closed', pts: 10 },
  { id: 'BH-0225', date: '3 Oct', kids: [k7(30)], type: 'Incident', what: 'Late to school 4 times this week.', by: 'Ravi Teja', action: 'Called the parent', status: 'Closed', pts: -1 },
  { id: 'BH-0224', date: '1 Oct', kids: [pickS('10', 'A', 0)], type: 'Reward', what: 'Led the Gandhi Jayanti assembly.', by: 'Anitha Kumari', action: 'House points to Krishna House', status: 'Closed', pts: 5 },
  { id: 'BH-0223', date: '29 Sep', kids: [pickS('8', 'A', 0)], type: 'Warning', what: 'Tore pages of a library book.', by: 'Padma Iyer', action: 'Book cost to be paid. Warning letter to parent.', status: 'Open', pts: -3 },
  { id: 'BH-0222', date: '26 Sep', kids: [pickS('6', 'A', 1)], type: 'Incident', what: 'Upset during Maths tests; cried twice this week.', by: 'Imran Shaikh', action: 'Referred to counselling', status: 'Closed', pts: 0, referred: true },
];
export const CASES = [
  { id: 'CC/2026/014', s: pickS('6', 'B', 0), opened: '6 Oct 2026', from: 'Imran Shaikh (incident BH-0227)', status: 'Open', next: 'Mon 12 Oct, 12:40 PM', sessions: [['7 Oct, 12:40 PM', 'First session. Feels left out after friends moved to 6 A. Sleeping late because of phone games.']], plan: 'Weekly session for 4 weeks. Class teacher to change seating. Parent meeting after Dussehra.', notes: 'Parents separated in August. Lives with mother and grandmother. Not to be discussed with classmates.', referral: null },
  { id: 'CC/2026/012', s: pickS('9', 'C', 0), opened: '28 Sep 2026', from: 'Lakshmi Rao (Principal)', status: 'Follow-up', next: 'Fri 16 Oct, 2:20 PM', sessions: [['8 Oct, 11:15 AM', 'Calmer. Talked through what happens before he gets angry.'], ['1 Oct, 11:15 AM', 'Anger after cricket losses. Older cousin teases him at home.'], ['29 Sep, 12:40 PM', 'First session after the bus fight.']], plan: 'Anger log for 2 weeks. Captain role in PE to build trust.', notes: 'Father works away in Dubai. Mother asked that the father is not called.', referral: 'Dr. Kavya Rao, child psychologist, Rainbow Hospital (parent agreed 2 Oct)' },
  { id: 'CC/2026/011', s: pickS('6', 'A', 1), opened: '26 Sep 2026', from: 'Imran Shaikh (incident BH-0222)', status: 'Open', next: 'Tue 13 Oct, 11:15 AM', sessions: [['30 Sep, 11:15 AM', 'Exam worry before the half-yearlies. Practised slow breathing.']], plan: 'Two more sessions before exams. Extra time talk with the Exam In-charge if needed.', notes: 'Older sister scored 98% last year; feels compared at home.', referral: null },
  { id: 'CC/2026/010', s: pickS('10', 'B', 0), opened: '15 Sep 2026', from: 'Self-referral', status: 'Open', next: 'Mon 12 Oct, 3:30 PM', sessions: [['22 Sep, 3:30 PM', 'Parents want MPC; the student wants Commerce. Aptitude test booked.']], plan: 'Aptitude test 14 Oct, then a meeting with both parents.', notes: 'Strong in Accounts-style problems; anxious about telling the father.', referral: null },
  { id: 'CC/2026/009', s: k7(9), opened: '2 Sep 2026', from: 'Ravi Teja (class teacher)', status: 'Closed', next: null, sessions: [['30 Sep', 'Closed. Settled well, back to normal marks.'], ['9 Sep', 'Grief after grandfather passed away.']], plan: 'Closed after 4 sessions.', notes: 'Was very close to the grandfather who did school pickup.', referral: null },
];
const CAREER = [
  { s: pickS('10', 'A', 0), interest: 'Engineering (Computer Science)', apt: 'Logical 88 · Numerical 91', exam: 'JEE Main 2029 · foundation classes', apps: [['Narayana Junior College, Kukatpally', 'MPC', 'Applied', '15 Jan 2027']], mentor: 'Kiran Kumar (Batch 2016, IIT Hyderabad)' },
  { s: pickS('10', 'B', 0), interest: 'Commerce and CA', apt: 'Numerical 84 · Verbal 79', exam: 'CA Foundation after Class 12', apps: [['Sri Chaitanya Junior College', 'MEC', 'Thinking', '31 Jan 2027']], mentor: 'Sneha Reddy (Batch 2014, Chartered Accountant)' },
  { s: pickS('10', 'C', 0), interest: 'Medicine', apt: 'Biology 90 · Memory 86', exam: 'NEET 2029', apps: [['FIITJEE Junior College', 'BiPC', 'Applied', '10 Jan 2027'], ['Narayana Junior College', 'BiPC', 'Offer received', '—']], mentor: 'Dr. Harini Naidu (Batch 2012, Osmania Medical College)' },
  { s: pickS('10', 'A', 1), interest: 'Design and architecture', apt: 'Spatial 92 · Creative 89', exam: 'NATA guidance', apps: [['Gitanjali Junior College', 'MPC', 'Applied', '20 Jan 2027']], mentor: null },
];

function Behaviour({ access }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const rid = role.id;
  const counsellor = rid === 'counsellor';
  const scope = rid === 'teacher' ? ['6 A', '6 B', '7 A', '7 B'] : rid === 'classteacher' ? ['7 B'] : null;
  const [tab, setTab] = useState(counsellor ? 'counselling' : 'incidents');
  const [list, setList] = useState(INCIDENTS);
  const [cases, setCases] = useState(CASES);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [report, setReport] = useState(false);
  const [open, setOpen] = useState(null);
  const [cs, setCs] = useState(null);
  const [newCase, setNewCase] = useState(false);
  const [refer, setRefer] = useState(null);
  const [per, setPer] = useState(PERIODS.last30);
  // Teachers see only students they teach, the class teacher their section, the counsellor only incidents referred to counselling
  const all = list.filter((i) => (scope ? i.kids.some((k) => scope.includes(lab(k))) : counsellor ? i.referred : true));
  const vis = all.filter((i) => inPeriod(i.date, per));
  const t = q.trim().toLowerCase();
  const rows = vis.filter((i) => (type === 'all' || i.type === type) && (!t || i.kids.some((k) => k.name.toLowerCase().includes(t)) || i.what.toLowerCase().includes(t)));
  const visCases = cases.filter((c) => (scope ? scope.includes(lab(c.s)) : true));
  const pts = useMemo(() => {
    const m = {};
    vis.forEach((i) => i.kids.forEach((k) => { m[k.name] = (m[k.name] || 0) + i.pts; }));
    const all = Object.entries(m).filter(([, p]) => p !== 0).sort((a, b) => b[1] - a[1]);
    return all.length > 6 ? [...all.slice(0, 3), ...all.slice(-3)] : all;
  }, [vis]);
  // Career guidance is for the whole of Class 10: not for teachers, and not for the counsellor, who sees only the cases given to them
  const showCareer = !scope && !counsellor;
  const canClose = (i) => !scope || rid === 'classteacher' || i.by === role.person.name;
  const sub = rid === 'teacher' ? 'Only students you teach: 6 A, 6 B, 7 A and 7 B' : rid === 'classteacher' ? 'Only your class, 7 B' : counsellor ? 'The counselling cases given to you. Only you can read the notes.' : 'Incidents, warnings and rewards. Counselling notes stay with the counsellor.';
  return (
    <div>
      <ModuleHead sub={sub} actions={counsellor
        ? <Button variant="primary" icon={I.FolderPlus} onClick={() => setNewCase(true)}>Open a case</Button>
        : <Button variant="primary" icon={I.Plus} onClick={() => setReport(true)}>Report incident</Button>} />
      <div className="flex flex-col gap-4">
        <Tabs value={tab} onChange={setTab} tabs={[
          ...(counsellor ? [{ id: 'counselling', label: 'Counselling', count: visCases.length }, { id: 'incidents', label: 'Referred incidents', count: vis.length }] : [{ id: 'incidents', label: 'Incidents & rewards', count: vis.length }, { id: 'counselling', label: 'Counselling', count: visCases.length }]),
          ...(showCareer ? [{ id: 'career', label: 'Career guidance', count: CAREER.length }] : []),
        ]} />

        {tab === 'incidents' && (
          <Split side={300}>
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="bh-search" value={q} onChange={setQ} placeholder="Student or what happened" />
                <DatePeriod id="bh-period" value={per} onChange={setPer} className="w-full @md:w-auto" />
                <Select id="bh-type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...TYPES]} className="@md:w-40" />
                <ExportButton what="behaviour records" />
              </Toolbar>
              <DataList rows={rows} onRow={(i) => setOpen(i)} minWidth={760} footer={`Showing ${rows.length} of ${vis.length} · ${fmtRange(per)}`}
                empty={<Empty icon={I.SearchX} title="Nothing matches" body={`Nothing recorded ${fmtRange(per)} for these filters. Try wider dates, another type or a student name.`} action={<Button variant="secondary" onClick={() => { setQ(''); setType('all'); setPer(PERIODS.last30); }}>Clear filters</Button>} />}
                columns={[
                  { key: 'd', label: 'Date', nowrap: true, render: (i) => <span className="text-[13px] tnum">{i.date}</span> },
                  { key: 's', label: 'Student', render: (i) => <div className="flex flex-col gap-0.5">{i.kids.map((k) => <span key={k.id} className="whitespace-nowrap"><b className="font-semibold">{k.name}</b> <span className="text-ink3 text-[12.5px]">· {lab(k)}</span></span>)}</div> },
                  { key: 't', label: 'Type', render: (i) => <Pill tone={TYPE_TONE[i.type]}>{i.type}</Pill> },
                  { key: 'w', label: 'What happened', render: (i) => <p className="text-[13.5px] max-w-[300px] line-clamp-2">{i.what}</p> },
                  { key: 'b', label: 'Reported by', nowrap: true, render: (i) => <span className="text-[13.5px]">{i.by}</span> },
                  { key: 'st', label: 'Status', render: (i) => <div className="flex flex-col items-start gap-1"><Pill tone={i.status === 'Open' ? 'info' : 'neutral'}>{i.status}</Pill>{i.referred && <span className="text-[11.5px] text-ink3 whitespace-nowrap">To counselling</span>}</div> },
                ]}
                mobile={(i) => ({ title: i.kids.map((k) => k.name).join(', '), sub: `${i.date} · ${i.what}`, icon: i.pts > 0 ? 'Trophy' : 'TriangleAlert', iconTone: TYPE_TONE[i.type],
                  pills: [<Pill key="t" tone={TYPE_TONE[i.type]} className="!h-[22px] !text-[11.5px]">{i.type}</Pill>, <Pill key="s" tone={i.status === 'Open' ? 'info' : 'neutral'} className="!h-[22px] !text-[11.5px]">{i.status}</Pill>] })} />
            </Card>
            <Col>
              <Card>
                <CardHead title="Behaviour points" sub={`Highest and lowest · ${fmtRange(per)}`} icon={I.Medal} />
                <ul className="px-5 pb-4 flex flex-col gap-2">
                  {!pts.length && <li className="text-[13.5px] text-ink3 py-2">No points in these dates.</li>}
                  {pts.slice(0, 6).map(([n, p]) => (
                    <li key={n} className="flex items-center gap-3 text-[13.5px]"><Avatar name={n} size={28} /><span className="flex-1 truncate">{n}</span><span className={cx('font-semibold tnum', p > 0 ? 'text-ok' : p < 0 ? 'text-bad' : 'text-ink3')}>{p > 0 ? `+${p}` : p}</span></li>
                  ))}
                </ul>
              </Card>
              {!counsellor && (
                <Card>
                  <CardHead title={per.label} sub={fmtRange(per)} icon={I.ChartColumn} />
                  <div className="px-5 pb-5"><HBars rows={[{ k: 'Incidents', v: vis.filter((i) => i.type === 'Incident').length }, { k: 'Warnings', v: vis.filter((i) => i.type === 'Warning').length }, { k: 'Suspensions', v: vis.filter((i) => i.type === 'Suspension').length }, { k: 'Rewards', v: vis.filter((i) => i.pts > 0).length }]} max={Math.max(4, vis.length)} unit="" labelWidth={86} /></div>
                </Card>
              )}
            </Col>
          </Split>
        )}

        {tab === 'counselling' && (counsellor ? (
          <Card className="overflow-hidden">
            <CardHead title="My cases" sub="Highly restricted. Nobody else can read sessions or notes, not even the Principal." icon={I.HeartHandshake} />
            <DataList rows={visCases} onRow={(c) => setCs(c)} minWidth={720} footer={`${visCases.filter((c) => c.status !== 'Closed').length} open · ${visCases.length} this year`}
              columns={[
                { key: 'c', label: 'Case', nowrap: true, render: (c) => <span className="font-mono text-[12.5px]">{c.id}</span> },
                { key: 's', label: 'Student', render: (c) => <div className="flex items-center gap-3"><Avatar name={c.s.name} size={32} /><div><p className="font-semibold leading-tight">{c.s.name}</p><p className="text-[12px] text-ink3">{lab(c.s)} · from {c.from.split(' (')[0]}</p></div></div> },
                { key: 'st', label: 'Status', render: (c) => <Pill tone={c.status === 'Closed' ? 'neutral' : c.status === 'Follow-up' ? 'warn' : 'info'}>{c.status}</Pill> },
                { key: 'n', label: 'Next session', nowrap: true, render: (c) => <span className="text-[13.5px] tnum">{c.next || '—'}</span> },
                { key: 'x', label: 'Sessions', align: 'right', render: (c) => c.sessions.length },
              ]}
              mobile={(c) => ({ title: c.s.name, sub: `${c.id} · ${c.next ? 'Next ' + c.next : 'Closed'}`, avatar: c.s.name, pills: [<Pill key="s" tone={c.status === 'Closed' ? 'neutral' : c.status === 'Follow-up' ? 'warn' : 'info'} className="!h-[22px] !text-[11.5px]">{c.status}</Pill>] })} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title="Counselling" sub="Handled by Sana Ali (Counsellor). Only she can read sessions and notes." icon={I.Lock} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {visCases.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 @md:px-5 py-3">
                  <Avatar name={c.s.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-tight">{c.s.name} <span className="text-ink3 font-normal text-[13px]">· {lab(c.s)} · opened {c.opened.replace(' 2026', '')}</span></p>
                    <PrivateNote className="mt-1" />
                  </div>
                  <Pill tone={c.status === 'Closed' ? 'neutral' : 'info'} className="shrink-0">{c.status === 'Closed' ? 'Closed' : 'Active'}</Pill>
                </li>
              ))}
              {!visCases.length && <li><Empty icon={I.HeartHandshake} title="No counselling cases" body="Refer a student from an incident when they need support." /></li>}
            </ul>
            {canEdit && <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">To ask for help for a student, open an incident and press “Refer to counselling”.</p>}
          </Card>
        ))}

        {tab === 'career' && <Career canEdit={canEdit} />}
      </div>

      {report && <ReportSheet scope={scope} onClose={() => setReport(false)} onSave={(n) => { setList((l) => [n, ...l]); toast({ title: `${n.type} saved for ${n.kids.map((k) => k.name.split(' ')[0]).join(', ')}`, body: n.informed ? 'Parent informed on WhatsApp.' : `${n.id} · ${n.pts > 0 ? '+' : ''}${n.pts} points` }); }} />}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.type} · ${open.date}` : ''} sub={open ? `${open.id} · reported by ${open.by}` : ''}
        footer={open && canEdit && !counsellor ? <>
          {!open.referred && <Button variant="secondary" icon={I.HeartHandshake} onClick={() => { setRefer(open); setOpen(null); }}>Refer to counselling</Button>}
          {open.status === 'Open' && canClose(open) && <Button variant="primary" icon={I.Check} onClick={() => { setList((l) => l.map((x) => (x.id === open.id ? { ...x, status: 'Closed' } : x))); toast({ title: `${open.id} closed`, undo: () => setList((l) => l.map((x) => (x.id === open.id ? { ...x, status: 'Open' } : x))) }); setOpen(null); }}>Close</Button>}
        </> : null}>
        {open && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">{open.kids.map((k) => <span key={k.id} className="inline-flex items-center gap-2 h-9 pl-1 pr-3 rounded-full bg-sunken text-[13.5px] font-semibold"><Avatar name={k.name} size={28} />{k.name} <span className="text-ink3 font-normal">· {lab(k)}</span></span>)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[['What happened', open.what, true], ['Action taken', open.action, true], ['Points', `${open.pts > 0 ? '+' : ''}${open.pts}`], ['Status', open.status], ['Parent informed', open.informed ? 'Yes, on WhatsApp' : 'No']].map(([k, v, wide]) => (
                <div key={k} className={cx(wide && 'col-span-2')}><dt className="text-[12px] text-ink3 font-semibold">{k}</dt><dd className="text-[14.5px] mt-0.5">{v}</dd></div>
              ))}
            </dl>
            {open.referred && (
              <div className="rounded-xl bg-sunken/70 p-3.5">
                <p className="text-[13px] font-semibold flex items-center gap-1.5 mb-1"><I.HeartHandshake size={15} className="text-brand" />Referred to counselling · Sana Ali</p>
                {counsellor ? <p className="text-[13.5px] text-ink2">Open the case in the Counselling tab to record sessions.</p> : <PrivateNote />}
              </div>
            )}
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={!!refer} onClose={() => setRefer(null)} title="Refer to counselling?" sub={refer ? `${refer.kids.map((k) => k.name).join(', ')} · a case opens and Sana Ali is told. Only she can read what happens next.` : ''}
        confirmLabel="Refer to Sana Ali" onConfirm={() => { setList((l) => l.map((x) => (x.id === refer.id ? { ...x, referred: true } : x))); toast({ title: 'Referred to counselling', body: 'Sana Ali got a notification. You will see “Private” on this case.' }); }} />
      {cs && <CaseSheet c={cs} onClose={() => setCs(null)} onUpdate={(n) => { setCases((l) => l.map((x) => (x.id === n.id ? n : x))); setCs(n); }} />}
      {newCase && <NewCaseSheet onClose={() => setNewCase(false)} onSave={(n) => { setCases((l) => [n, ...l]); toast({ title: `Case ${n.id} opened for ${n.s.name}`, body: 'Only you can read its sessions and notes.' }); }} />}
    </div>
  );
}

export function ReportSheet({ scope, onClose, onSave, preset }) {
  const pool = scope ? STUDENTS.filter((s) => scope.includes(lab(s))) : STUDENTS;
  const [q, setQ] = useState('');
  const [kids, setKids] = useState(preset ? [preset] : []);
  const [type, setType] = useState('Incident');
  const [what, setWhat] = useState('');
  const [date, setDate] = useState('09-10-2026');
  const [action, setAction] = useState('');
  const [inform, setInform] = useState(false);
  const [points, setPoints] = useState(null);
  const [from, setFrom] = useState('12-10-2026');
  const [to, setTo] = useState('13-10-2026');
  const [tch, setTch] = useState(false);
  const t = q.trim().toLowerCase();
  const found = t ? pool.filter((s) => s.name.toLowerCase().includes(t) || String(s.roll) === t).slice(0, 5) : pool.filter((s) => lab(s) === (scope ? scope[scope.length - 1] : '7 B')).slice(0, 5);
  const err = { kids: !kids.length ? 'Pick at least one student' : '', what: !what.trim() ? 'Write a short note' : '' };
  const pts = points ?? TYPE_PTS[type];
  return (
    <FormSheet open onClose={onClose} title="Report incident" sub={scope ? `Students you teach: ${scope.join(', ')}` : 'Student, type and a short note. That is all that is needed.'} submitLabel="Save"
      onSubmit={() => { setTch(true); if (err.kids || err.what) return false; onSave({ id: 'BH-0232', date: date === '09-10-2026' ? '9 Oct' : date, kids, type, what: what.trim(), by: 'You', action: action || (type === 'Suspension' ? `Suspended ${from} to ${to}, approved by Lakshmi Rao` : '—'), status: 'Open', pts, informed: inform }); }}>
      <Field label="1. Student" required id="ri-q" error={tch && err.kids}>
        {kids.length > 0 && <div className="flex flex-wrap gap-2 mb-2">{kids.map((k) => <button type="button" key={k.id} onClick={() => setKids((x) => x.filter((y) => y.id !== k.id))} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full bg-brand/10 text-brand text-[13px] font-semibold"><Avatar name={k.name} size={24} />{k.name}<I.X size={14} /></button>)}</div>}
        <SearchBox id="ri-q" value={q} onChange={setQ} placeholder="Name or roll number" />
        <ul className="mt-1.5 flex flex-col">
          {found.filter((s) => !kids.some((k) => k.id === s.id)).map((s) => (
            <li key={s.id}><button type="button" onClick={() => { setKids((x) => [...x, s]); setQ(''); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken text-left"><Avatar name={s.name} size={30} /><span className="flex-1 text-[14px] font-semibold truncate">{s.name}</span><span className="text-[12.5px] text-ink3">{lab(s)} · Roll {s.roll}</span><I.Plus size={16} className="text-brand" /></button></li>
          ))}
        </ul>
      </Field>
      <Field label="2. Type" required id="ri-type">
        <div className="grid grid-cols-3 @md:grid-cols-5 gap-1.5">
          {TYPES.map((x) => <button type="button" key={x} onClick={() => { setType(x); setPoints(null); }} className={cx('h-10 rounded-xl border text-[13px] font-semibold transition', type === x ? 'border-brand bg-brand/8 text-brand ring-1 ring-brand' : 'border-line text-ink2 hover:border-ink3/50')}>{x}</button>)}
        </div>
      </Field>
      <Field label="3. What happened" required id="ri-what" error={tch && err.what}>
        <div className="flex flex-wrap gap-1.5 mb-1">{(TYPE_PTS[type] > 0 ? ['Helped a classmate', 'Won a competition', 'Led the assembly'] : ['Late to class', 'No homework again', 'Disturbing the class', 'Phone in class']).map((x) => <button type="button" key={x} onClick={() => setWhat(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>)}</div>
        <Textarea id="ri-what" value={what} onChange={setWhat} rows={2} placeholder="A short note" />
      </Field>
      {type === 'Suspension' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" required id="ri-from"><Input id="ri-from" value={from} onChange={(x) => setFrom(x.target.value)} className="tnum" /></Field>
          <Field label="To" required id="ri-to"><Input id="ri-to" value={to} onChange={(x) => setTo(x.target.value)} className="tnum" /></Field>
          <p className="col-span-2 text-[12.5px] text-ink3 -mt-2">Goes to Lakshmi Rao (Principal) for approval before it starts.</p>
        </div>
      )}
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Date" required id="ri-date"><Input id="ri-date" value={date} onChange={(x) => setDate(x.target.value)} placeholder="DD-MM-YYYY" className="tnum" /></Field>
        <Field label="Points" id="ri-pts"><Input id="ri-pts" value={String(pts)} onChange={(x) => setPoints(Number(x.target.value.replace(/[^\d-]/g, '')) || 0)} className="tnum text-center" /></Field>
      </div>
      <Field label="Action taken" id="ri-act"><Input id="ri-act" value={action} onChange={(x) => setAction(x.target.value)} placeholder="Optional" /></Field>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={inform} onChange={setInform} label="Inform parent" /><span><b className="font-semibold">Inform parent</b><span className="block text-[12.5px] text-ink3">WhatsApp with the school’s template</span></span></label>
    </FormSheet>
  );
}

function CaseSheet({ c, onClose, onUpdate }) {
  const toast = useToast();
  const { go } = useNav();
  const [add, setAdd] = useState(false);
  const [note, setNote] = useState('');
  return (
    <Sheet open onClose={onClose} wide title={`${c.s.name} · ${lab(c.s)}`} sub={`${c.id} · opened ${c.opened} · from ${c.from}`}
      footer={c.status !== 'Closed' ? <><Button variant="ghost" onClick={() => { onUpdate({ ...c, status: 'Closed', next: null }); toast({ title: `${c.id} closed`, body: 'Notes stay private and kept.' }); }}>Close case</Button><Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Record session</Button></> : null}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-brand/8 px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]"><I.Lock size={15} className="text-brand shrink-0" /><span className="text-ink2"><b className="font-semibold text-ink">Highly restricted.</b> Only you (Sana Ali) can read this case. Others see “Private”.</span></div>
        <Button variant="secondary" icon={I.User} className="self-start" onClick={() => { onClose(); go('student', { id: c.s.id }); }}>Open {c.s.name.split(' ')[0]}’s profile</Button>
        <div className="grid @md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3.5"><p className="text-[12px] text-ink3 font-semibold">Next session</p><p className="font-semibold text-[15px] tnum">{c.next || 'None, case closed'}</p></div>
          <div className="rounded-xl border border-line p-3.5"><p className="text-[12px] text-ink3 font-semibold">Outside referral</p><p className="text-[14px]">{c.referral || 'None'}</p></div>
        </div>
        <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Confidential notes</p><p className="rounded-xl bg-sunken/70 p-3.5 text-[14px] leading-relaxed">{c.notes}</p></div>
        <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Action plan and follow-ups</p><p className="text-[14px] leading-relaxed">{c.plan}</p></div>
        {add && (
          <div className="rounded-xl border border-brand/30 p-3.5 flex flex-col gap-2.5 animate-rise">
            <Field label="Session note" required id="cs-note"><Textarea id="cs-note" value={note} onChange={setNote} rows={3} placeholder="What was discussed, and what comes next" /></Field>
            <div className="flex gap-2 justify-end"><Button size="sm" variant="ghost" onClick={() => setAdd(false)}>Cancel</Button><Button size="sm" variant="primary" disabled={!note.trim()} onClick={() => { onUpdate({ ...c, sessions: [['Today, 10:44 AM', note.trim()], ...c.sessions], next: 'Fri 16 Oct, 12:40 PM' }); setAdd(false); setNote(''); toast({ title: 'Session saved', body: 'Next session set for Fri 16 Oct, 12:40 PM.' }); }}>Save session</Button></div>
          </div>
        )}
        <div><p className="text-[13px] font-semibold text-ink2 mb-2">Sessions</p><Timeline items={c.sessions.map(([when, what]) => ({ when, what, icon: 'MessageSquareText', tone: 'brand' }))} /></div>
      </div>
    </Sheet>
  );
}
function NewCaseSheet({ onClose, onSave }) {
  const opts = [k7(14), pickS('8', 'B', 0), pickS('5', 'A', 1), pickS('9', 'A', 0)];
  const [s, setS] = useState(opts[0].id);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Open a counselling case" sub="Only you can read it" submitLabel="Open case"
      onSubmit={() => { if (!why.trim()) { setErr('Write why the case is opened'); return false; } const st = opts.find((x) => x.id === s); onSave({ id: 'CC/2026/015', s: st, opened: '9 Oct 2026', from: 'Sana Ali', status: 'Open', next: 'Mon 12 Oct, 2:20 PM', sessions: [], plan: 'First session on Mon 12 Oct.', notes: why.trim(), referral: null }); }}>
      <Field label="Student" required id="nc-s"><Select id="nc-s" value={s} onChange={setS} options={opts.map((x) => ({ value: x.id, label: `${x.name} · ${lab(x)}` }))} /></Field>
      <Field label="Reason (confidential)" required id="nc-why" error={err}><Textarea id="nc-why" value={why} onChange={(v) => { setWhy(v); setErr(''); }} rows={3} /></Field>
    </FormSheet>
  );
}
function Career({ canEdit }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="info" icon="GraduationCap" title="Class 10 · 132 students.">Career notes, entrance-exam guidance, college applications and alumni mentors. 41 students have a plan so far.</Banner>
      <div className="grid @xl:grid-cols-2 gap-4">
        {CAREER.map((c) => (
          <Card key={c.s.id} className="p-4 @md:p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3"><Avatar name={c.s.name} size={42} /><div className="min-w-0 flex-1"><p className="font-semibold text-[15px] leading-tight">{c.s.name}</p><p className="text-[12.5px] text-ink3">{lab(c.s)} · interest: {c.interest}</p></div></div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13.5px]">
              <div><dt className="text-[12px] text-ink3 font-semibold">Aptitude</dt><dd>{c.apt}</dd></div>
              <div><dt className="text-[12px] text-ink3 font-semibold">Entrance exam</dt><dd>{c.exam}</dd></div>
              <div className="col-span-2"><dt className="text-[12px] text-ink3 font-semibold">Alumni mentor</dt><dd>{c.mentor || <span className="text-ink3">None yet</span>}</dd></div>
            </dl>
            <ul className="rounded-xl border border-line divide-y divide-line/70">
              {c.apps.map(([col, course, st, dl]) => (
                <li key={col} className="flex items-center gap-3 px-3 py-2.5 text-[13.5px]"><I.School size={16} className="text-ink3 shrink-0" /><span className="flex-1 min-w-0"><b className="font-semibold block truncate">{col}</b><span className="text-[12.5px] text-ink3">{course} · deadline {dl}</span></span><Pill tone={st === 'Offer received' ? 'ok' : st === 'Applied' ? 'info' : 'neutral'} className="shrink-0">{st}</Pill></li>
              ))}
            </ul>
            {canEdit && <div className="flex gap-2"><Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add college application', body: 'College, course, status and deadline.', tone: 'info' })}>Add application</Button><Button size="sm" variant="ghost" icon={I.HandCoins} onClick={() => toast({ title: 'Scholarships for higher studies', body: 'Telangana ePASS (post-matric) opens in November. Shared with the parent.', tone: 'info' })}>Scholarships</Button></div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ======================= Promotion ======================= */
const NEXT = { NUR: 'LKG', LKG: 'UKG', UKG: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8', 8: '9', 9: '10', 10: null };
const cname = (id) => CLASSES.find((c) => c.id === id)?.name || 'Passed out';
const short = (id, sec) => (/^\d+$/.test(id) ? `${id} ${sec}` : `${cname(id)} ${sec}`);
const resultOf = (s) => {
  if (s.id === CLASS_7B[20].id) return { r: 'Not passed', pct: 36, note: 'Maths 28%, Science 31%' };
  if (s.id === FEATURED.id) return { r: 'Passed', pct: 87 };
  return { r: 'Passed', pct: 52 + ((s.roll * 13 + s.name.length * 7) % 44) };
};
const leavingOf = (s) => (s.id === CLASS_7B[33].id ? 'Family moving to Bengaluru. TC asked.' : null);
const suggestOf = (s) => (leavingOf(s) ? 'Left' : resultOf(s).r !== 'Passed' || s.att < 75 ? 'Detained' : 'Promoted');
const DEC_TONE = { Promoted: 'ok', Detained: 'warn', Left: 'neutral' };
const HISTORY = [
  ['6 B (2025–26) → 7 B (2026–27)', '37 promoted, 1 detained', 'Lakshmi Rao', '4 Apr 2026'],
  ['6 A (2025–26) → 7 A (2026–27)', '38 promoted', 'Lakshmi Rao', '4 Apr 2026'],
  ['9 C (2025–26) → 10 C (2026–27)', '41 promoted, 2 left', 'Lakshmi Rao', '3 Apr 2026'],
  ['UKG A (2025–26) → 1 A (2026–27)', '40 promoted', 'Srinivas Murthy', '2 Apr 2026'],
];
function Promotion({ access }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const ct = role.id === 'classteacher';
  const [step, setStep] = useState(1);
  const [cls, setCls] = useState('7');
  const [sec, setSec] = useState('B');
  const nextId = NEXT[cls];
  const tSecs = nextId ? CLASSES.find((c) => c.id === nextId).sections : [];
  const [tsec, setTsec] = useState('B');
  const students = (cls === '7' && sec === 'B' ? CLASS_7B : inClass(cls, sec)).slice().sort((a, b) => a.roll - b.roll);
  const [dec, setDec] = useState({});
  const [why, setWhy] = useState({});
  const [secOf, setSecOf] = useState({});
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [tried, setTried] = useState(false);
  const [saved, setSaved] = useState(false);
  const d = (s) => dec[s.id] || suggestOf(s);
  const changed = students.filter((s) => d(s) !== suggestOf(s));
  const missingWhy = changed.filter((s) => !(why[s.id] || '').trim());
  const count = (k) => students.filter((s) => d(s) === k).length;
  const from = `${short(cls, sec)} (2026–27)`;
  const to = nextId ? `${short(nextId, tSecs.includes(tsec) ? tsec : tSecs[0])} (2027–28)` : 'Passed out (alumni)';
  const t = q.trim().toLowerCase();
  const shown = students.filter((s) => !t || s.name.toLowerCase().includes(t) || String(s.roll) === t);
  const pick = (c) => { setCls(c); const sc = CLASSES.find((x) => x.id === c).sections; setSec(sc.includes(sec) ? sec : sc[0]); setDec({}); setWhy({}); setSaved(false); };
  const steps = [['Choose', 'Class and target'], ['Review the batch', `${students.length} students`], ['Confirm', 'Save the batch']];
  return (
    <div>
      <ModuleHead sub={ct ? 'Check the year-end list for your class, 7 B. The Principal saves the batch.' : role.id === 'officestaff' ? 'Prepare the year-end list for a class. The Principal saves the batch.' : 'Move a whole class to the next class at year end, after checking results and the list.'} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Banner tone="info" icon="CalendarRange" title="2027–28 is being prepared.">Final results publish on 31 Mar 2027. Until then the list uses Unit Tests 1 and 2 and updates by itself. Saved batches move students on 1 Jun 2027.</Banner>
        <Card className="p-3 @md:p-4">
          <ol className="grid grid-cols-3 gap-2">
            {steps.map(([l, s], i) => {
              const n = i + 1; const on = step === n; const done = step > n || (saved && n === 3);
              return (
                <li key={l}>
                  <button onClick={() => n < step && setStep(n)} className={cx('w-full flex items-center gap-2.5 rounded-xl px-2 @md:px-3 py-2 text-left', on && 'bg-brand/8')}>
                    <span className={cx('w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold tnum shrink-0', done ? 'bg-ok/15 text-ok' : on ? 'bg-brand text-brandink' : 'bg-sunken text-ink3')}>{done ? <I.Check size={16} strokeWidth={3} /> : n}</span>
                    <span className="min-w-0"><b className={cx('block text-[13.5px] font-semibold truncate', !on && 'text-ink2')}>{l}</b><span className="hidden @md:block text-[12px] text-ink3 truncate">{s}</span></span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        {step === 1 && (
          <Card>
            <CardHead title="Choose the class" sub="Default target: the next class, same section name, next year" icon={I.ListChecks} />
            <div className="px-5 pb-5 grid @lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
              <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                <p className="eyebrow text-ink3">From · 2026–27</p>
                <Field label="Class" id="pr-cls"><Select id="pr-cls" value={cls} onChange={pick} options={CLASSES.map((c) => ({ value: c.id, label: c.name }))} className={cx(ct && 'pointer-events-none opacity-90')} /></Field>
                <Field label="Section" id="pr-sec"><Segmented value={sec} onChange={(v) => { if (!ct) { setSec(v); setDec({}); } }} options={CLASSES.find((c) => c.id === cls).sections} className="w-full" /></Field>
                {ct && <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Lock size={13} className="mt-0.5" />Your class only</p>}
              </div>
              <span className="hidden @lg:grid w-10 h-10 mt-16 rounded-full bg-sunken text-ink3 place-items-center"><I.ArrowRight size={18} /></span>
              <div className="rounded-xl border border-line p-4 flex flex-col gap-3">
                <p className="eyebrow text-ink3">To · 2027–28</p>
                <Field label="Class" id="pr-tcls"><Input id="pr-tcls" value={nextId ? cname(nextId) : 'Passed out: alumni'} readOnly className="!bg-sunken/50" /></Field>
                {nextId && <Field label="Section" id="pr-tsec" hint="Students can be split across sections in the next step"><Segmented value={tSecs.includes(tsec) ? tsec : tSecs[0]} onChange={setTsec} options={tSecs} className="w-full" /></Field>}
              </div>
            </div>
            <div className="px-5 pb-5 flex flex-col @md:flex-row @md:items-center gap-3 justify-between border-t border-line/70 pt-4">
              <p className="text-[14px] text-ink2"><b className="font-semibold text-ink tnum">{students.length} students</b> in {short(cls, sec)} · moving to {to}</p>
              <Button variant="primary" iconRight={I.ArrowRight} onClick={() => setStep(2)}>Review {students.length} students</Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <>
            <Stats items={[
              { label: 'Promoted', value: String(count('Promoted')), sub: `To ${to}`, tone: 'ok', icon: 'ArrowUpRight' },
              { label: 'Detained', value: String(count('Detained')), sub: `Repeat ${short(cls, sec)}`, tone: 'warn', icon: 'RotateCcw' },
              { label: 'Left', value: String(count('Left')), sub: 'Go to Leaving & Alumni', icon: 'LogOut' },
              { label: 'Changed by hand', value: String(changed.length), sub: missingWhy.length ? `${missingWhy.length} need a reason` : 'Reasons given', tone: missingWhy.length ? 'bad' : undefined, icon: 'Pencil' },
            ]} />
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="pr-q" value={q} onChange={setQ} placeholder="Name or roll number" />
                <ExportButton what={`promotion list ${short(cls, sec)}`} />
              </Toolbar>
              <ul className="divide-y divide-line/70">
                {shown.map((s) => {
                  const r = resultOf(s); const sg = suggestOf(s); const v = d(s); const ch = v !== sg; const lv = leavingOf(s);
                  return (
                    <li key={s.id} className={cx('px-4 @md:px-5 py-3 flex flex-col @lg:flex-row @lg:items-center gap-2.5 @lg:gap-4', ch && 'bg-warn/[.05]')}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="w-6 text-center text-[13px] font-semibold text-ink3 tnum shrink-0">{s.roll}</span>
                        <Avatar name={s.name} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] truncate">{s.name}</p>
                          <p className="text-[12.5px] text-ink3 truncate">
                            <span className={cx(r.r !== 'Passed' && 'text-bad font-semibold')}>{r.r} {r.pct}%</span>{r.note && ` (${r.note})`} · Attendance {s.att}%{lv && <> · <span className="text-ink2">{lv}</span></>}
                          </p>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            {s.due > 0 && <Pill tone="warn" className="!h-5 !text-[11px]">{inr(s.due)} fees due · warning only</Pill>}
                            <Pill tone={DEC_TONE[sg]} className="!h-5 !text-[11px]">Suggested: {sg}</Pill>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 @lg:shrink-0">
                        <Segmented size="sm" value={v} onChange={(x) => { if (!canEdit) return; setDec((m) => ({ ...m, [s.id]: x })); }} options={['Promoted', 'Detained', 'Left']} className="flex-1 @lg:flex-none" />
                        {v === 'Promoted' && nextId && tSecs.length > 1 && (
                          <select aria-label={`Section for ${s.name}`} value={secOf[s.id] || (tSecs.includes(tsec) ? tsec : tSecs[0])} onChange={(e) => setSecOf((m) => ({ ...m, [s.id]: e.target.value }))} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] font-semibold">
                            {tSecs.map((x) => <option key={x} value={x}>{nextId} {x}</option>)}
                          </select>
                        )}
                      </div>
                      {ch && (
                        <div className="@lg:w-56">
                          <Input id={`why-${s.id}`} aria-label={`Reason for ${s.name}`} value={why[s.id] || ''} onChange={(e) => setWhy((m) => ({ ...m, [s.id]: e.target.value }))} placeholder="Reason for the change" error={tried && !(why[s.id] || '').trim()} className="!h-9 text-[13.5px]" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-col @md:flex-row @md:items-center justify-between gap-3 px-4 @md:px-5 py-3 border-t border-line">
                <p className={cx('text-[13px]', tried && missingWhy.length ? 'text-bad font-semibold' : 'text-ink3')}>{tried && missingWhy.length ? `Give a reason for ${missingWhy.map((s) => s.name).join(', ')}` : 'Changes from the suggestion need a reason. Fee dues are a warning only.'}</p>
                <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(1)}>Back</Button><Button variant="primary" iconRight={I.ArrowRight} onClick={() => { setTried(true); if (!missingWhy.length) setStep(3); }}>Continue</Button></div>
              </div>
            </Card>
          </>
        )}

        {step === 3 && (
          <Card>
            <CardHead title="Confirm" sub={`${from} → ${to}`} icon={I.CircleCheck} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Promoted', count('Promoted'), 'ok'], ['Detained', count('Detained'), 'warn'], ['Left', count('Left'), 'neutral']].map(([k, n, tone]) => (
                  <div key={k} className="rounded-xl bg-sunken/60 p-3.5"><p className={cx('font-display text-[26px] font-semibold tnum leading-none', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn')}>{n}</p><p className="text-[12.5px] font-semibold text-ink2 mt-1">{k}</p></div>
                ))}
              </div>
              <p className="text-[15px]"><b className="font-semibold">{count('Promoted')} promoted to {to}</b>, {count('Detained')} detained in {short(cls, sec)}, {count('Left')} leaving.</p>
              <ul className="flex flex-col gap-2 text-[14px] text-ink2">
                {['Students move to the new class on 1 Jun 2027 with the 2027–28 fee plan.', `${short(cls, sec)} in 2026–27 keeps the same students, marks and attendance. Nothing is overwritten.`, 'Students marked Left go to the Leaving & Alumni list for clearance and TC.', 'The batch can be undone while nothing is recorded for these students in 2027–28.'].map((x) => <li key={x} className="flex gap-2.5"><I.Check size={17} className="text-brand shrink-0 mt-0.5" />{x}</li>)}
              </ul>
              {changed.length > 0 && <div className="rounded-xl border border-line p-3.5 text-[13.5px]"><p className="font-semibold mb-1">Changed from the suggestion</p>{changed.map((s) => <p key={s.id} className="text-ink2">{s.name}: {suggestOf(s)} → {d(s)} · “{why[s.id]}”</p>)}</div>}
              {saved ? <Banner tone="ok" title="Batch saved.">PB/2027/{cls}{sec} · {count('Promoted')} promoted. Undo from Promotion history while nothing is recorded in 2027–28.</Banner> : canEdit && (
                <div className="flex gap-2 justify-end flex-wrap">
                  <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
                  {ct || role.id === 'officestaff' ? <Button variant="primary" icon={I.Send} onClick={() => { setSaved(true); toast({ title: 'Sent to Lakshmi Rao for confirmation', body: `${short(cls, sec)} list · ${changed.length} changes with reasons.` }); }}>Send to Principal for confirmation</Button>
                    : <Button variant="primary" icon={I.Check} onClick={() => setConfirm(true)}>Save batch</Button>}
                </div>
              )}
            </div>
          </Card>
        )}

        <Card>
          <CardHead title="Promotion history" sub="Past batches and who confirmed them" icon={I.History} />
          <ul className="px-2 pb-2">
            {HISTORY.map(([w, n, by, when]) => <Row key={w} icon="ArrowUpRight" iconTone="ok" title={w} sub={`${n} · confirmed by ${by}`} right={<span className="text-[12.5px] text-ink3 tnum">{when}</span>} />)}
          </ul>
        </Card>
      </div>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title={`Promote ${count('Promoted')} students from ${from} to ${to}?`} sub={`${count('Detained')} detained in ${short(cls, sec)} and ${count('Left')} leaving. Runs once for this batch.`}
        confirmLabel={`Save batch: ${count('Promoted')} promoted`} onConfirm={() => { setSaved(true); toast({ title: `Batch saved: ${count('Promoted')} promoted to ${to}`, body: 'They move on 1 Jun 2027 with the new fee plan.', undo: () => setSaved(false) }); }} />
    </div>
  );
}

/* ======================= Leaving & Alumni ======================= */
const LEAVING = [
  { id: 'LV-018', s: CLASS_7B[33], type: 'Transfer', reason: 'Family moving to another city', last: '31 Oct 2026', dest: 'Delhi Public School, Bengaluru East', fees: 4500, books: [['Wings of Fire', 'due 14 Oct']], hostel: null, inv: 0, tc: 'Blocked' },
  { id: 'LV-017', s: pickS('9', 'B', 1), type: 'Transfer', reason: 'Parent transferred (job)', last: '15 Oct 2026', dest: 'Kendriya Vidyalaya No. 1, Pune', fees: 0, books: [['Physics for Class 9', 'due 2 Oct'], ['The Diary of a Young Girl', 'due 7 Oct']], hostel: 'Bed B-14 not handed over', boarder: true, inv: 0, tc: 'Blocked' },
  { id: 'LV-016', s: pickS('6', 'A', 2), type: 'Transfer', reason: 'Changing to State board', last: '30 Oct 2026', dest: 'Telangana Model School, Miyapur', fees: 12800, books: [], hostel: null, inv: 0, tc: 'Waiver asked' },
  { id: 'LV-015', s: pickS('4', 'A', 0), type: 'Withdrawal', reason: 'Health reasons', last: '16 Oct 2026', dest: '', fees: 0, books: [], hostel: null, inv: 0, tc: 'Ready to issue' },
  { id: 'LV-014', s: pickS('2', 'B', 0), type: 'Transfer', reason: 'School nearer home', last: '9 Oct 2026', dest: 'Sri Chaitanya Techno School, Miyapur', fees: 0, books: [], hostel: null, inv: 0, tc: 'Waiting for approval' },
];
const LEFT = [
  [pickS('5', 'B', 1), '30 Sep 2026', 'Transfer', 'Kendriya Vidyalaya, Golconda', 'TC/2026/0030'],
  [pickS('8', 'A', 2), '12 Aug 2026', 'Transfer', 'Delhi Public School, Nacharam', 'TC/2026/0027'],
  [pickS('3', 'B', 0), '31 Jul 2026', 'Withdrawal', 'Moved abroad (Dubai)', 'TC/2026/0024'],
  [pickS('UKG', 'B', 0), '18 Jun 2026', 'Transfer', 'Oakridge International, Bachupally', 'TC/2026/0019'],
];
const ALUMNI = [
  ['Kiran Kumar', 2016, 'B.Tech, IIT Hyderabad', 'Software engineer, Microsoft', 'Mentors 3 students'],
  ['Sneha Reddy', 2014, 'B.Com, St. Francis College', 'Chartered Accountant, Deloitte', 'Donated ₹50,000 for the library'],
  ['Dr. Harini Naidu', 2012, 'MBBS, Osmania Medical College', 'Paediatrician, Rainbow Hospital', 'Health talk for Class 10'],
  ['Arjun Varma', 2020, 'B.Sc Physics, University of Hyderabad', 'Studying M.Sc', 'National Science Olympiad medal 2020'],
  ['Meghana Rao', 2018, 'B.Des, NID Ahmedabad', 'Designer, Swiggy', 'Designed the school magazine 2025'],
];
const tcTone = { Blocked: 'bad', 'Waiver asked': 'warn', 'Ready to issue': 'ok', 'Waiting for approval': 'info' };
function Leaving() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState('leaving');
  const [list, setList] = useState(LEAVING);
  const [open, setOpen] = useState(null);
  const [start, setStart] = useState(false);
  const [waive, setWaive] = useState(null);
  const [q, setQ] = useState('');
  const [per, setPer] = useState(PERIODS.acyear);
  const leftRows = LEFT.filter((r) => inPeriod(r[1], per));
  const checks = (l) => [
    ['Fees', l.fees ? `${inr(l.fees)} due` : 'Clear', !l.fees, 'IndianRupee'],
    ['Library', l.books.length ? `${l.books.length} ${l.books.length === 1 ? 'book' : 'books'} out` : 'Clear', !l.books.length, 'BookOpen'],
    ...(l.boarder ? [['Hostel', l.hostel ? 'Bed not handed over' : 'Clear', !l.hostel, 'BedDouble']] : []),
    ['Inventory', l.inv ? `${l.inv} items` : 'Clear', !l.inv, 'Boxes'],
  ];
  const cur = list.find((l) => l.id === open);
  const asks = (l) => l.tc === 'Waiver asked' || l.tc === 'Waiting for approval';
  const t = q.trim().toLowerCase();
  return (
    <div>
      <ModuleHead sub="Transfer or withdrawal with fee and library clearance, and records of past students"
        actions={<Button variant="primary" icon={I.LogOut} onClick={() => setStart(true)}>Start leaving</Button>} />
      <div className="flex flex-col gap-4">
        {!canEdit && canOpen(role, 'approvals') && list.some(asks) && (
          <Banner tone="info" icon="BadgeCheck" title={`${list.filter(asks).length} waiting for you:`}
            action={<Button size="sm" variant="secondary" iconRight={I.ChevronRight} onClick={() => go('approvals')}>Open Approvals</Button>}>
            The office starts leaving and asks for the TC. You decide TCs and fee waivers in Approvals.
          </Banner>
        )}
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'leaving', label: 'Leaving', count: list.length }, { id: 'left', label: 'Left', count: leftRows.length }, { id: 'alumni', label: 'Alumni', count: 2840 }]} />
        {tab === 'leaving' && (
          <Card className="overflow-hidden">
            <Toolbar><SearchBox id="lv-q" value={q} onChange={setQ} placeholder="Student name" /><ExportButton what="leaving list" /></Toolbar>
            <DataList rows={list.filter((l) => !t || l.s.name.toLowerCase().includes(t))} onRow={(l) => setOpen(l.id)} minWidth={900}
              columns={[
                { key: 's', label: 'Student', render: (l) => <div className="flex items-center gap-3"><Avatar name={l.s.name} size={34} /><div><p className="font-semibold leading-tight whitespace-nowrap">{l.s.name}</p><p className="text-[12px] text-ink3">{lab(l.s)} · <span className="font-mono">{l.s.adm}</span></p></div></div> },
                { key: 'r', label: 'Reason', render: (l) => <><p className="text-[13.5px]">{l.type}</p><p className="text-[12px] text-ink3">{l.reason}</p></> },
                { key: 'd', label: 'Last date', nowrap: true, render: (l) => <span className="text-[13.5px] tnum">{l.last.replace(' 2026', '')}</span> },
                { key: 'c', label: 'Clearance', render: (l) => <div className="flex gap-1 flex-wrap max-w-[260px]">{checks(l).filter(([k, , , ]) => k !== 'Inventory').map(([k, v, ok]) => <Pill key={k} tone={ok ? 'ok' : 'bad'} className="!h-[22px] !text-[11.5px]">{k}{ok ? '' : `: ${v}`}</Pill>)}</div> },
                { key: 't', label: 'TC', render: (l) => <Pill tone={tcTone[l.tc]}>{l.tc}</Pill> },
              ]}
              mobile={(l) => ({ title: l.s.name, sub: `${lab(l.s)} · ${l.type} · last day ${l.last.replace(' 2026', '')}`, avatar: l.s.name, pills: [<Pill key="t" tone={tcTone[l.tc]} className="!h-[22px] !text-[11.5px]">TC: {l.tc.toLowerCase()}</Pill>, ...checks(l).filter((c) => !c[2]).map(([k, v]) => <Pill key={k} tone="bad" className="!h-[22px] !text-[11.5px]">{k}: {v}</Pill>)] })} />
          </Card>
        )}
        {tab === 'left' && (
          <Card className="overflow-hidden">
            <Toolbar>
              <p className="flex-1 min-w-0 self-center text-[13.5px] text-ink2"><b className="font-semibold text-ink">Left</b> · status changed to Transferred or Withdrawn on the last date</p>
              <DatePeriod id="lv-period" value={per} onChange={setPer} className="w-full @md:w-auto" />
              <ExportButton what="students who left" />
            </Toolbar>
            <DataList rows={leftRows} rowKey={(r) => r[4]} minWidth={720} footer={`${leftRows.length} left · ${fmtRange(per)}`}
              empty={<Empty icon={I.CalendarX2} title="Nobody left in these dates" body={`No transfers or withdrawals ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.acyear)}>Show this academic year</Button>} />}
              columns={[
                { key: 's', label: 'Student', render: (r) => <div className="flex items-center gap-3"><Avatar name={r[0].name} size={32} /><div><p className="font-semibold leading-tight">{r[0].name}</p><p className="text-[12px] text-ink3">{lab(r[0])}</p></div></div> },
                { key: 'd', label: 'Left on', nowrap: true, render: (r) => <span className="tnum text-[13.5px]">{r[1]}</span> },
                { key: 't', label: 'Type', render: (r) => <Pill tone={r[2] === 'Transfer' ? 'info' : 'neutral'}>{r[2] === 'Transfer' ? 'Transferred' : 'Withdrawn'}</Pill> },
                { key: 'w', label: 'Went to', render: (r) => <span className="text-[13.5px]">{r[3]}</span> },
                { key: 'tc', label: 'TC', nowrap: true, render: (r) => <span className="font-mono text-[12.5px]">{r[4]}</span> },
              ]}
              mobile={(r) => ({ title: r[0].name, sub: `${lab(r[0])} · left ${r[1]} · ${r[3]}`, avatar: r[0].name, pills: [<Pill key="tc" tone="neutral" className="!h-[22px] !text-[11.5px] font-mono">{r[4]}</Pill>] })} />
          </Card>
        )}
        {tab === 'alumni' && (
          <Split>
            <Card className="overflow-hidden">
              <CardHead title="Alumni" sub="2,840 past students since 1998 · graduation year, career and achievements" action={<ExportButton what="alumni" />} />
              <DataList rows={ALUMNI} rowKey={(r) => r[0]} minWidth={700}
                columns={[
                  { key: 'n', label: 'Name', render: (r) => <div className="flex items-center gap-3"><Avatar name={r[0]} size={32} /><div><p className="font-semibold leading-tight">{r[0]}</p><p className="text-[12px] text-ink3">Batch {r[1]}</p></div></div> },
                  { key: 'h', label: 'Higher education', render: (r) => <span className="text-[13.5px]">{r[2]}</span> },
                  { key: 'c', label: 'Career', render: (r) => <span className="text-[13.5px]">{r[3]}</span> },
                  { key: 'a', label: 'Achievements', render: (r) => <span className="text-[13px] text-ink2">{r[4]}</span> },
                ]}
                mobile={(r) => ({ title: r[0], sub: `Batch ${r[1]} · ${r[3]}`, avatar: r[0] })} />
            </Card>
            <Col>
              {role.access.finance && <Card>
                <CardHead title="Donations this year" icon={I.HandHeart} />
                <div className="px-5 pb-4"><p className="font-display text-[26px] font-semibold tnum">{inr(185000)}</p><p className="text-[12.5px] text-ink3">From 7 alumni · receipts through Finance, Income</p></div>
                <ul className="px-2 pb-2">{[['Sneha Reddy', 'Library books', 50000], ['Batch 2010', 'Smart class, 9 C', 85000], ['Kiran Kumar', 'Scholarship fund', 50000]].map(([n, p, a]) => <Row key={n + p} avatar={n} title={n} sub={p} right={<span className="font-semibold tnum text-[13.5px]">{inr(a)}</span>} />)}</ul>
              </Card>}
              <Card>
                <CardHead title="Mentorship and job board" icon={I.Briefcase} />
                <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px]">
                  <li className="flex gap-2.5"><I.Users size={16} className="text-ink3 shrink-0 mt-0.5" /><span><b className="font-semibold">12 alumni mentors</b> linked to 31 Class 10 students</span></li>
                  <li className="flex gap-2.5"><I.Briefcase size={16} className="text-ink3 shrink-0 mt-0.5" /><span><b className="font-semibold">4 open job posts</b>, newest: Junior developer, Hyderabad (posted by Kiran Kumar)</span></li>
                </ul>
                {canEdit && <div className="px-5 pb-5"><Button variant="soft" icon={I.Plus} onClick={() => toast({ title: 'New job post', body: 'Title, company, place and how to apply. Shared with alumni by email.', tone: 'info' })}>Add job post</Button></div>}
              </Card>
            </Col>
          </Split>
        )}
      </div>

      <Sheet open={!!cur} onClose={() => setOpen(null)} wide title={cur ? `${cur.s.name} · ${lab(cur.s)}` : ''} sub={cur ? `${cur.type} · ${cur.reason} · last day ${cur.last}${cur.dest ? ' · to ' + cur.dest : ''}` : ''}
        footer={cur && canEdit ? <>
          {checks(cur).some((c) => !c[2]) && cur.tc !== 'Waiver asked' && <Button variant="secondary" icon={I.ShieldQuestion} onClick={() => setWaive(cur)}>Request a waiver</Button>}
          <Button variant="primary" icon={I.FileOutput} disabled={checks(cur).some((c) => !c[2]) || cur.tc === 'Waiting for approval'} onClick={() => { setList((l) => l.map((x) => (x.id === cur.id ? { ...x, tc: 'Waiting for approval' } : x))); toast({ title: 'TC sent for approval', body: `TC/2026/0032 for ${cur.s.name} is waiting for Lakshmi Rao in Approvals.` }); }}>{cur.tc === 'Waiting for approval' ? 'TC waiting for approval' : 'Issue TC'}</Button>
        </> : cur && asks(cur) && canOpen(role, 'approvals') ? <Button variant="primary" iconRight={I.ChevronRight} onClick={() => { setOpen(null); go('approvals'); }}>Decide in Approvals</Button> : null}>
        {cur && (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink2">Clearance checks (automation A14). The TC can be issued when every check is clear or waived.</p>
            <ul className="rounded-2xl border border-line divide-y divide-line/70">
              {checks(cur).map(([k, v, ok, ic]) => (
                <li key={k} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', ok ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad')}><Icon name={ic} size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px]">{k}</p>
                    <p className={cx('text-[12.5px]', ok ? 'text-ink3' : 'text-bad')}>{k === 'Library' && cur.books.length ? cur.books.map((b) => `“${b[0]}” ${b[1]}`).join(' · ') : k === 'Hostel' && cur.hostel ? cur.hostel : v}</p>
                  </div>
                  {!ok && k === 'Fees' && (canDo(role, 'fees.collect') ? <Button size="sm" variant="soft" icon={I.IndianRupee} onClick={() => go('fees', { student: cur.s.id })}>Collect fee</Button> : <span className="text-[12px] text-ink3">Accounts counter</span>)}
                  {!ok && k === 'Library' && (canDo(role, 'library.issue') ? <Button size="sm" variant="soft" icon={I.CornerDownLeft} onClick={() => go('library', { page: 'issue' })}>Return book</Button> : <span className="text-[12px] text-ink3 text-right">Ask Padma Iyer (library)</span>)}
                  {!ok && k === 'Hostel' && <span className="text-[12px] text-ink3 text-right">Joseph Thomas (warden)</span>}
                  {ok && <I.CircleCheck size={18} className="text-ok" />}
                </li>
              ))}
            </ul>
            {cur.tc === 'Waiver asked' && <Banner tone="warn" title="Waiver asked.">Fee waiver of {inr(cur.fees)} is waiting for {role.id === 'principal' ? 'you' : 'Lakshmi Rao'} in Approvals.</Banner>}
            {checks(cur).some((c) => !c[2]) && <p className="text-[13px] text-bad font-semibold flex items-center gap-1.5"><I.Lock size={14} />TC blocked: {checks(cur).filter((c) => !c[2]).map((c) => c[0] === 'Fees' ? `${inr(cur.fees)} fees due` : c[0] === 'Library' ? `${cur.books.length} library ${cur.books.length === 1 ? 'book' : 'books'} not returned` : 'hostel bed not handed over').join(' and ')}</p>}
          </div>
        )}
      </Sheet>
      {start && <StartLeavingSheet onClose={() => setStart(false)} onSave={(n) => { setList((l) => [n, ...l]); setTab('leaving'); toast({ title: `Leaving started for ${n.s.name}`, body: 'Clearance checks ran: fees, library, hostel and inventory.' }); }} />}
      {waive && <WaiverSheet l={waive} onClose={() => setWaive(null)} onSave={() => { setList((l) => l.map((x) => (x.id === waive.id ? { ...x, tc: 'Waiver asked' } : x))); toast({ title: 'Waiver request sent', body: 'Lakshmi Rao decides it in Approvals. Nobody approves their own request.' }); }} />}
    </div>
  );
}
function StartLeavingSheet({ onClose, onSave }) {
  const opts = [FEATURED, pickS('5', 'A', 0), pickS('8', 'B', 1), pickS('1', 'A', 0)];
  const [s, setS] = useState(opts[1].id);
  const [type, setType] = useState('Transfer');
  const [reason, setReason] = useState('');
  const [last, setLast] = useState('09-10-2026');
  const [dest, setDest] = useState('');
  const [doc, setDoc] = useState(false);
  const [tch, setTch] = useState(false);
  const err = { reason: !reason ? 'Choose a reason' : '', dest: type === 'Transfer' && !dest.trim() ? 'Needed for a transfer' : '' };
  return (
    <FormSheet open onClose={onClose} title="Start leaving" sub="Clearance checks run as soon as you save" submitLabel="Start leaving"
      onSubmit={() => { setTch(true); if (err.reason || err.dest) return false; const st = opts.find((x) => x.id === s); onSave({ id: 'LV-019', s: st, type, reason, last: last === '09-10-2026' ? '9 Oct 2026' : last, dest, fees: st.due, books: st.id === FEATURED.id ? [['Wings of Fire', 'due 14 Oct']] : [], hostel: null, inv: 0, tc: st.due || st.id === FEATURED.id ? 'Blocked' : 'Ready to issue' }); }}>
      <Field label="Student" required id="sl-s"><Select id="sl-s" value={s} onChange={setS} options={opts.map((x) => ({ value: x.id, label: `${x.name} · ${lab(x)} · ${x.adm}` }))} /></Field>
      <Field label="Type" required id="sl-t"><Segmented value={type} onChange={setType} options={['Transfer', 'Withdrawal']} className="w-full" /></Field>
      <Field label="Reason" required id="sl-r" error={tch && err.reason}><Select id="sl-r" value={reason} onChange={setReason} error={tch && err.reason} options={[{ value: '', label: 'Choose a reason' }, 'Family moving to another city', 'Parent transferred (job)', 'School nearer home', 'Changing board', 'Fee difficulty', 'Health reasons', 'Other']} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last date" required id="sl-d"><Input id="sl-d" value={last} onChange={(x) => setLast(x.target.value)} placeholder="DD-MM-YYYY" className="tnum" /></Field>
        <Field label="Documents" id="sl-doc">{doc ? <span className="h-11 flex items-center gap-2 text-[13.5px] font-semibold"><I.FileText size={16} className="text-ink3" />parent-letter.pdf</span> : <Button type="button" variant="secondary" icon={I.Upload} onClick={() => setDoc(true)}>Parent’s letter</Button>}</Field>
      </div>
      <Field label="Destination school" required={type === 'Transfer'} id="sl-dest" error={tch && err.dest}><Input id="sl-dest" value={dest} onChange={(x) => setDest(x.target.value)} error={tch && err.dest} placeholder="School name and city" /></Field>
    </FormSheet>
  );
}
function WaiverSheet({ l, onClose, onSave }) {
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Request a waiver" sub={`${l.s.name} · goes to Lakshmi Rao in Approvals`} submitLabel="Send request"
      onSubmit={() => { if (!why.trim()) { setErr('A waiver needs a reason'); return false; } onSave(); }}>
      <Field label="Reason" required id="wv-why" error={err}><Textarea id="wv-why" value={why} onChange={(v) => { setWhy(v); setErr(''); }} rows={3} placeholder="For example: family in hardship, Principal agreed at the meeting on 8 Oct" /></Field>
    </FormSheet>
  );
}

/* ======================= Certificates & ID Cards ======================= */
const CERT_TYPES = ['Bonafide', 'Study', 'Conduct / character', 'Transfer certificate (TC)', 'Migration'];
const CERTS = [
  { no: 'BON/2026/0142', type: 'Bonafide', s: FEATURED, date: '9 Oct 2026', status: 'Issued', purpose: 'Bank account opening (SBI, KPHB)' },
  { no: 'TC/2026/0031', type: 'Transfer certificate (TC)', s: LEAVING[4].s, date: '9 Oct 2026', status: 'Requested', purpose: 'Transfer to Sri Chaitanya Techno School, Miyapur', by: 'Naveen Kumar' },
  { no: 'CHR/2026/0018', type: 'Conduct / character', s: pickS('10', 'A', 1), date: '8 Oct 2026', status: 'Approved', purpose: 'Junior college admission' },
  { no: 'STU/2026/0067', type: 'Study', s: pickS('5', 'B', 0), date: '7 Oct 2026', status: 'Issued', purpose: 'Passport application' },
  { no: 'BON/2026/0141', type: 'Bonafide', s: pickS('8', 'B', 0), date: '6 Oct 2026', status: 'Issued', purpose: 'Scholarship (Telangana ePASS)' },
  { no: 'TC/2026/0030', type: 'Transfer certificate (TC)', s: LEFT[0][0], date: '30 Sep 2026', status: 'Issued', purpose: 'Transfer to Kendriya Vidyalaya, Golconda' },
  { no: 'MIG/2026/0004', type: 'Migration', s: pickS('9', 'A', 0), date: '25 Sep 2026', status: 'Issued', purpose: 'Moving to an ICSE school in Mumbai' },
  { no: 'BON/2026/0139', type: 'Bonafide', s: pickS('6', 'B', 1), date: '24 Sep 2026', status: 'Cancelled', purpose: 'Wrong purpose printed. Reissued as BON/2026/0140.' },
];
const CERT_TONE = { Requested: 'warn', Approved: 'info', Issued: 'ok', Cancelled: 'neutral' };
const STRENGTH = { NUR: 44, LKG: 80, UKG: 82, 1: 92, 2: 94, 3: 96, 4: 98, 5: 104, 6: 102, 7: 76, 8: 96, 9: 140, 10: 132 };
const secCounts = (c) => { const n = STRENGTH[c.id]; const k = c.sections.length; return c.sections.map((s, i) => [s, Math.floor(n / k) + (i < n % k ? 1 : 0)]); };
const batchesOf = (secs) => {
  const out = []; let parts = []; let cnt = 0;
  for (const [s, n] of secs) {
    let st = 1;
    while (st <= n) {
      const take = Math.min(n - st + 1, 50 - cnt);
      parts.push(`${s} roll ${st}–${st + take - 1}`); cnt += take; st += take;
      if (cnt === 50) { out.push({ parts, cnt }); parts = []; cnt = 0; }
    }
  }
  if (cnt) out.push({ parts, cnt });
  return out;
};

function Certificates() {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const isP = role.id === 'principal';
  const [tab, setTab] = useState('certs');
  const [certs, setCerts] = useState(CERTS);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [issue, setIssue] = useState(false);
  const [view, setView] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [cls, setCls] = useState('7');
  const [card, setCard] = useState(false);
  const [reprint, setReprint] = useState(false);
  const [printed, setPrinted] = useState({});
  const [per, setPer] = useState(PERIODS.last30);
  const t = q.trim().toLowerCase();
  const rows = certs.filter((c) => inPeriod(c.date, per) && (st === 'all' || c.status === st) && (!t || c.s.name.toLowerCase().includes(t) || c.no.toLowerCase().includes(t)));
  const C = CLASSES.find((c) => c.id === cls);
  const secs = secCounts(C);
  const batches = batchesOf(secs);
  const missing = cls === '7' ? [[k7(5).name, '7 B'], [pickS('7', 'A', 2).name, '7 A']] : (+STRENGTH[cls] % 3 === 0 ? [[pickS(cls, C.sections[0], 0).name, short(cls, C.sections[0])]] : []);
  const setStatus = (no, status) => setCerts((l) => l.map((c) => (c.no === no ? { ...c, status } : c)));
  return (
    <div>
      <ModuleHead sub="TC, bonafide, study and character certificates, and student ID cards class by class"
        actions={tab === 'certs' ? <Button variant="primary" icon={I.FilePlus2} onClick={() => setIssue(true)}>Issue certificate</Button> : <Button variant="secondary" icon={I.RefreshCw} onClick={() => setReprint(true)}>Reprint a card</Button>} />
      <div className="flex flex-col gap-4">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'certs', label: 'Certificates', count: certs.length }, { id: 'ids', label: 'ID cards' }]} />
        {tab === 'certs' ? (
          <>
            {!canEdit && canOpen(role, 'approvals') && certs.some((c) => c.status === 'Requested') && (
              <Banner tone="info" icon="BadgeCheck" title={`${certs.filter((c) => c.status === 'Requested').length} waiting for you:`}
                action={<Button size="sm" variant="secondary" iconRight={I.ChevronRight} onClick={() => go('approvals')}>Open Approvals</Button>}>
                The office issues certificates. TCs and character certificates come to you in Approvals.
              </Banner>
            )}
            <Chips value={st} onChange={setSt} options={[{ value: 'all', label: 'All', count: certs.filter((c) => inPeriod(c.date, per)).length }, ...['Requested', 'Approved', 'Issued', 'Cancelled'].map((x) => ({ value: x, label: x, count: certs.filter((c) => c.status === x && inPeriod(c.date, per)).length }))]} />
            <Card className="overflow-hidden">
              <Toolbar><SearchBox id="ce-q" value={q} onChange={setQ} placeholder="Student name or certificate number" /><DatePeriod id="ce-period" value={per} onChange={setPer} className="w-full @md:w-auto" /><ExportButton what="certificates" /></Toolbar>
              <DataList rows={rows} rowKey={(c) => c.no} onRow={(c) => setView(c)} minWidth={880} footer={`Showing ${rows.length} of ${certs.length} · ${fmtRange(per)}`}
                empty={<Empty icon={I.SearchX} title="No certificates match" body={`Nothing issued or asked for ${fmtRange(per)} for these filters.`} action={<Button variant="secondary" onClick={() => { setQ(''); setSt('all'); setPer(PERIODS.last30); }}>Clear filters</Button>} />}
                columns={[
                  { key: 'n', label: 'Number', nowrap: true, render: (c) => <span className="font-mono text-[12.5px]">{c.no}</span> },
                  { key: 't', label: 'Type', render: (c) => <span className="text-[13.5px] whitespace-nowrap">{c.type}</span> },
                  { key: 's', label: 'Student', render: (c) => <div className="flex items-center gap-2.5"><Avatar name={c.s.name} size={30} /><div><p className="font-semibold leading-tight whitespace-nowrap">{c.s.name}</p><p className="text-[12px] text-ink3">{lab(c.s)}</p></div></div> },
                  { key: 'p', label: 'Purpose', render: (c) => <p className="text-[13px] text-ink2 max-w-[240px] truncate">{c.purpose}</p> },
                  { key: 'd', label: 'Date', nowrap: true, render: (c) => <span className="text-[13px] tnum">{c.date.replace(' 2026', '')}</span> },
                  { key: 'st', label: 'Status', render: (c) => <Pill tone={CERT_TONE[c.status]}>{c.status}</Pill> },
                ]}
                mobile={(c) => ({ title: c.s.name, sub: `${c.type} · ${c.no}`, icon: c.type.startsWith('Transfer') ? 'FileOutput' : 'FileBadge', iconTone: CERT_TONE[c.status], pills: [<Pill key="s" tone={CERT_TONE[c.status]} className="!h-[22px] !text-[11.5px]">{c.status}</Pill>] })} />
            </Card>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 @md:grid-cols-5 @xl:grid-cols-7 gap-2">
              {CLASSES.map((c) => (
                <button key={c.id} onClick={() => setCls(c.id)} className={cx('rounded-xl border px-3 py-2.5 text-left transition', cls === c.id ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line bg-surface hover:bg-sunken/60')}>
                  <p className="text-[13px] font-semibold truncate">{c.name}</p>
                  <p className="text-[12px] text-ink3 tnum">{STRENGTH[c.id]} students{printed[c.id] ? ' · printed' : ''}</p>
                </button>
              ))}
            </div>
            <Split>
              <Card>
                <CardHead title={`${C.name} · ${STRENGTH[cls]} students`} sub={`${secs.map(([s, n]) => `${short(cls, s)}: ${n}`).join(' · ')} · up to 50 cards per batch`} icon={I.IdCard}
                  action={<Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setCard(true)}>Preview a card</Button>} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  <div className="rounded-xl bg-sunken/60 px-4 py-3 flex items-center gap-4">
                    <p className="font-display text-[30px] font-semibold tnum leading-none">{STRENGTH[cls]}</p>
                    <p className="text-[13.5px] text-ink2 leading-snug">cards to print in <b className="font-semibold text-ink">{batches.length} {batches.length === 1 ? 'batch' : 'batches'}</b><br /><span className="text-ink3 text-[12.5px]">A4 sheets · 10 cards per sheet · 2026–27 · valid until 31 May 2027</span></p>
                  </div>
                  {missing.length > 0 && (
                    <Banner tone="warn" title={`${missing.length} ${missing.length === 1 ? 'student has' : 'students have'} no photo:`} action={canEdit ? <Button size="sm" variant="secondary" icon={I.Camera} onClick={() => toast({ title: 'Upload photos', body: 'Name each file by admission number. Clashes are shown before saving.', tone: 'info' })}>Upload</Button> : null}>
                      {missing.map((m) => `${m[0]} (${m[1]})`).join(', ')}. Their cards print with a blank photo box.
                    </Banner>
                  )}
                  <ul className="flex flex-col gap-2">
                    {batches.map((b, i) => {
                      const key = `${cls}-${i}`;
                      return (
                        <li key={key} className="rounded-xl border border-line p-3.5 flex flex-col @md:flex-row @md:items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[14.5px]">Batch {i + 1} of {batches.length} <span className="text-ink3 font-normal">· {b.cnt} cards</span></p>
                            <p className="text-[12.5px] text-ink3 truncate">{b.parts.map((p) => `${cls === 'NUR' || cls === 'LKG' || cls === 'UKG' ? C.name + ' ' : cls + ' '}${p}`).join(', ')}</p>
                          </div>
                          {printed[key] ? <Pill tone="ok" dot>Sent to printer</Pill> : canEdit && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setCard(true)}>Preview</Button>
                              <Button size="sm" variant="primary" icon={I.Printer} onClick={() => { setPrinted((p) => ({ ...p, [key]: true, ...(i === batches.length - 1 ? { [cls]: true } : {}) })); toast({ title: `Batch ${i + 1} of ${batches.length} sent to the office printer`, body: `${b.cnt} cards · idcards-${C.name.toLowerCase().replace(' ', '')}-batch${i + 1}.pdf` }); }}>Print batch {i + 1}</Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Card>
              <Col>
                <Card>
                  <CardHead title="Printed this year" icon={I.Printer} />
                  <ul className="px-2 pb-2">
                    <Row icon="IdCard" iconTone="ok" title="1,198 cards" sub="All classes · June 2026" />
                    <Row icon="RefreshCw" title="23 reprints" sub="Lost 17 · damaged 4 · details changed 2" />
                    <Row icon="UserPlus" iconTone="info" title="14 new admissions" sub="Queued for the next batch" />
                  </ul>
                </Card>
                <Card>
                  <CardHead title="Card fields" sub="Set in Settings, Document Designs" icon={I.SlidersHorizontal} />
                  <ul className="px-5 pb-5 flex flex-wrap gap-1.5">{['Photo', 'Name', 'Class and section', 'Admission no.', 'Blood group', 'Parent phone', 'Bus route', 'QR code', 'Library barcode', 'RFID number'].map((x) => <Pill key={x} tone="neutral">{x}</Pill>)}</ul>
                </Card>
              </Col>
            </Split>
          </>
        )}
      </div>

      {issue && <IssueSheet onClose={() => setIssue(false)} onSave={(c) => { setCerts((l) => [c, ...l]); toast(c.status === 'Requested' ? { title: `${c.no} sent for approval`, body: `${c.type} for ${c.s.name} is waiting for Lakshmi Rao.` } : { title: `${c.no} issued`, body: `${c.type} for ${c.s.name}. Sent to the office printer.` }); }} />}
      <Sheet open={!!view} onClose={() => setView(null)} wide title={view?.no} sub={view ? `${view.type} · ${view.s.name} · ${view.status}` : ''}
        footer={view && canEdit && view.status !== 'Cancelled' ? <>
          <Button variant="ghost" onClick={() => { setCancel(view); setView(null); }}>Cancel with a reason</Button>
          {view.status === 'Requested' ? (isP && view.by !== role.person.name ? <Button variant="primary" icon={I.Check} onClick={() => { setStatus(view.no, 'Approved'); toast({ title: `${view.no} approved`, body: 'The office can print the original now.' }); setView(null); }}>Approve TC</Button> : <Button variant="secondary" disabled icon={I.Hourglass}>Waiting for Lakshmi Rao</Button>)
            : <Button variant="primary" icon={I.Printer} onClick={() => { if (view.status === 'Approved') setStatus(view.no, 'Issued'); toast({ title: view.type.startsWith('Transfer') && view.status === 'Issued' ? 'Duplicate TC sent to the printer' : 'Sent to the office printer', body: view.type.startsWith('Transfer') && view.status === 'Issued' ? 'Printed as “Duplicate”. An original was already issued.' : `${view.no.replace(/\//g, '-')}.pdf` }); setView(null); }}>{view.type.startsWith('Transfer') && view.status === 'Issued' ? 'Print duplicate' : 'Print'}</Button>}
        </> : view && !canEdit && view.status === 'Requested' && canOpen(role, 'approvals') ? <Button variant="primary" iconRight={I.ChevronRight} onClick={() => { setView(null); go('approvals'); }}>Decide in Approvals</Button> : null}>
        {view && <CertPreview c={view} />}
      </Sheet>
      {cancel && <CancelCertSheet c={cancel} onClose={() => setCancel(null)} onSave={(why) => { setStatus(cancel.no, 'Cancelled'); toast({ title: `${cancel.no} cancelled`, body: `Kept on record. Reason: ${why}`, undo: () => setStatus(cancel.no, cancel.status) }); }} />}
      <Sheet open={card} onClose={() => setCard(false)} title="Card preview" sub={`${FEATURED.name} · front of the card`}><IdCardPreview /></Sheet>
      {reprint && <ReprintSheet onClose={() => setReprint(false)} />}
    </div>
  );
}
function QR({ size = 64, seed = 7 }) {
  const cells = useMemo(() => { let s = seed; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647); return Array.from({ length: 21 * 21 }, () => r() > 0.5); }, [seed]);
  const fin = (x, y) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" shapeRendering="crispEdges" className="text-ink" aria-label="QR code to verify">
      {cells.map((on, i) => { const x = i % 21, y = Math.floor(i / 21); return !fin(x, y) && on ? <rect key={i} x={x} y={y} width="1" height="1" fill="currentColor" /> : null; })}
      {[[0, 0], [14, 0], [0, 14]].map(([x, y]) => <g key={x + '-' + y}><rect x={x} y={y} width="7" height="7" fill="currentColor" /><rect x={x + 1} y={y + 1} width="5" height="5" className="fill-surface" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="currentColor" /></g>)}
    </svg>
  );
}
function CertPreview({ c }) {
  const title = { Bonafide: 'Bonafide Certificate', Study: 'Study Certificate', 'Conduct / character': 'Character Certificate', 'Transfer certificate (TC)': 'Transfer Certificate', Migration: 'Migration Certificate' }[c.type];
  const he = c.s.girl ? 'daughter' : 'son';
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border-2 border-line p-5 @md:p-7 bg-surface">
        <div className="text-center border-b border-line pb-4">
          <p className="font-display font-semibold text-[20px] @md:text-[22px] tracking-tight">Sunrise Public School</p>
          <p className="text-[12px] text-ink3">Kukatpally, Hyderabad 500072 · CBSE affiliation no. 3630417 · SPS-HYD-001</p>
          <p className="eyebrow text-brand mt-3">{title}</p>
        </div>
        <p className="text-[14px] leading-relaxed text-ink2 mt-4">
          This is to certify that <b className="text-ink">{c.s.name}</b>, {he} of <b className="text-ink">{c.s.father}</b>, {c.type.startsWith('Transfer') ? 'was' : 'is'} a student of <b className="text-ink">{c.s.cls} {c.s.sec}</b> of this school in the academic year 2026–27, with admission number <span className="font-mono text-[13px] text-ink">{c.s.adm}</span>.
          {c.type === 'Conduct / character' ? ' To the best of our knowledge the student’s conduct and character are good.' : ''} This certificate is issued for: {c.purpose.charAt(0).toLowerCase() + c.purpose.slice(1)}.
        </p>
        <div className="flex items-end justify-between gap-4 mt-6">
          <div className="flex items-end gap-3"><QR size={60} seed={c.no.length * 31 + c.no.charCodeAt(4)} /><p className="text-[11.5px] text-ink3 max-w-[150px] leading-snug">Scan to check. Shows only the number, type, date and “Valid”.</p></div>
          <div className="text-right"><p className="font-display italic text-[18px] text-ink2">L. Rao</p><p className="text-[12px] font-semibold border-t border-line pt-1">Lakshmi Rao, Principal</p><p className="text-[11.5px] text-ink3 font-mono">{c.no} · {c.date}</p></div>
        </div>
      </div>
      <p className="text-[12.5px] text-ink3">Filled from the student record and the design in Settings, Document Designs. DigiLocker-ready copy is saved too.</p>
    </div>
  );
}
function IdCardPreview() {
  const bars = [3, 1, 2, 1, 1, 3, 2, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 2, 1, 1, 3];
  return (
    <div className="flex flex-col items-center gap-3 pb-2">
      <div className="w-[260px] rounded-2xl border border-line overflow-hidden bg-surface shadow-card">
        <div className="bg-brand text-brandink px-4 py-3 text-center"><p className="font-display font-semibold text-[15px] leading-tight">Sunrise Public School</p><p className="text-[11px] opacity-90">Kukatpally, Hyderabad · 040 2305 1180</p></div>
        <div className="px-4 pt-4 pb-3 flex flex-col items-center text-center gap-1">
          <Avatar name={FEATURED.name} size={76} />
          <p className="font-semibold text-[16px] mt-1.5">{FEATURED.name}</p>
          <p className="text-[12.5px] text-ink2">Class 7 B · Roll {FEATURED.roll}</p>
          <dl className="w-full grid grid-cols-2 gap-x-3 gap-y-1 text-left text-[11.5px] mt-2">
            {[['Adm. no.', FEATURED.adm], ['Blood group', 'B+'], ['Parent', '98495 60211'], ['Bus', 'Route 4']].map(([k, v]) => <div key={k}><dt className="text-ink3">{k}</dt><dd className="font-semibold tnum">{v}</dd></div>)}
          </dl>
        </div>
        <div className="px-4 pb-3 flex items-end justify-between gap-2">
          <QR size={52} seed={17} />
          <div className="flex items-end h-9 gap-px" aria-label="Library barcode">{bars.map((w, i) => <span key={i} className={cx('h-full', i % 2 ? 'bg-transparent' : 'bg-ink')} style={{ width: w }} />)}</div>
        </div>
        <div className="bg-sunken px-4 py-1.5 text-center text-[11px] font-semibold text-ink2">2026–27 · Valid until 31 May 2027</div>
      </div>
    </div>
  );
}
function IssueSheet({ onClose, onSave }) {
  const { role } = useRole();
  const { go } = useNav();
  const opts = [FEATURED, LEAVING[3].s, pickS('10', 'C', 1), pickS('5', 'A', 0)];
  const [sid, setSid] = useState(FEATURED.id);
  const [type, setType] = useState('Bonafide');
  const [purpose, setPurpose] = useState('');
  const [date, setDate] = useState('09-10-2026');
  const [err, setErr] = useState('');
  const s = opts.find((x) => x.id === sid);
  const tc = type.startsWith('Transfer');
  const blocked = tc && (s.id === FEATURED.id || s.due > 0);
  const dues = s.id === FEATURED.id ? 30650 : s.due;
  const pre = { Bonafide: 'BON', Study: 'STU', 'Conduct / character': 'CHR', 'Transfer certificate (TC)': 'TC', Migration: 'MIG' }[type];
  const no = `${pre}/2026/${pre === 'BON' ? '0143' : pre === 'TC' ? '0032' : pre === 'CHR' ? '0019' : pre === 'STU' ? '0068' : '0005'}`;
  const needsApproval = tc || type === 'Conduct / character' || type === 'Migration';
  return (
    <FormSheet open onClose={onClose} title="Issue certificate" sub="Fills from the student record and the school’s design" submitLabel={needsApproval ? 'Send for approval' : 'Issue and print'}
      onSubmit={() => { if (blocked) return false; if (type === 'Bonafide' && !purpose.trim()) { setErr('Purpose is needed for a bonafide'); return false; } onSave({ no, type, s, date: '9 Oct 2026', status: needsApproval ? 'Requested' : 'Issued', purpose: purpose.trim() || '—', by: role.person.name }); }}>
      <Field label="Student" required id="ic-s"><Select id="ic-s" value={sid} onChange={setSid} options={opts.map((x) => ({ value: x.id, label: `${x.name} · ${lab(x)} · ${x.adm}` }))} /></Field>
      <Field label="Certificate type" required id="ic-t"><Select id="ic-t" value={type} onChange={(v) => { setType(v); setErr(''); }} options={CERT_TYPES} /></Field>
      {blocked && (
        <div className="rounded-xl border border-bad/40 bg-bad/10 p-3.5">
          <p className="font-semibold text-[14px] flex gap-2 text-bad"><I.Lock size={17} className="shrink-0 mt-0.5" />TC blocked: {inr(dues)} fees due{s.id === FEATURED.id ? ' and 1 library book not returned' : ''}</p>
          <p className="text-[12.5px] text-ink2 mt-1">Clearance (A14) must be clear or waived before a TC.</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            {canDo(role, 'fees.collect') && <Button type="button" size="sm" variant="secondary" icon={I.IndianRupee} onClick={() => { onClose(); go('fees', { student: s.id }); }}>Collect fee</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { onClose(); go('students', { page: 'leaving' }); }}>Open Leaving & Alumni</Button>
          </div>
        </div>
      )}
      {tc && !blocked && <Banner tone="ok" icon="CircleCheck">Clearance done: fees, library and hostel are clear. One original TC per student; later copies print as “Duplicate”.</Banner>}
      <Field label="Purpose" required={type === 'Bonafide'} id="ic-p" error={err}><Input id="ic-p" value={purpose} onChange={(x) => { setPurpose(x.target.value); setErr(''); }} error={err} placeholder="For example: bank account opening" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of issue" required id="ic-d"><Input id="ic-d" value={date} onChange={(x) => setDate(x.target.value)} className="tnum" /></Field>
        <Field label="Certificate number" id="ic-n" hint="Next in the series"><Input id="ic-n" value={no} readOnly className="font-mono !bg-sunken/50 text-[14px]" /></Field>
      </div>
      <Field label="Signatory" required id="ic-sig"><Select id="ic-sig" value="Lakshmi Rao" onChange={() => {}} options={[{ value: 'Lakshmi Rao', label: 'Lakshmi Rao, Principal' }, { value: 'Srinivas Murthy', label: 'Srinivas Murthy, Vice Principal' }]} /></Field>
      {needsApproval && <p className="text-[12.5px] text-ink3 -mt-1">{tc ? 'TC always needs approval.' : `${type} needs approval (Forms & Approvals).`} It goes to Lakshmi Rao in Approvals.</p>}
    </FormSheet>
  );
}
function CancelCertSheet({ c, onClose, onSave }) {
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title={`Cancel ${c.no}?`} sub="It stays on record as Cancelled. The number is never reused." submitLabel="Cancel certificate"
      onSubmit={() => { if (!why.trim()) { setErr('Give a reason'); return false; } onSave(why.trim()); }}>
      <Field label="Reason" required id="cc-why" error={err}><Input id="cc-why" value={why} onChange={(x) => { setWhy(x.target.value); setErr(''); }} error={err} placeholder="For example: wrong purpose printed" /></Field>
    </FormSheet>
  );
}
function ReprintSheet({ onClose }) {
  const toast = useToast();
  const [s, setS] = useState(FEATURED.id);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  const opts = [FEATURED, ...CLASS_7B.filter((x) => x.id !== FEATURED.id).slice(0, 5)];
  return (
    <FormSheet open onClose={onClose} title="Reprint a card" sub="The old card is kept on record as replaced" submitLabel="Queue replacement card"
      onSubmit={() => { if (!why) { setErr('Choose a reason for the reprint'); return false; } const st = opts.find((x) => x.id === s); toast({ title: `Replacement card queued for ${st.name}`, body: `Old card marked replaced (${why.toLowerCase()}). Prints with the next batch.` }); }}>
      <Field label="Student" required id="rp-s"><Select id="rp-s" value={s} onChange={setS} options={opts.map((x) => ({ value: x.id, label: `${x.name} · ${lab(x)}` }))} /></Field>
      <Field label="Reason for reprint" required id="rp-why" error={err}><Segmented value={why} onChange={(v) => { setWhy(v); setErr(''); }} options={['Lost', 'Damaged', 'Details changed']} className="w-full" size="sm" /></Field>
    </FormSheet>
  );
}

/* ======================= Student Settings ======================= */
function StuSettings() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const { role } = useRole();
  const [fields, setFields] = useState([['Full name', true, true, true], ['Date of birth', true, false], ['Gender', true, false], ['Parent’s phone', true, true], ['Blood group', false, false], ['Address', true, false], ['Photo', false, true], ['Category', false, false], ['Aadhaar (restricted)', false, false]]);
  const [restart, setRestart] = useState(false);
  const chips = (items) => <div className="px-5 pb-5 flex flex-wrap gap-2">{items.map((x) => <span key={x} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium inline-flex items-center">{x}</span>)}{canEdit && <button onClick={() => toast({ title: 'Add an item', body: 'Items in use can be renamed or archived, not deleted.', tone: 'info' })} className="h-8 px-3 rounded-full border border-dashed border-line text-[13px] font-semibold text-brand inline-flex items-center gap-1"><I.Plus size={14} />Add</button>}</div>;
  return (
    <div>
      <ModuleHead sub="The rules for student records at Sunrise Public School. Every change is logged." />
      <div className="flex flex-col gap-5 @lg:gap-6 max-w-5xl">
        <Card>
          <CardHead title="Admission number format" sub="Used when a student is added or admitted" icon={I.Hash} />
          <div className="px-5 pb-5 flex flex-col gap-4">
            <div className="grid grid-cols-2 @md:grid-cols-4 gap-3">
              {[['Prefix', 'SPS'], ['Year', '2026'], ['Running number', '0914'], ['Digits', '4']].map(([k, v]) => <Field key={k} label={k} id={`an-${k}`}><Input id={`an-${k}`} defaultValue={v} disabled={!canEdit} className="tnum font-mono text-[14px]" /></Field>)}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken/60 px-4 py-3"><span className="text-[13.5px] text-ink2">Next number</span><b className="font-mono text-[15px]">SPS/2026/0914</b></div>
            <label className="flex items-center gap-3 text-[14px]"><Switch on={restart} label="Restart numbers each year" onChange={(v) => { if (!canEdit) return; setRestart(v); toast({ title: `Restart each year: ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} /><span><b className="font-semibold">Restart numbers each year</b><span className="block text-[12.5px] text-ink3">Off: numbers keep running. Changing an admission number writes the old and new value to the history.</span></span></label>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="Required fields and list display" sub="Staff form fields are in HR Settings" icon={I.ListChecks}
            action={role.access.settings === 'full' ? <Button size="sm" variant="ghost" iconRight={I.ChevronRight} onClick={() => go('settings', { page: 'forms' })}>Extra fields</Button> : null} />
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="w-full text-[14px] min-w-[420px]">
              <thead><tr className="text-[12px] text-ink3 border-b border-line"><th className="text-left font-semibold px-5 py-2.5">Field</th><th className="font-semibold px-3 py-2.5">Required</th><th className="font-semibold px-5 py-2.5">Show in list</th></tr></thead>
              <tbody>
                {fields.map(([k, req, list, locked], i) => (
                  <tr key={k} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-2.5 font-medium">{k}{locked && <I.Lock size={13} className="inline ml-1.5 text-ink3" />}</td>
                    {[req, list].map((v, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="flex justify-center"><Checkbox checked={v} label={`${k} ${j ? 'show in list' : 'required'}`} onChange={(x) => { if (!canEdit || locked) return; setFields((f) => f.map((r, m) => (m === i ? (j ? [r[0], r[1], x, r[3]] : [r[0], x, r[2], r[3]]) : r))); }} /></div></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHead title="Student status and allowed changes" sub="Only these changes are offered. Promotion and leaving only on their own pages." icon={I.Workflow} />
          <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
            {[['Lead, Applicant', 'Admitted', 'Admission Management only'], ['Admitted', 'Active', 'Automatically on the admission date'], ['Active', 'Promoted, Transferred, Withdrawn, Graduated, Inactive', 'Promotion or Leaving & Alumni; Inactive here with a reason'], ['Promoted', 'Active (new year)', 'When the new year starts'], ['Inactive', 'Active', 'Here, with a reason'], ['Graduated', 'Alumni', 'Leaving & Alumni'], ['Transferred, Withdrawn', 'Active (re-admission)', 'With a reason and approval']].map(([a, b, c]) => (
              <li key={a} className="grid @md:grid-cols-[180px_24px_1fr] gap-x-2 gap-y-0.5 items-start rounded-xl bg-sunken/50 px-3.5 py-2.5">
                <b className="font-semibold">{a}</b><I.ArrowRight size={15} className="hidden @md:block text-ink3 mt-0.5" /><span><span className="text-ink">{b}</span><span className="block text-[12.5px] text-ink3">{c}</span></span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">
          <Card>
            <CardHead title="Identifier types" sub="Masked for roles that may not see them" icon={I.Fingerprint} />
            <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
              {[['APAAR ID', 'Restricted'], ['PEN (UDISE+)', 'Restricted'], ['Aadhaar', 'Highly restricted'], ['Board registration no.', 'Restricted']].map(([k, v]) => <li key={k} className="flex items-center justify-between gap-3"><span>{k}</span><Pill tone={v.startsWith('Highly') ? 'bad' : 'warn'}>{v}</Pill></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Leaving reasons" icon={I.LogOut} />
            {chips(['Family moving to another city', 'Parent transferred (job)', 'School nearer home', 'Changing board', 'Fee difficulty', 'Health reasons', 'Other'])}
          </Card>
        </div>

        <SettingsCard title="Promotion policy · 2026–27 (version 2)" sub="Versioned per year. Changing it never changes past promotions." icon={I.ArrowUpRight} rows={[
          { title: 'Pass required to promote', sub: 'From the final result in Examination & Results', on: true },
          { title: 'Minimum attendance', sub: 'Below this, the suggestion is Detain', value: '75%' },
          { title: 'Fee dues stop promotion', sub: 'Off: dues show as a warning only', on: false },
          { title: 'Exceptions approved by', sub: 'Changes from the suggestion need a reason', value: 'Principal' },
        ]} />

        <SettingsCard title="Certificates" sub="Designs live in Settings, Document Designs" icon={I.FileBadge} rows={[
          { title: 'Transfer certificate needs approval', sub: 'Always on. Clearance must be done first.', on: true },
          { title: 'Character certificate needs approval', on: true },
          { title: 'Bonafide and study certificates need approval', sub: 'Off: issued at the counter', on: false },
          { title: 'QR code to verify', sub: 'No personal data in the code', on: true },
          { title: 'Default signatory', value: 'Lakshmi Rao, Principal' },
          { title: 'Numbering', sub: 'Series per type and year', value: 'BON/2026/0143' },
        ]} />

        <SettingsCard title="ID cards" sub="Fields and look are set in Settings, Document Designs" icon={I.IdCard} rows={[
          { title: 'Valid until', value: '31 May 2027' },
          { title: 'Cards per A4 sheet', value: '10' },
          { title: 'RFID cards', sub: 'Records the RFID number for attendance devices', on: true },
          { title: 'Library barcode on the card', on: true },
        ]}>
          {role.access.settings === 'full' && <div className="px-5 py-3.5"><Button size="sm" variant="secondary" iconRight={I.ChevronRight} onClick={() => go('settings', { page: 'designs' })}>Open Document Designs</Button></div>}
        </SettingsCard>

        <Card>
          <CardHead title="Behaviour" sub="Incident types and points" icon={I.Medal} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            <ToggleRow title="Behaviour points" sub="Points add up per student each term" on id="stu-pts" />
            <div className="px-5 py-4 grid grid-cols-2 @md:grid-cols-5 gap-2">
              {TYPES.map((x) => <div key={x} className="rounded-xl bg-sunken/60 px-3 py-2.5"><p className="text-[12.5px] font-semibold">{x}</p><p className={cx('font-semibold tnum', TYPE_PTS[x] > 0 ? 'text-ok' : 'text-bad')}>{TYPE_PTS[x] > 0 ? '+' : ''}{TYPE_PTS[x]} points</p></div>)}
            </div>
            <SettingRow title="Who can read counselling notes" sub="Fixed for privacy. Everyone else sees “Private”."><span className="inline-flex items-center gap-1.5 text-[14px] font-semibold"><I.Lock size={14} className="text-ink3" />Counsellor only</span></SettingRow>
            <ToggleRow title="Student logins" sub="For schools giving students their own login" on={false} id="stu-logins" />
          </div>
        </Card>
      </div>
    </div>
  );
}

export const STUDENTS_PAGES = {
  parents: Parents,
  behaviour: Behaviour,
  promotion: Promotion,
  leaving: Leaving,
  certificates: Certificates,
  settings: StuSettings,
};
