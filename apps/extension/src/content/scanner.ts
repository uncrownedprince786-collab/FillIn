import type {
  DetectedField,
  FieldOption,
  FieldSnapshot,
  FieldType} from "@fillin/schemas";
import {
  DetectedFieldSchema,
} from "@fillin/schemas";

export interface ScanOptions {
  /** scan the whole document (true) or only forms (false) */
  wholeDocument?: boolean;
}

const elementIds = new WeakMap<Element, string>();
let idCounter = 0;

export function elementIdFor(el: Element): string {
  let id = elementIds.get(el);
  if (!id) {
    id = `f${++idCounter}`;
    elementIds.set(el, id);
  }
  return id;
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = (el as HTMLElement).getBoundingClientRect?.();
  if (rect && (rect.width === 0 || rect.height === 0)) return false;
  return true;
}

function labelFor(el: Element): string {
  const htmlEl = el as HTMLElement;
  // 1. <label for>
  if (htmlEl.id) {
    const labels = Array.from(document.querySelectorAll(`label[for="${CSS.escape(htmlEl.id)}"]`));
    const text = labels.map((l) => l.textContent?.trim() ?? "").join(" ").trim();
    if (text) return text;
  }
  // 2. wrapped in label
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const text = parentLabel.textContent?.trim();
    if (text) return text;
  }
  // 3. aria-label
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  // 4. aria-labelledby
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const refs = labelledby
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .join(" ");
    if (refs) return refs;
  }
  // 5. fieldset legend (for radios/checkboxes inside a fieldset)
  const fieldset = el.closest("fieldset");
  if (fieldset) {
    const legend = fieldset.querySelector("legend");
    if (legend?.textContent?.trim()) return legend.textContent.trim();
  }
  // 6. name/id derived
  const name = (el as HTMLInputElement).name;
  if (name) return name.replace(/[_-]+/g, " ").trim();
  if (htmlEl.id) return htmlEl.id.replace(/[_-]+/g, " ").trim();
  return "";
}

function sectionFor(el: Element): string {
  // nearest heading above the element
  const node: Element | null = el;
  const up = (start: Element | null, maxDepth: number): string => {
    let cur = start;
    for (let i = 0; cur && i < maxDepth; i++) {
      cur = cur.parentElement;
      if (!cur) break;
      {
        const heading = Array.from(cur.querySelectorAll("h1,h2,h3,h4,h5,h6"))
          .map((h) => h.textContent?.trim() ?? "")
          .filter(Boolean);
        if (heading.length) return heading[0]!;
      }
      const legend = cur.querySelector("legend");
      if (legend?.textContent?.trim()) return legend.textContent.trim();
      if (cur.tagName === "FORM") break;
    }
    return "";
  };
  return up(node, 4);
}

function nearbyQuestionText(el: Element): string {
  // Look for a paragraph/list item or a label-ish sibling with text.
  const parent = el.parentElement;
  if (!parent) return "";
  const candidates = Array.from(parent.querySelectorAll("p, li, .question, [class*=question]"))
    .map((n) => n.textContent?.trim() ?? "")
    .filter(Boolean);
  if (candidates.length) return candidates.join(" ").slice(0, 600);
  return parent.textContent?.trim().slice(0, 600) ?? "";
}

