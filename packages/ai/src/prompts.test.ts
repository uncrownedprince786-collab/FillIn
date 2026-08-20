import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AIProviderError,
  buildAnalyzePrompt,
  buildAnswerPrompt,
  buildClassifyPrompt,
  describeSchema,
} from "../src/index";

describe("prompts", () => {
  it("analyze prompt includes no-hallucination rules", () => {
    const { system, user } = buildAnalyzePrompt({
      fields: [
        { id: "f1", fieldType: "text", label: "First name" },
      ],
      facts: [{ key: "personal.firstName", value: "Ali" }],
      excerpts: [],
    });
    expect(system).toContain("NEVER invent");
    expect(system).toContain("EXACT");
    expect(user).toContain("f1");
    expect(user).toContain("Relevant user facts");
  });

  it("answer prompt carries the question", () => {
    const { user } = buildAnswerPrompt("Describe your experience", "EXPERIENCE", [], []);
    expect(user).toContain("Describe your experience");
  });

  it("classify prompt returns categories", () => {
    const { system } = buildClassifyPrompt("What is your expected salary?");
    expect(system.toLowerCase()).toContain("salary");
  });
});

describe("describeSchema", () => {
  const schema = z.object({ value: z.string(), ok: z.boolean() });
  it("renders a shape description", () => {
    const out = describeSchema(schema as z.ZodType<unknown>);
    expect(out).toContain("value");
    expect(out).toContain("ok");
  });
});

describe("AIProviderError", () => {
  it("carries a code and cause", () => {
    const err = new AIProviderError("RATE_LIMITED", "slow down", { cause: new Error("x") });
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.message).toBe("slow down");
    expect(err.name).toBe("AIProviderError");
  });
});