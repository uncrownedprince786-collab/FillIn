import { describe, it, expect } from "vitest";
import type { DetectedField, Profile } from "@fillin/schemas";
import {
  classifyField,
  decideLocally,
  detectDoNotFill,
  detectSensitive,
  getContext,
  factsForContext,
} from "../src/features/forms/local";

function field(overrides: Partial<DetectedField> = {}): DetectedField {
  return {
    id: "f1",
    kind: "input",
    fieldType: "text",
    name: "name",
    label: "First name",
    required: false,
    hasValue: false,
    visible: true,
    ...overrides,
  };
}

function emptyProfile(): Profile {
  return { version: 1, facts: [], conflicts: [] };
}

const src = { documentId: "doc-1", documentName: "resume.pdf" };

describe("classifyField", () => {
  it("classifies by label text", () => {
    expect(classifyField(field({ label: "Email" }))?.key).toBe("contact.email");
  });
  it("classifies by placeholder", () => {
    expect(classifyField(field({ placeholder: "Phone number" }))?.key).toBe("contact.phone");
  });
  it("classifies by name attr", () => {
    expect(classifyField(field({ name: "last_name", label: undefined }))?.key).toBe("personal.lastName");
  });
});

describe("detectDoNotFill / detectSensitive", () => {
  it("flags passwords and OTPs", () => {
    expect(detectDoNotFill(field({ label: "Password" }))).toBe(true);
    expect(detectDoNotFill(field({ label: "Enter OTP" }))).toBe(true);
  });
  it("flags sensitive identifiers", () => {
    expect(detectSensitive(field({ label: "CNIC number" }))).toBe(true);
    expect(detectSensitive(field({ label: "Passport number" }))).toBe(true);
  });
  it("does not flag normal fields", () => {
    expect(detectDoNotFill(field({ label: "Email" }))).toBe(false);
    expect(detectSensitive(field({ label: "Email" }))).toBe(false);
  });
});

describe("getContext", () => {
  it("detects education vs employment sections", () => {
    expect(getContext(field({ section: "Education" }))).toBe("education");
    expect(getContext(field({ section: "Employment" }))).toBe("employment");
    expect(getContext(field({ section: "Personal" }))).toBe("none");
  });
});

describe("decideLocally", () => {
  it("DO_NOT_FILL wins over everything", () => {
    const out = decideLocally(field({ label: "Password", fieldType: "password" }), emptyProfile());
    expect(out.outcome).toBe("DO_NOT_FILL");
  });

  it("never auto-fills sensitive fields", () => {
    const profile: Profile = {
      version: 1,
      facts: [
        {
          key: "id.passport",
          value: "AB123456",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [],
    };
    const out = decideLocally(field({ label: "Passport number" }), profile);
    expect(out.outcome).toBe("SENSITIVE");
  });

  it("exact match from profile", () => {
    const profile: Profile = {
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
      ],
      conflicts: [],
    };
    const out = decideLocally(field({ label: "Email address" }), profile);
    expect(out.outcome).toBe("EXACT");
    if (out.outcome === "EXACT") {
      expect(out.value).toBe("ali@example.com");
      expect(out.sources).toHaveLength(1);
    }
  });

  it("derives full name from first + last", () => {
    const profile: Profile = {
      version: 1,
      facts: [
        {
          key: "personal.firstName",
          value: "Ali",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
        {
          key: "personal.lastName",
          value: "Khan",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [],
    };
    const out = decideLocally(field({ label: "Full name" }), profile);
    expect(out.outcome).toBe("DERIVED");
    if (out.outcome === "DERIVED") expect(out.value).toBe("Ali Khan");
  });

  it("surfaces conflicts instead of picking", () => {
    const profile: Profile = {
      version: 1,
      facts: [
        {
          key: "contact.phone",
          value: "+92 300 1234567",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
        {
          key: "contact.phone",
          value: "+1 555 0100",
          sources: [{ documentId: "doc-2", documentName: "app.pdf" }],
          confidence: "medium",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [
        {
          key: "contact.phone",
          values: [
            { value: "+92 300 1234567", documentId: "doc-1" },
            { value: "+1 555 0100", documentId: "doc-2" },
          ],
          status: "OPEN",
        },
      ],
    };
    const out = decideLocally(field({ label: "Phone" }), profile);
    expect(out.outcome).toBe("CONFLICT");
    if (out.outcome === "CONFLICT") expect(out.options).toHaveLength(2);
  });

  it("resolved conflict returns the chosen value", () => {
    const profile: Profile = {
      version: 1,
      facts: [
        {
          key: "contact.phone",
          value: "+92 300 1234567",
          sources: [src],
          confidence: "high",
          userConfirmed: true,
          addedAt: 1,
          updatedAt: 1,
        },
        {
          key: "contact.phone",
          value: "+1 555 0100",
          sources: [{ documentId: "doc-2" }],
          confidence: "medium",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [
        {
          key: "contact.phone",
          values: [
            { value: "+92 300 1234567", documentId: "doc-1" },
            { value: "+1 555 0100", documentId: "doc-2" },
          ],
          status: "RESOLVED",
          resolvedValue: "+92 300 1234567",
        },
      ],
    };
    const out = decideLocally(field({ label: "Phone" }), profile);
    expect(out.outcome).toBe("EXACT");
    if (out.outcome === "EXACT") expect(out.value).toBe("+92 300 1234567");
  });

  it("needs AI for known key with no data", () => {
    const out = decideLocally(field({ label: "Address" }), emptyProfile());
    expect(out.outcome).toBe("NEEDS_AI");
    if (out.outcome === "NEEDS_AI") expect(out.key).toBe("address.street");
  });

  it("file fields suggest document types", () => {
    const out = decideLocally(field({ label: "Upload CV", fieldType: "file" }), emptyProfile());
    expect(out.outcome).toBe("FILE");
    if (out.outcome === "FILE") {
      expect(out.docTypes.length).toBeGreaterThan(0);
      expect(out.docTypes).toContain("RESUME");
    }
  });

  it("unknown for junk labels", () => {
    const out = decideLocally(field({ label: "zzzz qqqqq" }), emptyProfile());
    expect(out.outcome).toBe("UNKNOWN");
  });
});

describe("factsForContext", () => {
  it("caps and maps facts", () => {
    const profile: Profile = {
      version: 1,
      facts: [
        {
          key: "skill.list",
          value: "React",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
        {
          key: "skill.list",
          value: "Node.js",
          sources: [src],
          confidence: "high",
          addedAt: 1,
          updatedAt: 1,
        },
      ],
      conflicts: [],
    };
    const ctx = factsForContext(profile, "skill.list", 1);
    expect(ctx).toHaveLength(1);
    expect(ctx[0]?.value).toBe("React");
  });
});