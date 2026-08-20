import {
  AiAnalyzeField,
  AiAnswerRequest,
  ClassifyQuestionResponseSchema,
} from "@fillin/schemas";

const NO_HALLUCINATION_RULES = [
  "Use ONLY the information provided in this request.",
  "NEVER invent, guess, or infer facts that are not present in the supplied information.",
  "NEVER transform identifiers. Preserve names, numbers, dates and addresses exactly as written.",
  "If the supplied information does not contain what the question needs, set decision to ASK_USER or UNKNOWN and leave value empty. Do not make something up.",
  "Do not answer unsupported legal, financial, or medical questions as fact.",
  "For natural-language answers, only reword facts that are present. Adding achievements, numbers, dates, or titles that are not in the source is forbidden.",
  "If two supplied facts contradict each other, set decision to CONFLICT and leave value empty.",
  "Do not fill passwords, OTPs, CVV numbers, or authentication secrets. Use DO_NOT_FILL.",
  "Sensitive identifiers (passport numbers, national ID numbers, bank accounts, tax numbers) may only be echoed when the question explicitly requests that exact identifier AND the value was supplied.",
  "Classify honestly. UNKNOWN is a valid answer.",
].join("\n");

const FACTS_BLOCK = (facts: { key: string; value: string }[]): string =>
  facts.length
    ? facts
        .map((f) => `- ${f.key}: ${f.value}`)
        .join("\n")
    : "(none)";

const EXCERPTS_BLOCK = (
  excerpts: { key: string; value: string; source?: string }[]
): string =>
  excerpts.length
    ? excerpts
        .map((e) => `- [${e.key}]${e.source ? ` (from ${e.source})` : ""}: ${e.value}`)
        .join("\n")
    : "(none)";

export function buildAnalyzePrompt(input: {
  fields: AiAnalyzeField[];
  facts: { key: string; value: string }[];
  excerpts: { key: string; value: string; source?: string }[];
  userAnswers?: { question: string; answer: string }[];
}): { system: string; user: string } {
  const fieldsText = input.fields
    .map((f) => {
      const parts: string[] = [`id: ${JSON.stringify(f.id)}`, `type: ${f.fieldType}`];
      for (const prop of ["label", "placeholder", "name", "htmlId", "ariaLabel", "section", "questionText"] as const) {
        if (f[prop]) parts.push(`${prop}: ${JSON.stringify(f[prop])}`);
      }
      if (f.options?.length) parts.push(`options: ${JSON.stringify(f.options)}`);
      return `{ ${parts.join(", ")} }`;
    })
    .join("\n");

  const userAnswersText = (input.userAnswers ?? []).length
    ? (input.userAnswers ?? [])
        .map((a) => `- ${a.question}: ${a.answer}`)
        .join("\n")
    : "(none)";

  const system = [
    "You are the reasoning engine of Fillin, a browser extension that fills forms from information a user provided once.",
    NO_HALLUCINATION_RULES,
    "",
    "For EVERY field in the request, decide one of: EXACT, DERIVED, GENERATED, ASK_USER, UNKNOWN, CONFLICT, SENSITIVE, DO_NOT_FILL.",
    "- EXACT: the value exists verbatim in the supplied facts.",
    "- DERIVED: computed safely from supplied facts (e.g. full name from first+last).",
    "- GENERATED: a natural-language answer written only from supplied facts.",
    "- ASK_USER: the question can be answered but we need the user's choice (e.g. preferences, salary).",
    "- UNKNOWN: no reliable source among the supplied facts.",
    "- CONFLICT: supplied facts disagree.",
    "- SENSITIVE: the field is sensitive and must not be filled automatically.",
    "- DO_NOT_FILL: passwords, OTPs, CVV, authentication secrets.",
    "Never return a value unless you saw it (or derived it safely) in the supplied facts.",
    "Set confidence to high when the match is certain, medium when reasonable, low when uncertain.",
    "Provide a short reason for each field.",
  ].join("\n");

  const user = [
    "Fields (each requires a decision):",
    fieldsText,
    "",
    "Relevant user facts:",
    FACTS_BLOCK(input.facts),
    "",
    "Relevant document excerpts:",
    EXCERPTS_BLOCK(input.excerpts),
    "",
    "User's saved answers:",
    userAnswersText,
  ].join("\n");

  return { system, user };
}

