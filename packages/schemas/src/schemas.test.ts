import { describe, it, expect } from "vitest";
import {
  AppSettingsSchema,
  DEFAULT_SETTINGS,
  ProfileSchema,
  FieldDecisionSchema,
  AiAnalyzeRequestSchema,
  AiAnalyzeResponseSchema,
  DocumentMetadataSchema,
} from "../src/index";

describe("schemas", () => {
  it("parses a valid profile", () => {
    const profile = {
      version: 1,
      facts: [
        {
          key: "contact.email",
          value: "ali@example.com",
          sources: [{ documentId: "doc-1", documentName: "resume.pdf" }],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [],
    };
    expect(ProfileSchema.parse(profile).facts).toHaveLength(1);
  });

  it("rejects invalid profile keys", () => {
    const bad = {
      version: 1,
      facts: [
        {
          key: "not.a.real.key",
          value: "x",
          sources: [{ documentId: "d" }],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [],
    };
    expect(ProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("parses settings and applies defaults", () => {
    const parsed = AppSettingsSchema.parse(DEFAULT_SETTINGS);
    expect(parsed.apiBaseUrl).toBe("https://fill-in-psi.vercel.app");
    expect(parsed.encryptDocuments).toBe(false);
  });

  it("parses a field decision", () => {
    const decision = {
      fieldId: "f1",
      decision: "EXACT",
      value: "Ali",
      semanticKey: "personal.firstName",
      confidence: "high",
    };
    expect(FieldDecisionSchema.parse(decision).decision).toBe("EXACT");
  });

  it("accepts an empty AI analyze request with no fields", () => {
    const req = {
      fields: [],
      facts: [],
      excerpts: [],
    };
    expect(AiAnalyzeRequestSchema.safeParse(req).success).toBe(true);
  });

  it("parses an AI analyze response", () => {
    const resp = {
      results: [
        { fieldId: "f1", decision: "EXACT", value: "Ali", confidence: "high" },
      ],
    };
    expect(AiAnalyzeResponseSchema.parse(resp).results[0]?.value).toBe("Ali");
  });

  it("parses document metadata", () => {
    const meta = {
      id: "d1",
      name: "resume.pdf",
      type: "RESUME",
      kind: "PDF",
      sizeBytes: 100,
      addedAt: 1,
      updatedAt: 1,
      extractionStatus: "READY",
      storageRef: "blob:d1",
    };
    expect(DocumentMetadataSchema.parse(meta).type).toBe("RESUME");
  });
});