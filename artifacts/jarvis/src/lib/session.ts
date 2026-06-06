const KEY = "jarvis-session-id";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = generateId(); localStorage.setItem(KEY, id); }
    return id;
  } catch {
    return "anonymous";
  }
}
