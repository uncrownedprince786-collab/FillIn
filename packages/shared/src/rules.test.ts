import { describe, it, expect } from "vitest";
import { classifyFieldText, normalizeText, matchesAny, DO_NOT_FILL_PATTERNS, SENSITIVE_PATTERNS } from "../src/index";

describe("normalizeText", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeText("  First Name  ")).toBe("first name");
  });
  it("strips punctuation noise", () => {
    expect(normalizeText("E-mail Address:")).toBe("e mail address");
  });
});

describe("classifyFieldText", () => {
  it("maps email labels", () => {
    expect(classifyFieldText("Email Address")?.key).toBe("contact.email");
    expect(classifyFieldText("Your e-mail")?.key).toBe("contact.email");
  });
  it("maps names", () => {
    expect(classifyFieldText("First name")?.key).toBe("personal.firstName");
    expect(classifyFieldText("Last name")?.key).toBe("personal.lastName");
    expect(classifyFieldText("Full legal name")?.key).toBe("personal.fullName");
  });
  it("maps contact and address fields", () => {
    expect(classifyFieldText("Phone number")?.key).toBe("contact.phone");
    expect(classifyFieldText("Postal code")?.key).toBe("address.postalCode");
    expect(classifyFieldText("City")?.key).toBe("address.city");
    expect(classifyFieldText("Country")?.key).toBe("address.country");
    expect(classifyFieldText("Street address")?.key).toBe("address.street");
  });
  it("maps education and employment", () => {
    expect(classifyFieldText("University")?.key).toBe("education.institution");
    expect(classifyFieldText("Degree")?.key).toBe("education.degree");
    expect(classifyFieldText("Job title")?.key).toBe("employment.jobTitle");
    expect(classifyFieldText("Company")?.key).toBe("employment.company");
    expect(classifyFieldText("Skills")?.key).toBe("skill.list");
  });
  it("prefers the most specific match", () => {
    expect(classifyFieldText("First name of applicant")).toBeTruthy();
    expect(classifyFieldText("Expected salary")?.key).toBe("financial.salaryExpected");
  });
  it("honors context for start/end date", () => {
    expect(classifyFieldText("Start date", "education")?.key).toBe("education.startDate");
    expect(classifyFieldText("Start date", "employment")?.key).toBe("employment.startDate");
  });
  it("returns null for unknown text", () => {
    expect(classifyFieldText("Please describe your hobbies")).toBeNull();
  });
});

describe("sensitive and do-not-fill detection", () => {
  it("detects passwords", () => {
    expect(matchesAny("New Password", DO_NOT_FILL_PATTERNS)).toBe(true);
    expect(matchesAny("Confirm password", DO_NOT_FILL_PATTERNS)).toBe(true);
  });
  it("detects OTP / verification codes", () => {
    expect(matchesAny("Enter OTP", DO_NOT_FILL_PATTERNS)).toBe(true);
    expect(matchesAny("Verification code", DO_NOT_FILL_PATTERNS)).toBe(true);
  });
  it("detects sensitive identifiers", () => {
    expect(matchesAny("CNIC number", SENSITIVE_PATTERNS)).toBe(true);
    expect(matchesAny("Passport Number", SENSITIVE_PATTERNS)).toBe(true);
    expect(matchesAny("Bank account", SENSITIVE_PATTERNS)).toBe(true);
  });
  it("does not flag ordinary fields", () => {
    expect(matchesAny("First name", DO_NOT_FILL_PATTERNS)).toBe(false);
    expect(matchesAny("Email", SENSITIVE_PATTERNS)).toBe(false);
  });
});