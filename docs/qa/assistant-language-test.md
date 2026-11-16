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
