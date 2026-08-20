import type { DetectedField, FieldDecision } from "@fillin/schemas";
import type { FillInstruction } from "../../content/filler";
import type { FormPlan } from "./pipeline";

/**
 * Build the exact instructions for the content script. Fields the user already
 * typed into (preserved) are reported separately so the UI can ask
 * "Replace?" before forcing an overwrite.
 */
export function buildFillInstructions(
  plan: FormPlan,
  fields: DetectedField[]
): { instructions: FillInstruction[]; preserved: FieldDecision[] } {
  const instructions: FillInstruction[] = [];
  const preserved: FieldDecision[] = [];
  const fieldById = new Map(fields.map((f) => [f.id, f]));

  for (const decision of plan.decisions) {
    const fillable =
      decision.decision === "EXACT" ||
      decision.decision === "DERIVED" ||
      decision.decision === "GENERATED";
    if (!fillable || !decision.value) continue;

    const field = fieldById.get(decision.fieldId);
    if (!field) continue;

    if (decision.preserved) {
      preserved.push(decision);
      continue;
    }

    let instruction: FillInstruction | null = null;
    switch (field.kind) {
      case "select":
        instruction = { fieldId: decision.fieldId, kind: "select", value: decision.value };
        break;
      case "input":
        if (field.fieldType === "checkbox") {
          instruction = { fieldId: decision.fieldId, kind: "checkbox", checked: true };
        } else if (field.fieldType === "radio") {
          instruction = { fieldId: decision.fieldId, kind: "radio", checked: true, value: decision.value };
        } else if (field.fieldType === "file") {
          instruction = null; // handled separately with a chosen document
        } else {
          instruction = { fieldId: decision.fieldId, kind: "text", value: decision.value };
        }
        break;
      case "textarea":
        instruction = { fieldId: decision.fieldId, kind: "text", value: decision.value };
        break;
      case "custom":
        instruction = { fieldId: decision.fieldId, kind: "custom-text", value: decision.value };
        break;
    }
    if (instruction) instructions.push(instruction);
  }

  return { instructions, preserved };
}