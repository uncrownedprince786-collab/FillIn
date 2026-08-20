import { describe, it, expect } from "vitest";
import { extractHints } from "../src/features/documents/hints";

describe("extractHints", () => {
  it("extracts email, phone, and URLs", () => {
    const text = [
      "ali@example.com",
      "+92 300 1234567",
      "https://linkedin.com/in/alikhan",
      "https://github.com/alikhan",
    ].join("\n");
    const hints = extractHints(text);
    expect(hints.some((h) => h.key === "contact.email" && h.value === "ali@example.com")).toBe(true);
    expect(hints.some((h) => h.key === "contact.phone")).toBe(true);
    expect(hints.some((h) => h.key === "contact.linkedin")).toBe(true);
  });

  it("ignores social links as websites", () => {
    const hints = extractHints("https://twitter.com/alikhan");
    expect(hints.some((h) => h.key === "contact.website")).toBe(false);
  });

  it("extracts education lines", () => {
    const hints = extractHints("Bachelor of Science, Computer Science\nUniversity of Punjab");
    expect(hints.some((h) => h.key === "education.degree")).toBe(true);
    expect(hints.some((h) => h.key === "education.institution")).toBe(true);
  });

  it("extracts GPA", () => {
    const hints = extractHints("CGPA: 3.7");
    expect(hints.some((h) => h.key === "education.gpa" && h.value === "3.7")).toBe(true);
  });

  it("extracts job titles and employers", () => {
    const hints = extractHints("Software Engineer at Acme Corp\nSoftware Engineer\nDeveloper");
    expect(hints.some((h) => h.key === "employment.jobTitle")).toBe(true);
    expect(hints.some((h) => h.key === "employment.company" && h.value === "Acme Corp")).toBe(true);
  });

  it("deduplicates repeated values", () => {
    const hints = extractHints(["Software Engineer", "Software Engineer", "Software Engineer"].join("\n"));
    expect(hints.filter((h) => h.key === "employment.jobTitle")).toHaveLength(1);
  });
});