function optionsFor(el: Element): FieldOption[] | undefined {
  if (el.tagName === "SELECT") {
    const select = el as HTMLSelectElement;
    return Array.from(select.options).map((o) => ({ value: o.value, label: o.text }));
  }
  if ((el as HTMLInputElement).type === "radio" || (el as HTMLInputElement).type === "checkbox") {
    const name = (el as HTMLInputElement).name;
    if (name) {
      const group = Array.from(
        document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`)
      );
      return group.map((i) => ({ value: i.value, label: labelFor(i) || i.value }));
    }
  }
  return undefined;
}

function hasValue(el: Element): boolean {
  if (el.tagName === "SELECT") return (el as HTMLSelectElement).selectedIndex >= 0;
  const input = el as HTMLInputElement;
  if (input.type === "radio" || input.type === "checkbox") return input.checked;
  if (input.type === "file") return (input.files?.length ?? 0) > 0;
  return input.value.trim().length > 0;
}

function fieldTypeOf(el: Element): FieldType {
  if (el.tagName === "TEXTAREA") return "textarea";
  if (el.tagName === "SELECT") return "select";
  const type = (el as HTMLInputElement).type;
  switch (type) {
    case "email": return "email";
    case "tel": return "tel";
    case "number": return "number";
    case "password": return "password";
    case "url": return "url";
    case "date": return "date";
    case "file": return "file";
    case "checkbox": return "checkbox";
    case "radio": return "radio";
    case "hidden": return "hidden";
    default: return "text";
  }
}

function detectNativeField(el: Element): DetectedField | null {
  const input = el as HTMLInputElement;
  const type = input.type ?? "";
  if (el.tagName === "INPUT" && (type === "hidden" || type === "submit" || type === "button" || type === "reset" || type === "image")) {
    return null;
  }
  if (!isVisible(el)) return null;

  const label = labelFor(el);
  const field: DetectedField = {
    id: elementIdFor(el),
    kind: el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : "input",
    fieldType: fieldTypeOf(el),
    name: input.name || undefined,
    htmlId: el.id || undefined,
    label: label || undefined,
    placeholder: (el as HTMLInputElement).placeholder || undefined,
    ariaLabel: el.getAttribute("aria-label") || undefined,
    section: sectionFor(el) || undefined,
    questionText: nearbyQuestionText(el) || undefined,
    required: (el as HTMLInputElement).required || el.hasAttribute("aria-required") || false,
    hasValue: hasValue(el),
    visible: true,
    options: optionsFor(el),
    accept: (el as HTMLInputElement).accept || undefined,
    debug: `${el.tagName.toLowerCase()}[type=${input.type ?? ""}]`,
  };
  return DetectedFieldSchema.parse(field);
}

function detectCustomControl(el: Element): DetectedField | null {
  const isContentEditable = el.getAttribute("contenteditable") === "true";
  const role = el.getAttribute("role");
  const looksLikeControl =
    isContentEditable ||
    role === "textbox" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "combobox" ||
    el.hasAttribute("data-input");
  if (!looksLikeControl || !isVisible(el)) return null;

  const label = labelFor(el);
  const field: DetectedField = {
    id: elementIdFor(el),
    kind: "custom",
    fieldType: role === "checkbox" || role === "radio" ? (role === "checkbox" ? "checkbox" : "radio") : "text",
    label: label || undefined,
    ariaLabel: el.getAttribute("aria-label") || undefined,
    section: sectionFor(el) || undefined,
    questionText: nearbyQuestionText(el) || undefined,
    required: el.hasAttribute("aria-required") || false,
    hasValue: isContentEditable ? (el.textContent?.trim().length ?? 0) > 0 : el.hasAttribute("aria-checked") ? el.getAttribute("aria-checked") === "true" : false,
    visible: true,
    debug: `${el.tagName.toLowerCase()}[role=${role ?? "contenteditable"}]`,
  };
  return DetectedFieldSchema.parse(field);
}

function collectCandidates(root: ParentNode): Element[] {
  const natives = Array.from(
    root.querySelectorAll<Element>("input, textarea, select")
  );
  const customs = Array.from(
    root.querySelectorAll<Element>(
      '[contenteditable="true"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="radio"], [data-input]'
    )
  );
  // de-duplicate (a native control may also match a role selector)
  const seen = new Set<Element>();
  const out: Element[] = [];
  for (const el of [...natives, ...customs]) {
    if (!seen.has(el)) {
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

export function scanDocument(opts: ScanOptions = {}): FieldSnapshot {
  let roots: ParentNode[] = opts.wholeDocument
    ? [document]
    : Array.from(document.forms);
  const fields: DetectedField[] = [];
  for (const root of roots) {
    for (const el of collectCandidates(root)) {
      const detected =
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
          ? detectNativeField(el)
          : detectCustomControl(el);
      if (detected) fields.push(detected);
    }
  }
  if (fields.length === 0 && !opts.wholeDocument) {
    for (const el of collectCandidates(document)) {
      const detected =
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
          ? detectNativeField(el)
          : detectCustomControl(el);
      if (detected) fields.push(detected);
    }
  }
  return {
    url: location.href,
    title: document.title,
    scannedAt: Date.now(),
    fields,
  };
}