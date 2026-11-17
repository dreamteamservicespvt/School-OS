// The answer shape of an AI task (a zod schema) as the JSON Schema Gemini's
// structured output takes (generationConfig.responseJsonSchema). Gemini reads
// a subset of JSON Schema (https://aistudio.google.com/docs/structured-output):
// types, properties, required, items, enum, anyOf, nullable as a type list,
// minimum/maximum, minItems/maxItems, additionalProperties, title and
// description; length limits are dropped by the service. The rest is taken
// out here so nothing is refused. The answer is always parsed again with the
// same zod schema (index.ts), so a limit Gemini ignores is still kept.
import * as z from "zod/v4";

type Json = { [k: string]: unknown };

const KEEP = new Set([
  "type", "properties", "required", "items", "prefixItems", "enum", "anyOf", "minimum", "maximum",
  "minItems", "maxItems", "additionalProperties", "title", "description", "format", "nullable",
]);
const FORMATS = new Set(["date-time", "date", "time"]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const src = node as Json;
  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    if (!KEEP.has(k)) continue;
    if (k === "format" && !(typeof v === "string" && FORMATS.has(v))) continue;
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v as Json).map(([p, s]) => [p, clean(s)]));
    } else if (k === "additionalProperties") {
      out[k] = typeof v === "boolean" ? v : clean(v);
    } else out[k] = clean(v);
  }
  // A fixed value (z.literal) is a one-value list.
  if ("const" in src && out.enum === undefined) out.enum = [src.const];
  // { anyOf: [X, { type: "null" }] } with a plain X (no enum) reads better as a type list.
  const any = out.anyOf as Json[] | undefined;
  if (Array.isArray(any) && any.length === 2) {
    const nul = any.findIndex((s) => s && s.type === "null" && Object.keys(s).length === 1);
    const other = any[1 - nul];
    if (nul >= 0 && other && typeof other.type === "string" && other.enum === undefined) {
      delete out.anyOf;
      Object.assign(out, other, { type: [other.type, "null"] });
    }
  }
  // An integer that may be any safe number needs no limits.
  if (out.minimum === Number.MIN_SAFE_INTEGER) delete out.minimum;
  if (out.maximum === Number.MAX_SAFE_INTEGER) delete out.maximum;
  return out;
}

/** The zod schema as the JSON Schema Gemini accepts. */
export function geminiJsonSchema(schema: z.ZodType): Json {
  return clean(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" })) as Json;
}
