"use client";

// The translator in browser components: useT() gives the same t() as the server.
// The page's layout puts <I18nProvider> around the screen with one language's words.
import { createContext, useContext, useEffect, useMemo } from "react";
import type { Lang } from "./languages";
import { screenMessage } from "./messages";
import { dayWords } from "./dates";
import { englishT, translator, type MessageKey, type T, type Vars } from "./t";

const I18nContext = createContext<T>(englishT);

export function I18nProvider({ lang, dict, setDocumentLang = true, children }: {
  lang: Lang;
  dict: Readonly<Record<string, string>>;
  /** Sets <html lang> for screen readers and the right fonts; off for a framed preview inside a staff screen. */
  setDocumentLang?: boolean;
  children: React.ReactNode;
}) {
  const t = useMemo(() => translator(lang, dict), [lang, dict]);
  useEffect(() => {
    if (setDocumentLang) document.documentElement.lang = lang;
  }, [lang, setDocumentLang]);
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>;
}

/** The translator for this screen's language. Outside a provider: English. */
export function useT(): T {
  return useContext(I18nContext);
}

/**
 * Words in the screen's language inside a component that is shared by server and browser
 * screens (where a hook cannot be used directly), e.g. the list footer's "Previous".
 */
export function Words({ k, vars }: { k: MessageKey; vars?: Vars }) {
  return <>{useT()(k, vars)}</>;
}

/**
 * Words that came in as a prop or from the rules (a label, a title, a server message), in the
 * screen's language when the catalogue has them; anything else (a name, a number) as it is.
 */
export function Any({ text }: { text: string }) {
  return <>{screenMessage(useT(), text)}</>;
}

/** A date written in words ("Sat 17 Oct 2026", "Thursday, 22 October") with the day and month names in the screen's language. */
export function DayText({ text }: { text: string }) {
  return <>{dayWords(useT(), text)}</>;
}

/** A select's options in the screen's language (an <option> takes only plain words). */
export function OptionList({ options, placeholder }: { options: readonly { value: string; label: string }[]; placeholder?: string }) {
  const t = useT();
  return (
    <>
      {placeholder !== undefined && <option value="">{t.any(placeholder)}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{t.any(o.label)}</option>)}
    </>
  );
}
