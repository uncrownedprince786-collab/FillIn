import { describe, it, expect } from "vitest";
import type { Profile } from "@fillin/schemas";
import {
  mergeHints,
  resolveConflict,
  resolveValue,
  distinctValues,
  validateFactValue,
} from "../src/features/profile/builder";
import type { Hint } from "../src/features/documents/hints";

const srcA = { documentId: "doc-a", documentName: "resume.pdf" };
const srcB = { documentId: "doc-b", documentName: "app.pdf" };

function emptyProfile(): Profile {
  return { version: 1, facts: [], conflicts: [] };
}

describe("mergeHints", () => {
  it("adds new facts with source attribution", () => {
    const hints: Hint[] = [
      { key: "contact.email", value: "ali@example.com" },
      { key: "personal.firstName", value: "Ali" },
    ];
    const p = mergeHints(emptyProfile(), hints, srcA);
    expect(p.facts).toHaveLength(2);
    expect(p.facts[0]?.sources[0]?.documentId).toBe("doc-a");
  });

  it("adds a second source for the same value", () => {
    const hintsA: Hint[] = [{ key: "contact.email", value: "ali@example.com" }];
    const p1 = mergeHints(emptyProfile(), hintsA, srcA);
    const p2 = mergeHints(p1, hintsA, srcB);
    expect(p2.facts).toHaveLength(1);
    expect(p2.facts[0]?.sources).toHaveLength(2);
    expect(p2.conflicts).toHaveLength(0);
  });

  it("creates a conflict when sources disagree", () => {
    const p1 = mergeHints(emptyProfile(), [{ key: "contact.phone", value: "+92 300 1111111" }], srcA);
    const p2 = mergeHints(p1, [{ key: "contact.phone", value: "+92 300 2222222" }], srcB);
    expect(p2.facts).toHaveLength(1);
    expect(p2.conflicts).toHaveLength(1);
    expect(p2.conflicts[0]?.status).toBe("OPEN");
    expect(p2.conflicts[0]?.values).toHaveLength(2);
  });

  it("does not override a user-confirmed value", () => {
    const p1 = mergeHints(emptyProfile(), [{ key: "contact.phone", value: "+92 300 1111111" }], srcA);
    const confirmed = {
      ...p1,
      facts: p1.facts.map((f) => ({ ...f, userConfirmed: true })),
    };
    const p2 = mergeHints(confirmed, [{ key: "contact.phone", value: "+92 300 9999999" }], srcB);
    expect(p2.facts).toHaveLength(1);
    expect(p2.conflicts).toHaveLength(0);
  });

  it("ignores empty values", () => {
    const p = mergeHints(emptyProfile(), [{ key: "contact.email", value: "   " }], srcA);
    expect(p.facts).toHaveLength(0);
  });
});

describe("resolveConflict", () => {
  it("marks the conflict resolved and promotes the chosen value to a confirmed fact", () => {
    const p1 = mergeHints(emptyProfile(), [{ key: "contact.phone", value: "+92 300 1111111" }], srcA);
    const p2 = mergeHints(p1, [{ key: "contact.phone", value: "+92 300 2222222" }], srcB);
    const p3 = resolveConflict(p2, "contact.phone", "+92 300 2222222");
    expect(p3.conflicts[0]?.status).toBe("RESOLVED");
    expect(p3.conflicts[0]?.resolvedValue).toBe("+92 300 2222222");
    const chosen = p3.facts.find((f) => f.value === "+92 300 2222222");
    expect(chosen?.userConfirmed).toBe(true);
    // the previously-conflicting value is now resolvable
    expect(resolveValue(p3, "contact.phone")?.value).toBe("+92 300 2222222");
  });
});

describe("resolveValue / distinctValues", () => {
  it("distinct values for a key", () => {
    const p1 = mergeHints(emptyProfile(), [{ key: "contact.phone", value: "+92 300 1111111" }], srcA);
    const p2 = mergeHints(p1, [{ key: "contact.phone", value: "+92 300 1111111" }], srcB);
    expect(distinctValues(p2, "contact.phone")).toEqual(["+92 300 1111111"]);
  });

  it("returns null while a conflict is unresolved", () => {
    const p1 = mergeHints(emptyProfile(), [{ key: "contact.phone", value: "+92 300 1111111" }], srcA);
    const p2 = mergeHints(p1, [{ key: "contact.phone", value: "+92 300 2222222" }], srcB);
    expect(resolveValue(p2, "contact.phone")).toBeNull();
  });
});

describe("validateFactValue", () => {
  it("validates emails", () => {
    expect(validateFactValue("contact.email", "a@b.co")).toBe(true);
    expect(validateFactValue("contact.email", "not-an-email")).toBe(false);
  });
  it("validates phones by digit count", () => {
    expect(validateFactValue("contact.phone", "+92 300 1234567")).toBe(true);
    expect(validateFactValue("contact.phone", "12")).toBe(false);
  });
});