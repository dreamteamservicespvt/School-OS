// The language follows the person (owner, 15 Nov 2026): detected per message
// (script, then romanised Telugu or Hindi words, then the model's judgement),
// set by the first message and kept until the person clearly switches (two
// messages in a row, or "speak in English/Telugu"). Voice is never forced to
// English. No database and no network.
import { describe, expect, it } from "vitest";
import { detectLanguage, explicitSwitch, nextLanguage, pickVoice, SPEECH_LANG, type LanguageState } from "@/lib/assistant/language";
import { blanksOf } from "@/lib/i18n/t";
import { rawWords, WORD_KEYS, words } from "@/lib/assistant/words";

describe("one message's language", () => {
  it("reads Telugu and Hindi script, mixed with English words too", () => {
    expect(detectLanguage("ఈ రోజు ఎవరు రాలేదు?")).toEqual({ lang: "te", by: "script" });
    expect(detectLanguage("ఈ రోజు fee ఎంత వచ్చింది?")).toEqual({ lang: "te", by: "script" });
    expect(detectLanguage("आज कौन absent है?")).toEqual({ lang: "hi", by: "script" });
  });

  it("recognises romanised Telugu and Hindi in Latin letters", () => {
    expect(detectLanguage("ee roju absent evaru?")).toEqual({ lang: "te", by: "words" });
    expect(detectLanguage("fees entha vachindi ivvala")).toEqual({ lang: "te", by: "words" });
    expect(detectLanguage("class 5 lo evaru raledu")).toEqual({ lang: "te", by: "words" });
    expect(detectLanguage("aaj kaun absent hai")).toEqual({ lang: "hi", by: "words" });
    expect(detectLanguage("kitni fees aayi aaj")).toEqual({ lang: "hi", by: "words" });
    expect(detectLanguage("evaru?")).toEqual({ lang: "te", by: "words" });
  });

  it("plain English is English; a name, a number or 'ok' decides nothing", () => {
    expect(detectLanguage("Who is absent today?")).toEqual({ lang: "en", by: "latin" });
    expect(detectLanguage("How much fee came in this week")).toEqual({ lang: "en", by: "latin" });
    expect(detectLanguage("ok")).toEqual({ lang: null, by: "none" });
    expect(detectLanguage("Ravi Kumar")).toEqual({ lang: null, by: "none" });
    expect(detectLanguage("5")).toEqual({ lang: null, by: "none" });
    expect(detectLanguage("")).toEqual({ lang: null, by: "none" });
  });

  it("hears an explicit request to switch, in any of the three languages", () => {
    expect(explicitSwitch("please speak in English")).toBe("en");
    expect(explicitSwitch("telugu lo cheppandi")).toBe("te");
    expect(explicitSwitch("తెలుగులో చెప్పండి")).toBe("te");
    expect(explicitSwitch("हिंदी में बोलो")).toBe("hi");
    expect(explicitSwitch("english lo cheppu")).toBe("en");
    expect(explicitSwitch("who is absent")).toBeNull();
  });
});

describe("the conversation's language", () => {
  it("is set by the first message", () => {
    expect(nextLanguage(null, "ee roju absent evaru?").lang).toBe("te");
    expect(nextLanguage(null, "Who is absent today?").lang).toBe("en");
    expect(nextLanguage(null, "आज की फीस").lang).toBe("hi");
    // A first message that says nothing: the language picked before speaking, else the screen's.
    expect(nextLanguage(null, "5 A", { chosen: "te", screen: "en" }).lang).toBe("te");
    expect(nextLanguage(null, "ok", { screen: "hi" }).lang).toBe("hi");
  });

  it("talks the way the person talks: one clear message in another language switches at once (owner, 16 Nov 2026)", () => {
    const one = nextLanguage({ lang: "te", pending: null }, "Who is absent today?");
    expect(one).toMatchObject({ lang: "en", pending: null, switched: true });
    const back = nextLanguage(one, "ఈరోజు absent ఎవరు?");
    expect(back).toMatchObject({ lang: "te", pending: null, switched: true });
  });

  it("a message that says nothing about its language (a name, a number, ok) keeps the conversation's language", () => {
    const s: LanguageState = { lang: "te", pending: null };
    expect(nextLanguage(s, "Ravi")).toMatchObject({ lang: "te", switched: false });
    expect(nextLanguage(s, "5")).toMatchObject({ lang: "te", switched: false });
    expect(nextLanguage(s, "ninna evaru raledu?")).toMatchObject({ lang: "te", pending: null, switched: false });
  });

  it("switches at once on an explicit request", () => {
    expect(nextLanguage({ lang: "en", pending: null }, "telugu lo matladandi")).toMatchObject({ lang: "te", switched: true });
    expect(nextLanguage({ lang: "te", pending: null }, "speak in English")).toMatchObject({ lang: "en", switched: true });
  });

  it("uses the model's judgement only for Latin words the list did not know", () => {
    // "chusinava" is romanised Telugu the word list does not hold: the model says te, so it counts as Telugu.
    expect(nextLanguage({ lang: "te", pending: null }, "attendance report chusinava please", { model: "te" })).toMatchObject({ lang: "te", pending: null });
    // Script always wins over the model.
    expect(nextLanguage({ lang: "en", pending: null }, "ఈ రోజు ఎవరు రాలేదు?", { model: "en" }).detected).toBe("te");
  });
});

describe("voice in the conversation's language", () => {
  it("recognises speech as te-IN, hi-IN or en-IN", () => {
    expect(SPEECH_LANG).toEqual({ en: "en-IN", te: "te-IN", hi: "hi-IN" });
  });

  it("picks a voice of the same language, the device's own first, or none", () => {
    const voices = [
      { lang: "en-US", name: "Samantha", localService: true },
      { lang: "te-IN", name: "Google తెలుగు", localService: false },
      { lang: "te_IN", name: "Telugu (device)", localService: true },
      { lang: "hi-IN", name: "Lekha", localService: true },
    ];
    expect(pickVoice(voices, "te")?.name).toBe("Telugu (device)");
    expect(pickVoice(voices, "hi")?.name).toBe("Lekha");
    // English: an en-IN voice first, else any English voice.
    expect(pickVoice(voices, "en")?.name).toBe("Samantha");
    expect(pickVoice([...voices, { lang: "en-IN", name: "Rishi", localService: false }], "en")?.name).toBe("Rishi");
    // No Telugu voice on the device: none (the reply stays text and says so), never an English voice reading Telugu.
    expect(pickVoice([{ lang: "en-GB", name: "Daniel" }], "te")).toBeNull();
  });
});

describe("the assistant's own words", () => {
  it("has every sentence in English, Telugu and Hindi, with the same blanks", () => {
    for (const k of WORD_KEYS) {
      const [en, te, hi] = rawWords(k);
      expect(te, k).not.toBe("");
      expect(hi, k).not.toBe("");
      expect(blanksOf(te), k).toEqual(blanksOf(en));
      expect(blanksOf(hi), k).toEqual(blanksOf(en));
    }
  });

  it("fills numbers and names exactly", () => {
    expect(words("te", "added", { name: "Ravi Kumar" })).toBe("అయిపోయింది. Ravi Kumar కోసం ఎంక్వైరీ జోడించబడింది.");
    expect(words("hi", "approvals", { n: 3 })).toBe("3 अनुरोध आपके फ़ैसले का इंतज़ार कर रहे हैं।");
  });
});
