# School OS Assistant: layman test in Telugu and English (16 Nov 2026)

Owner's ask: use the assistant like a real person, in English and in the Telugu that educated Telugu
speakers talk (Telugu with English words mixed in); it must answer the way the person talks, with feeling.
Live site school-os-beta, test school "chaitanya chekkapalli", School Admin Chrome (694c21cd).
Live state: AI service "Not connected yet", so every answer comes from the assistant's own word list.
Progress page: https://claude.ai/artifact/Lnc8tVgLTuMSDDRBBKQQUD (docs/qa/assistant-test-progress.html).

## Round 1 (before fixes)

Switched on for School Admin, Principal, Accountant, Class Teacher, Teacher, Receptionist (Settings >
Modules On/Off > AI assistant). English: 18 questions, 11 understood. Telugu: 40 questions checked
(35 live in the panel, all 40 offline against the word list), 26 understood.

| # | Problem | Fix |
|---|---|---|
| A1 | "hi", "thank you", "నమస్తే sir" answered "Sorry, I did not get that" | rules.ts small talk: a warm line, happy face and voice |
| A2 | English words in Telugu letters (ఆబ్సెంట్, స్టూడెంట్స్, పెండింగ్, కలెక్షన్, లీవ్, బర్త్‌డే, వీక్) not understood; Telugu voice typing writes exactly these | ask/questions.ts TE_LOANS + plainWords() |
| A3 | Telugu verbs and romanised Telugu not understood: కట్టని, వచ్చింది, వసూలైంది, తీసుకోని, raledu, kattani, takkuva, ninna, ivvala, "money came" | word table + cameWord + when words |
| A4 | "ee roju birthday evaridi" read as this week | today/yesterday/week/month words in English letters |
| A5 | First Telugu question in an English conversation answered in English (switch needed 2 messages) | language follows each clear message at once (SWITCH_AFTER 1) |
| A6 | Telugu replies bookish ("గైర్హాజరుగా లెక్కించలేము", "సిబ్బంది సభ్యుడు") | te-mix.ts: everyday Telugu with English school words when the person talks like that; plain Telugu only for plain-Telugu writers |
| A7 | Scope line "Whole school" stayed English in Telugu replies | scope translated per part |
| A8 | Homework, holidays/calendar, approvals, add an enquiry: "did not get that" without AI | rules.ts: the three lists from the words; enquiry gets the form link |
| A9 | Voice read "16-11-2026" and "(01-11-2026 to 16-11-2026)", and every reply in one flat tone | speech.ts: today/yesterday/16 November, ranges not read, ₹ as rupees; tone per feeling |
| A10 | No emotion for greetings or good news | new feeling "happy" (robot waves, sparkles): greetings, thanks, nobody absent, nothing pending, birthdays today |
| A11 | Launcher shows a book icon (does not say "assistant"); header "chaitanya assistant" vs greeting "School OS Assistant" | button shows the robot's face; greeting says "your school assistant" like the header |

Needs the owner: connect the AI service (ANTHROPIC_API_KEY in Vercel production) for free conversation;
the prompts now ask the model to mirror the person's Telugu style and tone (prompt.ts TE_STYLE).

## Round 2: deploy 19 live (a1bb534d), typed visibly in each role's own Chrome

All 6 roles: School Admin (Saiveni), Accountant (aksha), Class Teacher (KUSUMA), Receptionist (harikaa),
Principal (anjali), Subject Teacher (aswini). Passed: Telugu greeting (robot waves, "సంతోషంగా!"),
"fees ఇంకా కట్టని వాళ్ళు ఎవరు?", "ఈ వీక్ ఫీజు కలెక్షన్ ఎంత?", "ninna fees entha vachindi", holidays this
week, approvals ("అంతా clear!"), homework, enquiry with the form link, Roman-letter Telugu for the class
teacher (own class only), plain Telugu stays plain for the Principal, English switches at once.

| # | Problem found in round 2 | Fix (deploy 20) |
|---|---|---|
| B1 | Chips under replies still bookish Telugu ("గైర్హాజరైనవారు", "వసూలైంది") | 22 question titles in te-mix.ts; each chip is understood again when tapped (test) |
| B2 | Scope line "As on 16-11-2026", "16-11-2026 to 16-11-2026" in English | scopePart() in tools.ts |
| B3 | "1 ఉన్నాయి" for one calendar entry | upcomingOne |
| B4 | Telugu link words mixed "తెరవండి" and "ఓపెన్ చేయండి" | all "ఓపెన్ చేయండి" |
| B5 | "super, thank you" switched a Telugu conversation to English | small talk in English letters keeps the language |
| B6 | "10000 కంటే ఎక్కువ fees బాకీ" ignored the amount (all 29 listed) | amounts said the Telugu/Hindi way |
| B7 | Receptionist "who is absent today?" got "did not get that" | clear question outside the role: "not part of your role" |
| B8 | "Which teachers are on leave today?" said "1 staff member" without the name | short lists (up to 5) name the people |
| B9 | Robot button: the face screen is blank (eyes are drawn live in the panel) | same glowing eyes and smile on the button |

