// QA PLATFORM-16: on Sign in, "Forgot password?" was a Tab stop between the login and
// password boxes, so a quick Tab and Enter switched to the code flow. Tab order is the
// order of the controls in the page, so this reads the rendered form: login, password,
// then Sign in, and the way to the one-time code only after Sign in.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignInForm } from "@/app/sign-in/form";

/** The Tab stops of the form, in page order: inputs and buttons, with their words. */
function tabStops(html: string) {
  return [...html.matchAll(/<(input|button)\b([^>]*)>([\s\S]*?)(?=<\/button>|<|$)/g)]
    .filter(([, , attrs]) => !/type="hidden"|tabindex="-1"|disabled=""/.test(attrs))
    .map(([, tag, attrs, text]) => {
      const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
      const type = /\btype="([^"]+)"/.exec(attrs)?.[1];
      const label = /aria-label="([^"]+)"/.exec(attrs)?.[1];
      if (tag === "input") return id ?? `input[${type}]`;
      return label ?? (type === "submit" ? "submit" : text.replace(/<[^>]*>/g, "").trim());
    });
}

describe("Sign in Tab order", () => {
  it("goes login, password, Sign in, and reaches Forgot password after Sign in", () => {
    const html = renderToStaticMarkup(createElement(SignInForm, {}));
    const stops = tabStops(html);
    const at = (name: string | RegExp) => stops.findIndex((s) => (typeof name === "string" ? s === name : name.test(s)));
    expect(at("username")).toBe(0);
    expect(at("password")).toBe(1);
    expect(at("submit")).toBeGreaterThan(at("password"));
    // Only the password's own Show button and the "Keep me signed in" box sit between password and Sign in.
    expect(stops.slice(at("password") + 1, at("submit"))).toEqual(["Show password", "input[checkbox]"]);
    const forgot = at(/Forgot password/);
    expect(forgot).toBeGreaterThan(at("submit"));
  });
});
