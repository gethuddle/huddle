export type StoredFormDraft<Extra = unknown> = Readonly<{
  values: Readonly<Record<string, string>>;
  checked: Readonly<Record<string, boolean>>;
  extra: Extra;
}>;

const ONBOARDING_SESSION_DRAFT_PREFIX = "huddle:onboarding:";

export function onboardingSessionDraftKey(kind: "fan" | "venue", ownerId: string): string {
  return `${ONBOARDING_SESSION_DRAFT_PREFIX}${ownerId}:${kind}:v1`;
}

export function clearOnboardingSessionDrafts() {
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.startsWith(ONBOARDING_SESSION_DRAFT_PREFIX)) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // A blocked client store must never prevent a successful sign-out.
  }
}

function checkKey(element: Readonly<{ name: string; value: string; id: string }>) {
  return element.id !== "" ? `#${element.id}` : `${element.name}:${element.value}`;
}

export function captureFormDraft<Extra>(
  form: HTMLFormElement,
  extra: Extra,
): StoredFormDraft<Extra> {
  const values: Record<string, string> = {};
  const checked: Record<string, boolean> = {};
  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLButtonElement)
    ) {
      continue;
    }
    if (element instanceof HTMLButtonElement && element.getAttribute("role") === "checkbox") {
      checked[checkKey(element)] = element.getAttribute("aria-checked") === "true";
    } else if (element.name === "") {
      continue;
    } else if (element instanceof HTMLInputElement && element.type === "checkbox") {
      checked[checkKey(element)] = element.checked;
    } else if (element instanceof HTMLInputElement && element.type === "radio") {
      if (element.checked) values[element.name] = element.value;
    } else {
      values[element.name] = element.value;
    }
  }
  return { values, checked, extra };
}

export function restoreFormDraft(
  form: HTMLFormElement,
  draft: StoredFormDraft,
  options: Readonly<{ restoreChecked?: boolean }> = {},
) {
  const restoreChecked = options.restoreChecked ?? true;
  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLSelectElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLButtonElement)
    ) {
      continue;
    }
    if (
      restoreChecked &&
      element instanceof HTMLButtonElement &&
      element.getAttribute("role") === "checkbox"
    ) {
      const expected = draft.checked[checkKey(element)] ?? false;
      const current = element.getAttribute("aria-checked") === "true";
      if (current !== expected) element.click();
    } else if (element.name === "") {
      continue;
    } else if (
      restoreChecked &&
      element instanceof HTMLInputElement &&
      element.type === "checkbox"
    ) {
      element.checked = draft.checked[checkKey(element)] ?? false;
    } else if (element instanceof HTMLInputElement && element.type === "radio") {
      element.checked = draft.values[element.name] === element.value;
    } else if (draft.values[element.name] !== undefined) {
      element.value = draft.values[element.name];
    }
  }
}

export function readSessionFormDraft<Extra>(key: string): StoredFormDraft<Extra> | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFormDraft<Extra>>;
    if (typeof parsed.values !== "object" || parsed.values === null) return null;
    if (typeof parsed.checked !== "object" || parsed.checked === null) return null;
    return parsed as StoredFormDraft<Extra>;
  } catch {
    return null;
  }
}

export function writeSessionFormDraft<Extra>(key: string, form: HTMLFormElement, extra: Extra) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(captureFormDraft(form, extra)));
  } catch {
    // A blocked or full session store must never prevent onboarding.
  }
}

export function clearSessionFormDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // The server mutation remains authoritative when local storage is unavailable.
  }
}
