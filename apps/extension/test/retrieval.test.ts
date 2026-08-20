import { describe, it, expect } from "vitest";
import { selectRelevantContext } from "../src/features/profile/retrieve";
import type { Profile, ExtractedDocument } from "@fillin/schemas";

const src = { documentId: "doc-1", documentName: "resume.pdf" };

function profile(): Profile {
  return {
    version: 1,
    facts: [
      {
        key: "contact.email",
        value: "ali@example.com",
        sources: [src],
        confidence: "high",
        addedAt: 1,
        updatedAt: 1,
      },
      {
        key: "id.passport",
        value: "AB123456",
        sources: [src],
        confidence: "high",
        addedAt: 1,
        updatedAt: 1,
      },
      {
        key: "skill.list",
        value: "React",
        sources: [src],
        confidence: "medium",
        addedAt: 1,
        updatedAt: 1,
      },
    ],
    conflicts: [],
  };
}

describe("selectRelevantContext", () => {
  it("includes requested facts and excludes sensitive identifiers", () => {
    const ctx = selectRelevantContext(
      profile(),
      ["contact.email", "id.passport"],
      new Map()
    );
    const keys = ctx.facts.map((f) => f.key);
    expect(keys).toContain("contact.email");
    expect(keys).not.toContain("id.passport");
  });

  it("caps excerpt count", () => {
    const extracted = new Map<string, ExtractedDocument>();
    for (let i = 0; i < 100; i++) {
      extracted.set(`doc-${i}`, {
        documentId: `doc-${i}`,
        text: "Software Engineer at Example Corp.",
      });
    }
    const ctx = selectRelevantContext(
      profile(),
      ["skill.list"],
      extracted,
      ["describe your experience"]
    );
    expect(ctx.excerpts.length).toBeLessThanOrEqual(40);
  });

  it("returns empty context for empty profile", () => {
    const ctx = selectRelevantContext(
      { version: 1, facts: [], conflicts: [] },
      [],
      new Map()
    );
    expect(ctx.facts).toHaveLength(0);
    expect(ctx.excerpts).toHaveLength(0);
  });
});