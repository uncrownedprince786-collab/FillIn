import type { ProfileKey } from "@fillin/schemas";
import { normalizeText } from "./format";

export type FieldContext = "education" | "employment" | "none";

export interface MatchRule {
  /** any of these normalized phrases present in the text triggers the rule */
  keys: string[];
  /** if any of these normalized phrases is present, the rule is suppressed */
  excludes?: string[];
  key: ProfileKey;
  context?: FieldContext;
  priority: number;
}

const k = (s: string) => normalizeText(s);

export const MATCH_RULES: MatchRule[] = [
  // Contact — most specific first by phrase length anyway
  { keys: [k("email address"), k("e-mail address")], key: "contact.email", priority: 20 },
  { keys: [k("email"), k("e mail"), k("e-mail")], key: "contact.email", priority: 10 },
  { keys: [k("phone number"), k("mobile number"), k("telephone number"), k("contact number"), k("cell phone")], key: "contact.phone", priority: 20 },
  { keys: [k("phone"), k("telephone"), k("mobile"), k("cell"), k("tel")], key: "contact.phone", priority: 10 },
  { keys: [k("linkedin")], key: "contact.linkedin", priority: 30 },
  { keys: [k("personal website"), k("portfolio url"), k("portfolio link")], key: "contact.website", priority: 25 },
  { keys: [k("website"), k("portfolio"), k("homepage"), k("blog url")], key: "contact.website", priority: 10 },

  // Personal
  { keys: [k("full legal name"), k("full name"), k("legal name")], key: "personal.fullName", priority: 25 },
  { keys: [k("first name"), k("given name"), k("forename"), k("fname")], key: "personal.firstName", priority: 30 },
  { keys: [k("last name"), k("family name"), k("surname"), k("lname")], key: "personal.lastName", priority: 30 },
  { keys: [k("date of birth"), k("birth date"), k("birthday"), k("dob")], key: "personal.dateOfBirth", priority: 30 },
  { keys: [k("gender"), k("sex")], key: "personal.gender", priority: 20 },
  { keys: [k("nationality"), k("citizenship"), k("country of citizenship")], key: "personal.nationality", priority: 25 },
  { keys: [k("marital status"), k("marriage status")], key: "personal.maritalStatus", priority: 25 },
  { keys: [k("father name"), k("father s name")], key: "personal.fatherName", priority: 20 },

  // Address
  { keys: [k("street address"), k("address line 1"), k("address 1"), k("residential address"), k("home address"), k("current address"), k("permanent address"), k("billing address")], key: "address.street", priority: 25 },
  { keys: [k("address line 2"), k("address 2"), k("apartment"), k("suite"), k("unit")], key: "address.street2", priority: 20 },
  { keys: [k("city"), k("town")], key: "address.city", priority: 20 },
  { keys: [k("province"), k("state"), k("region"), k("territory"), k("county")], key: "address.state", priority: 20 },
  { keys: [k("postal code"), k("zip code"), k("zip"), k("post code"), k("pincode"), k("pin code")], key: "address.postalCode", priority: 25 },
  { keys: [k("country of residence"), k("country region")], key: "address.country", priority: 22 },
  { keys: [k("country")], key: "address.country", priority: 15 },

  // Education
  { keys: [k("name of university"), k("university name"), k("college"), k("institution"), k("university"), k("school"), k("academy"), k("institute"), k("campus")], key: "education.institution", priority: 20 },
  { keys: [k("degree"), k("qualification"), k("highest qualification")], key: "education.degree", priority: 25 },
  { keys: [k("field of study"), k("area of study"), k("course of study"), k("major"), k("specialization"), k("discipline"), k("subject of study")], key: "education.field", priority: 25 },
  { keys: [k("gpa"), k("cgpa"), k("grade point"), k("grade point average")], key: "education.gpa", priority: 25 },
  { keys: [k("level of education"), k("education level"), k("highest education")], key: "education.level", priority: 25 },
  { keys: [k("start date"), k("enrollment date"), k("enrolment date"), k("year of admission")], key: "education.startDate", priority: 15, context: "education" },
  { keys: [k("graduation date"), k("graduated"), k("completion date"), k("expected graduation"), k("year of graduation")], key: "education.endDate", priority: 25 },
  { keys: [k("end date")], key: "education.endDate", priority: 15, context: "education" },

  // Employment
  { keys: [k("company name"), k("employer"), k("company"), k("organization"), k("organisation"), k("firm"), k("workplace"), k("current employer")], key: "employment.company", priority: 20 },
  { keys: [k("job title"), k("position"), k("designation"), k("role"), k("current title")], key: "employment.jobTitle", priority: 25 },
  { keys: [k("employment type"), k("job type"), k("employment status"), k("contract type"), k("work arrangement")], key: "employment.employmentType", priority: 25 },
  { keys: [k("currently employed"), k("currently working"), k("are you employed"), k("do you currently work")], key: "employment.current", priority: 25 },
  { keys: [k("start date"), k("joining date"), k("hired date"), k("work start")], key: "employment.startDate", priority: 15, context: "employment" },
  { keys: [k("end date"), k("resignation date"), k("leave date"), k("work end")], key: "employment.endDate", priority: 15, context: "employment" },

  // Skills / certs / languages
  { keys: [k("skills"), k("key skills"), k("technical skills"), k("skill set"), k("skillset"), k("core competencies"), k("competencies")], key: "skill.list", priority: 20 },
  { keys: [k("certification"), k("certifications"), k("certificate"), k("licenses"), k("licences"), k("professional certifications")], key: "certification.list", priority: 20 },
  { keys: [k("languages"), k("language proficiency"), k("spoken languages"), k("language skills")], key: "language.list", priority: 20 },

  // Financial
  { keys: [k("expected salary"), k("salary expectation"), k("desired salary"), k("expected ctc"), k("compensation expectation"), k("annual salary")], key: "financial.salaryExpected", priority: 30 },
  { keys: [k("salary"), k("compensation"), k("ctc")], key: "financial.salaryExpected", priority: 15 },

  // Identification (sensitive)
  { keys: [k("cnic"), k("national identity"), k("national id"), k("national identification")], key: "id.cnic", priority: 30 },
  { keys: [k("passport number"), k("passport no"), k("passport")], key: "id.passport", priority: 30 },
  { keys: [k("tax number"), k("tax id"), k("ntn"), k("tin"), k("taxpayer")], key: "id.taxNumber", priority: 30 },
  { keys: [k("bank account"), k("iban"), k("account number"), k("routing number"), k("sort code")], key: "id.bankAccount", priority: 25 },

  // Generic address catch-all (low priority)
  { keys: [k("address")], key: "address.street", priority: 5 },
];

/**
 * Score a single rule against normalized text.
 * Longer matched phrase and higher priority win.
 */
export function matchRule(
  text: string,
  context: FieldContext
): { rule: MatchRule; score: number } | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  let best: { rule: MatchRule; score: number } | null = null;
  for (const rule of MATCH_RULES) {
    if (rule.excludes && rule.excludes.some((e) => normalized.includes(e))) {
      continue;
    }
    for (const keyPhrase of rule.keys) {
      if (keyPhrase && normalized.includes(keyPhrase)) {
        const contextBoost = rule.context === context ? 1000 : 0;
        const score = keyPhrase.length * 10 + rule.priority + contextBoost;
        if (!best || score > best.score) {
          best = { rule, score };
        }
      }
    }
  }
  return best;
}

export function classifyFieldText(
  text: string,
  context: FieldContext = "none"
): { key: ProfileKey; score: number } | null {
  const m = matchRule(text, context);
  if (!m) return null;
  return { key: m.rule.key, score: m.score };
}