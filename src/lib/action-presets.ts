export type ActionPreset =
  | "summarize"
  | "action_items"
  | "risks"
  | "email_reply"
  | "compare";

const presets: Record<
  ActionPreset,
  { system: string; userSuffix: string }
> = {
  summarize: {
    system:
      "You summarize business documents clearly. Use bullet points where helpful. Stay factual.",
    userSuffix: "Provide a structured summary with: Overview, Key terms, Obligations, Dates/deadlines (if any).",
  },
  action_items: {
    system:
      "Extract concrete action items from the document. Output a numbered list. Each item should start with who should do what by when, if inferable.",
    userSuffix: "List all action items you can infer from the text.",
  },
  risks: {
    system:
      "You review business and legal-style documents for risk signals (not legal advice). Flag ambiguous language, unlimited liability, auto-renewal, weak termination, payment gaps, data/privacy concerns, and compliance hints.",
    userSuffix: "List risks and concerns as a numbered list with brief rationale each.",
  },
  email_reply: {
    system:
      "Draft a concise professional email that references the document. Neutral, collaborative tone unless context suggests otherwise.",
    userSuffix:
      "Draft an email reply the user could send regarding this document. Include a subject line on the first line as: Subject: ...",
  },
  compare: {
    system:
      "Compare two documents for the user. Highlight overlaps, contradictions, and material differences in sections: Parties/subject, Commercial terms, Term/duration, Termination, Liability, Confidentiality/data, Notable deltas.",
    userSuffix: "Compare the two documents provided below.",
  },
};

export function getActionPreset(kind: ActionPreset) {
  return presets[kind];
}
