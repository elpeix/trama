export const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && target.type !== "range") ||
  (target instanceof HTMLElement && target.isContentEditable);
