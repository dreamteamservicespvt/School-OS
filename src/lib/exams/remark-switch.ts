// When report-card remark suggestions are offered (gap G30). The rule-based
// suggestions use no AI, so a school can switch them on by themselves in Exam
// Settings ("Remark suggestions") and use them with AI off. A school that has
// the AI teacher assistant on for the person's role gets them as well, as it
// did before. Rewording by the AI assistant is checked separately, in aiTask().
import { aiAllowed, type AiWho } from "../settings/switch-rules";

export const REMARK_FEATURE = "exam-remark-suggestions";

export const remarkSuggestionsFor = (who: AiWho) => who.features.has(REMARK_FEATURE) || aiAllowed(who, "ai-teacher-assistant");
