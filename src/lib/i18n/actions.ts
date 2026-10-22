"use server";

// The language chosen on a page with no sign-in (sign-in, Parent Link, the admission form).
// It is kept on this browser only; a signed-in person's own choice is in My profile.
import { isLang } from "./languages";
import { rememberLanguage } from "./server";

export async function chooseBrowserLanguage(formData: FormData): Promise<void> {
  const lang = formData.get("lang");
  if (isLang(lang)) await rememberLanguage(lang);
}
