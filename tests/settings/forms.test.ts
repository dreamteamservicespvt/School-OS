// Settings, Forms & Approvals: custom fields (validation, conditional display,
// archive keeps answers) and custom forms.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { checkCustomValues, checkFieldDefinition, isFieldShown, keyFromLabel, type CustomFieldDef } from "@/lib/custom-field-rules";
import { loadCustomFields, readCustomFieldForm, validateCustomValues, visibleFields } from "@/lib/custom-fields";
import { createField, createForm, editField, moveField, publishForm, removeFormField, saveFormField, setFieldArchived } from "@/lib/settings/forms";
import { makeSchool, makeUser } from "../helpers";

const fields: CustomFieldDef[] = [
  { key: "boarder", label: "Hostel boarder", fieldType: "yesno", required: true, choices: [] },
  { key: "room", label: "Room preference", fieldType: "choice", required: true, choices: ["AC", "Non-AC"], showWhen: { fieldKey: "boarder", equals: "yes" } },
  { key: "ac_note", label: "AC note", fieldType: "text", required: true, choices: [], showWhen: { fieldKey: "room", equals: "AC" } },
  { key: "height", label: "Height (cm)", fieldType: "number", required: false, choices: [] },
  { key: "joined", label: "Joined on", fieldType: "date", required: false, choices: [] },
];