export function buildAnswerPrompt(
  question: string,
  category: string | undefined,
  facts: { key: string; value: string }[],
  excerpts: { key: string; value: string; source?: string }[]
): { system: string; user: string } {
  const system = [
    "You are the question-answering engine of Fillin, a browser extension.",
    NO_HALLUCINATION_RULES,
    "",
    "Answer the user's form question using only the supplied facts and excerpts.",
    "Choose one decision: EXACT, DERIVED, GENERATED, ASK_USER, UNKNOWN, CONFLICT, SENSITIVE, DO_NOT_FILL.",
    "Return a concise, natural answer for GENERATED/EXACT/DERIVED. Leave value empty for ASK_USER/UNKNOWN/CONFLICT.",
  ].join("\n");

  const user = [
    `Form question: ${question}`,
    category ? `Question category: ${category}` : "",
    "",
    "Relevant user facts:",
    FACTS_BLOCK(facts),
    "",
    "Relevant document excerpts:",
    EXCERPTS_BLOCK(excerpts),
  ].join("\n");

  return { system, user };
}

export function buildClassifyPrompt(question: string): { system: string; user: string } {
  const categories = [
    "PERSONAL_INFORMATION",
    "CONTACT_INFORMATION",
    "ADDRESS",
    "EDUCATION",
    "EMPLOYMENT",
    "EXPERIENCE",
    "SKILLS",
    "DOCUMENT",
    "YES_NO",
    "PREFERENCE",
    "LEGAL_DECLARATION",
    "FINANCIAL",
    "SENSITIVE",
    "UNKNOWN",
  ].join(", ");

  const system = [
    "You classify form questions into exactly one category. This is used to select which of the user's stored facts are relevant.",
    "Choose only from these categories:",
    categories,
    "If the question asks for a document upload, choose DOCUMENT.",
    "If the question asks for a yes/no answer, choose YES_NO.",
    "If it is a preference or subjective choice, choose PREFERENCE.",
    "If the question concerns money, salary, cards, or banking, choose FINANCIAL.",
    "If it asks for passwords, OTPs, CVV, national ID, passport, or similar, choose SENSITIVE.",
    "If unsure, choose UNKNOWN.",
  ].join("\n");

  const user = `Question: ${question}\nCategory:`;

  return { system, user };
}

export const CLASSIFY_SCHEMA = ClassifyQuestionResponseSchema;

const PROFILE_KEYS = [
  "personal.fullName",
  "personal.firstName",
  "personal.lastName",
  "personal.dateOfBirth",
  "personal.gender",
  "personal.nationality",
  "personal.maritalStatus",
  "personal.fatherName",
  "contact.email",
  "contact.phone",
  "contact.phoneAlt",
  "contact.linkedin",
  "contact.website",
  "address.street",
  "address.street2",
  "address.city",
  "address.state",
  "address.postalCode",
  "address.country",
  "education.institution",
  "education.degree",
  "education.field",
  "education.startDate",
  "education.endDate",
  "education.gpa",
  "education.level",
  "employment.company",
  "employment.jobTitle",
  "employment.startDate",
  "employment.endDate",
  "employment.employmentType",
  "employment.current",
  "skill.list",
  "certification.list",
  "language.list",
  "financial.salaryExpected",
  "financial.currency",
  "id.cnic",
  "id.passport",
  "id.taxNumber",
  "id.bankAccount",
].join(", ");

export function buildExtractPrompt(input: {
  documentName: string;
  docType?: string;
  text: string;
}): { system: string; user: string } {
  const system = [
    "You extract structured facts from a document's text for the Fillin profile builder.",
    NO_HALLUCINATION_RULES,
    "",
    `Use ONLY these keys where applicable: ${PROFILE_KEYS}`,
    "Rules:",
    "- Extract a key only when the text states it explicitly. Do not guess values.",
    "- personal.fullName: a full name as written. personal.firstName / personal.lastName: split names ONLY when clear.",
    "- skill.list, certification.list, language.list: values should be a single skill/certificate/language each (one hint per item), not a comma list.",
    "- employment.current: use the value 'yes' or 'no' only if the text states employment status.",
    "- Address components: only if an address is present.",
    "- Dates: preserve the exact written form.",
    "- Do not invent a CNIC, passport, or bank number that is not literally written in the text.",
    "- If a key is not present in the text, omit it. Omitting is correct.",
    "Return an object with a single field `hints`, an array of { key, value }.",
  ].join("\n");
  const user = `Document name: ${input.documentName}${input.docType ? `\nDocument type: ${input.docType}` : ""}\n\nText:\n${input.text.slice(0, 30000)}`;
  return { system, user };
}