## Voice standard (AI voice, 17 Nov 2026)

When `GEMINI_API_KEY` is set, Gemini writes the words (unless Claude's key is set) and the
Gemini voice model (`gemini-3.8-flash-tts`, fallback `gemini-3.8-flash-lite-tts`) says every
reply aloud when the speaker button is on. The bar is the voice modes of ChatGPT and Gemini Live:
a real person, not a reader. Code: src/lib/assistant/voice.ts (feel to style), speak.ts and
POST /api/v1/assistant/speak. With no key, or on any failure, the browser's voice reads it as before.

How each feel should sound (the reply carries a feel and a short delivery note):

| Feel / delivery | When | Should sound |
|---|---|---|
| happy, "warm and pleased" | nobody absent, all paid, a birthday, thanks | a smile you can hear, a little brighter and quicker |
| happy, "bright and welcoming" | a greeting | bright, friendly, like greeting a colleague at the counter |
| answer, "gentle and concerned" | children absent, fees unpaid, attendance not taken, below pass | softer and slower on the problem, then calm and clear on the next step |
| answer, "calm and clear" | plain numbers, lists, how-to | steady, clear, unhurried; names said clearly |
| done, "bright and relieved" | an enquiry added after "Yes" | pleased and relieved, short |
| sorry, "gentle and kind" | cannot do it, not this role, the service is down | sincere and soft, never dramatic, never robotic |

Language: English replies in natural Indian English; Telugu in everyday educated Telugu with the
English school words said the English way (attendance, fees, pending); Hindi the same way. Dates are
said as "today", "16 November"; ₹ amounts as "1,55,202 rupees". Never bookish Telugu or Hindi.

Fail if: the voice reads a style note aloud, sounds flat for good news, sounds cheerful about an
absent child, stumbles on English school words in Telugu, says digits of a date one by one, starts
more than about 3 seconds after the reply appears, or keeps talking after Stop.

### Live script (run once the key exists): 12 conversations, speaker on, in each role's own Chrome

| # | Role, way of talking | Say | Good sounds like |
|---|---|---|---|
| V1 | Receptionist, worried parent at the desk, English | "A parent is asking, is Aarav in 5 A present today?" | gentle and concerned if absent, relieved if present; one short sentence; no "I did not get that" |
| V2 | Receptionist, Telugu mixed | "ఒక parent వచ్చారు, admission enquiry add చేయాలి" | calm, helpful, asks for the missing fields one by one; card shown; nothing added before "Yes" |
| V3 | Principal, busy, mixed Telugu | "ఈరోజు absent ఎవరు?" | quick, gentle on the absent names, everyday Telugu, English words said in English |
| V4 | Principal, mixed Telugu, follow-up | "ninna?" then "only 5 A?" | keeps the same tools; same warm, brisk tone; no restart of the greeting |
| V5 | Accountant, English, formal | "What is today's fee collection?" | calm and clear; "rupees" said once; no digit-by-digit reading |
| V6 | Accountant, English | "Who has fees overdue above 10000?" | gentle and concerned, names clear, "and N more" only when given |
| V7 | Class teacher, Hindi | "आज मेरी क्लास में कौन absent है?" | everyday Hindi, own class only, gentle |
| V8 | Subject teacher, Hindi, Roman letters | "aaj kaun absent hai?" | replies in Hindi, not English; calm |
| V9 | Any role, upset | "This is useless, nothing works!" | soft and kind, says what it can do next, never defensive, never "Sorry, I did not get that" |
| V10 | Any role, happy news | "Any birthdays today?" (with one in the data) | a smile you can hear, warm |
| V11 | Principal, asks for a change | "Mark Rohan present" | gentle refusal: cannot change attendance here, points to the screen; nothing changed |
| V12 | Any role, greeting then thanks | "Hi" ... "super, thank you" | bright welcome, warm thanks, same language kept |

For each: note how long until the voice starts, whether the mouth and the wave follow the sound,
whether Stop (mic button or speaker button) cuts it at once, and whether Settings, Modules On/Off
shows the spoken replies in the month's AI use. Also check once with `AI_TTS_MODEL=off`: replies are
read by the browser's voice exactly as before.