describe("custom field values", () => {
  it("checks each type in plain words", () => {
    const r = checkCustomValues(fields, { boarder: "maybe", height: "tall", joined: "2026-02-30" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual({
        cf_boarder: "Answer yes or no for Hostel boarder.",
        cf_height: "Height (cm) must be a number, like 25 or 2.5.",
        cf_joined: "Joined on is not a real date.",
      });
    }
  });

  it("stores the right types", () => {
    const r = checkCustomValues(fields, { boarder: "no", height: "1,52.5", joined: "2026-06-10" });
    expect(r).toEqual({ ok: true, values: { boarder: false, height: 152.5, joined: "2026-06-10" } });
  });

  it("shows a field only when the answer matches, through a chain", () => {
    expect(isFieldShown(fields[1], { boarder: true }, fields)).toBe(true);
    expect(isFieldShown(fields[1], { boarder: false }, fields)).toBe(false);
    expect(isFieldShown(fields[2], { boarder: true, room: "AC" }, fields)).toBe(true);
    // Room is hidden when not a boarder, so the AC note is hidden too.
    expect(isFieldShown(fields[2], { boarder: false, room: "AC" }, fields)).toBe(false);
  });

  it("requires shown fields only, and drops answers to hidden ones", () => {
    const shown = checkCustomValues(fields, { boarder: "yes" });
    expect(shown.ok).toBe(false);
    if (!shown.ok) expect(shown.errors).toEqual({ cf_room: "Choose Room preference." });
    const hidden = checkCustomValues(fields, { boarder: "no", room: "AC", ac_note: "x" });
    expect(hidden).toEqual({ ok: true, values: { boarder: false } });
  });

  it("reads the form inputs and keeps a file field's earlier file", () => {
    const fd = new FormData();
    fd.set("cf_boarder", "yes");
    fd.set("cf_room", "Non-AC");
    const withFile: CustomFieldDef[] = [...fields, { key: "proof", label: "Address proof", fieldType: "file", required: true, choices: [] }];
    const raw = readCustomFieldForm(fd, withFile);
    expect(raw.proof).toBeNull();
    const missing = validateCustomValues(withFile, raw);
    expect(missing.ok).toBe(false);
    const kept = validateCustomValues(withFile, raw, { proof: { fileId: "f1", name: "proof.pdf" } });
    expect(kept.ok).toBe(true);
  });

  it("hides restricted fields from roles other than School Admin and Principal", () => {
    const f = [{ key: "a", visibility: "everyone" }, { key: "b", visibility: "restricted" }];
    expect(visibleFields(f, [{ key: "teacher" }]).map((x) => x.key)).toEqual(["a"]);
    expect(visibleFields(f, [{ key: "principal" }]).map((x) => x.key)).toEqual(["a", "b"]);
  });
});

describe("field definitions", () => {
  it("needs a label, choices for a choice field, and a sensible rule", () => {
    expect(checkFieldDefinition({ label: "", fieldType: "choice", required: false, choices: ["Only one"], showWhen: null }, fields)).toEqual({
      label: "Label is needed.",
      choices: "Give at least 2 choices, one per line.",
    });
    expect(checkFieldDefinition({ label: "Diet", fieldType: "text", required: false, choices: [], showWhen: { fieldKey: "height", equals: "5" } }, fields).showWhenField).toMatch(/not a choice or yes-or-no field/);
    expect(checkFieldDefinition({ label: "Diet", fieldType: "text", required: false, choices: [], showWhen: { fieldKey: "room", equals: "Deluxe" } }, fields).showWhenValue).toMatch(/not one of the choices/);
    expect(checkFieldDefinition({ label: "hostel BOARDER", fieldType: "text", required: false, choices: [], showWhen: null }, fields).label).toMatch(/already a field/);
    expect(keyFromLabel("Hostel boarder", ["hostel_boarder"])).toBe("hostel_boarder_2");
  });
});

describe("custom fields in the database", () => {
  let school: Awaited<ReturnType<typeof makeSchool>>;
  let admin: { id: string };
  const ctx = () => ({ schoolId: school.id, userId: admin.id });
  beforeAll(async () => {
    school = await makeSchool("Forms School");
    admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }] });
  });

  it("adds, reorders, edits and archives, keeping answers", async () => {
    const a = await withSchool(ctx(), (tx) => createField(tx, ctx(), "student", { label: "Hostel boarder", fieldType: "yesno", required: false, choices: [], showWhen: null, visibility: "everyone" }));
    const b = await withSchool(ctx(), (tx) => createField(tx, ctx(), "student", { label: "Room", fieldType: "choice", required: true, choices: ["AC", "Non-AC", ""], showWhen: { fieldKey: a.key, equals: "yes" }, visibility: "restricted" }));
    expect(b.choices).toEqual(["AC", "Non-AC"]);
    await withSchool(ctx(), (tx) => moveField(tx, ctx(), b.id, "up"));
    expect((await withSchool(ctx(), (tx) => loadCustomFields(tx, "student"))).map((f) => f.key)).toEqual([b.key, a.key]);
    await expect(withSchool(ctx(), (tx) => editField(tx, ctx(), b.id, { label: "Room", fieldType: "text", required: true, choices: [], showWhen: null, visibility: "everyone" }))).rejects.toThrow(/cannot change/);
    // A field others depend on cannot be archived first.
    await expect(withSchool(ctx(), (tx) => setFieldArchived(tx, ctx(), a.id, true))).rejects.toThrow(/Room is shown only when/);
    await withSchool(ctx(), (tx) => setFieldArchived(tx, ctx(), b.id, true));
    expect((await withSchool(ctx(), (tx) => loadCustomFields(tx, "student"))).map((f) => f.key)).toEqual([a.key]);
    expect((await withSchool(ctx(), (tx) => loadCustomFields(tx, "student", { includeArchived: true })))).toHaveLength(2);
  });

  it("builds and publishes a form", async () => {
    const form = await withSchool(ctx(), (tx) => createForm(tx, ctx(), { name: "Teacher appraisal", description: null, aboutType: "staff" }));
    await expect(withSchool(ctx(), (tx) => publishForm(tx, ctx(), form.id))).rejects.toThrow(/at least one field/);
    const q1 = await withSchool(ctx(), (tx) => saveFormField(tx, ctx(), form.id, null, { label: "Attends PTMs", fieldType: "yesno", required: true, choices: [], showWhen: null }));
    const q2 = await withSchool(ctx(), (tx) => saveFormField(tx, ctx(), form.id, null, { label: "Why not", fieldType: "text", required: true, choices: [], showWhen: { fieldKey: q1.key, equals: "no" } }));
    await expect(withSchool(ctx(), (tx) => removeFormField(tx, ctx(), form.id, q1.key))).rejects.toThrow(/depends on Attends PTMs/);
    const published = await withSchool(ctx(), (tx) => publishForm(tx, ctx(), form.id));
    expect(published.version).toBe(1);
    // Changing a field makes it a draft again until published.
    await withSchool(ctx(), (tx) => saveFormField(tx, ctx(), form.id, q2.key, { label: "Why not, in short", fieldType: "text", required: true, choices: [], showWhen: { fieldKey: q1.key, equals: "no" } }));
    expect((await withSchool(ctx(), (tx) => tx.customForm.findUniqueOrThrow({ where: { id: form.id } }))).status).toBe("draft");
    expect((await withSchool(ctx(), (tx) => publishForm(tx, ctx(), form.id))).version).toBe(2);
  });
});
