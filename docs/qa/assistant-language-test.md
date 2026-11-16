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
| A11 | Launcher shows a book icon (does not say "assistant"); header "chaitanya assistant" vs greeting "School OS Assistant" | open: noted for the owner |

Needs the owner: connect the AI service (ANTHROPIC_API_KEY in Vercel production) for free conversation;
the prompts now ask the model to mirror the person's Telugu style and tone (prompt.ts TE_STYLE).
