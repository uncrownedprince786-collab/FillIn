import { elementIdFor } from "./scanner";

export interface FillInstruction {
  fieldId: string;
  kind: "text" | "select" | "radio" | "checkbox" | "file" | "custom-text";
  value?: string;
  checked?: boolean;
  /** overwrite even when the field already has a value */
  force?: boolean;
  /** for file fields */
  fileName?: string;
  mimeType?: string;
  data?: ArrayBuffer;
}

export interface FillReport {
  filled: number;
  skipped: number;
  errors: { fieldId: string; message: string }[];
}

const inputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set;
const textareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value"
)?.set;
const selectValueSetter = Object.getOwnPropertyDescriptor(
  HTMLSelectElement.prototype,
  "value"
)?.set;
const checkedSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "checked"
)?.set;

function dispatch(el: Element, event: string): void {
  el.dispatchEvent(new Event(event, { bubbles: true, cancelable: true }));
}

function shouldFill(el: Element, instruction: FillInstruction): boolean {
  if (instruction.force) return true;
  if (el.tagName === "SELECT") return (el as HTMLSelectElement).selectedIndex < 0;
  const input = el as HTMLInputElement;
  if (input.type === "radio" || input.type === "checkbox") return !input.checked;
  if (input.type === "file") return (input.files?.length ?? 0) === 0;
  return input.value.trim().length === 0;
}

function findElement(fieldId: string): Element | null {
  for (const el of document.querySelectorAll<Element>(
    'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [data-input]'
  )) {
    if (elementIdFor(el) === fieldId) return el;
  }
  return null;
}

export function fillFields(instructions: FillInstruction[]): FillReport {
  const report: FillReport = { filled: 0, skipped: 0, errors: [] };

  for (const instruction of instructions) {
    const el = findElement(instruction.fieldId);
    if (!el) {
      report.skipped += 1;
      report.errors.push({ fieldId: instruction.fieldId, message: "Element not found." });
      continue;
    }
    if (!shouldFill(el, instruction)) {
      report.skipped += 1;
      continue;
    }
    try {
      const ok = fillOne(el, instruction);
      if (ok) report.filled += 1;
      else report.skipped += 1;
    } catch (err) {
      report.skipped += 1;
      report.errors.push({
        fieldId: instruction.fieldId,
        message: err instanceof Error ? err.message : "Failed to fill.",
      });
    }
  }
  return report;
}

function fillOne(el: Element, instruction: FillInstruction): boolean {
  switch (instruction.kind) {
    case "text": {
      const el2 = el as HTMLInputElement;
      const setter =
        el.tagName === "TEXTAREA" ? textareaValueSetter : inputValueSetter;
      if (!setter) throw new Error("No value setter available.");
      setter.call(el2, instruction.value ?? "");
      dispatch(el, "input");
      dispatch(el, "change");
      return true;
    }
    case "custom-text": {
      el.textContent = instruction.value ?? "";
      dispatch(el, "input");
      return true;
    }
    case "select": {
      const select = el as HTMLSelectElement;
      const value = instruction.value ?? "";
      const options = Array.from(select.options);
      const byValue = options.find((o) => o.value === value);
      const byLabel = options.find(
        (o) => o.text.trim().toLowerCase() === value.trim().toLowerCase()
      );
      const option = byValue ?? byLabel;
      if (!option && value) throw new Error(`No matching option for "${value}".`);
      if (!selectValueSetter) throw new Error("No select setter available.");
      if (option) {
        selectValueSetter.call(select, option.value);
        dispatch(el, "change");
        dispatch(el, "input");
      }
      return !!option || !value;
    }
    case "radio":
    case "checkbox": {
      const input = el as HTMLInputElement;
      const wantChecked = instruction.checked ?? true;
      if (input.checked === wantChecked) return true;
      if (checkedSetter) {
        checkedSetter.call(input, wantChecked);
        dispatch(el, "change");
        dispatch(el, "input");
      } else {
        input.click();
      }
      return true;
    }
    case "file": {
      const input = el as HTMLInputElement;
      if (!instruction.data) throw new Error("No file data provided.");
      const file = new File([instruction.data], instruction.fileName ?? "document", {
        type: instruction.mimeType ?? "application/octet-stream",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      dispatch(el, "change");
      dispatch(el, "input");
      return true;
    }
    default:
      throw new Error(`Unsupported fill kind: ${instruction.kind}`);
  }
}