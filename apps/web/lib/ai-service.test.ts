import { describe, it, expect } from "vitest";
import { guardAnalyzeResults } from "./ai-service";
import type { AiAnalyzeRequest, AiFieldResult } from "@fillin/schemas";

const input: AiAnalyzeRequest = {
  fields: [
    { id: "email", fieldType: "email", label: "Email" },
    { id: "linkedin", fieldType: "url", label: "LinkedIn" },
    { id: "about", fieldType: "textarea", label: "About me" },
    { id: "phone", fieldType: "tel", label: "Phone" },
    { id: "cnic", fieldType: "text", label: "CNIC" },
  ],
  facts: [
    { key: "contact.email", value: "ali@example.com" },
    { key: "contact.phone", value: "+92 300 1234567" },
    { key: "contact.linkedin", value: "https://linkedin.com/in/alikhan" },
  ],
  excerpts: [],
};

function result(overrides: Partial<AiFieldResult>): AiFieldResult {
  return {
    fieldId: "email",
    decision: "EXACT",
    value: "ali@example.com",
    confidence: "high",
    ...overrides,
  };
}

describe("guardAnalyzeResults", () => {
  it("keeps exact matches", () => {
    const guarded = guardAnalyzeResults(input, [result({ value: "ali@example.com" })]);
    expect(guarded[0]?.decision).toBe("EXACT");
    expect(guarded[0]?.value).toBe("ali@example.com");
  });

  it("downgrades single-token invented values to ASK_USER", () => {
    const guarded = guardAnalyzeResults(input, [
      result({ fieldId: "phone", value: "123-456-7890" }),
    ]);
    expect(guarded[0]?.decision).toBe("ASK_USER");
    expect(guarded[0]?.value).toBeUndefined();
  });

  it("downgrades fabricated EXACT values to ASK_USER", () => {
    const guarded = guardAnalyzeResults(input, [
      result({ value: "bob@fabricated.net" }),
    ]);
    expect(guarded[0]?.decision).toBe("ASK_USER");
  });

  it("allows multi-token values fully covered by facts", () => {
    const guarded = guardAnalyzeResults(input, [
      result({ fieldId: "linkedin", value: "https://linkedin.com/in/alikhan" }),
    ]);
    expect(guarded[0]?.decision).toBe("EXACT");
  });

  it("allows textarea GENERATED answers", () => {
    const guarded = guardAnalyzeResults(input, [
      result({
        fieldId: "about",
        decision: "GENERATED",
        value: "I am a software engineer.",
      }),
    ]);
    expect(guarded[0]?.decision).toBe("GENERATED");
    expect(guarded[0]?.value).toBe("I am a software engineer.");
  });

  it("downgrades GENERATED on non-textarea fields", () => {
    const guarded = guardAnalyzeResults(input, [
      result({ decision: "GENERATED", value: "Something" }),
    ]);
    expect(guarded[0]?.decision).toBe("ASK_USER");
  });

  it("strips values from SENSITIVE / DO_NOT_FILL decisions", () => {
    const guarded = guardAnalyzeResults(input, [
      result({ fieldId: "cnic", decision: "SENSITIVE", value: "61101-1234567-8" }),
      result({ fieldId: "password", decision: "DO_NOT_FILL", value: "hunter2" }),
    ]);
    expect(guarded[0]?.value).toBeUndefined();
    expect(guarded[1]?.value).toBeUndefined();
  });
});