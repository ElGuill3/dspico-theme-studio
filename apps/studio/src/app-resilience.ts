export const LIFECYCLE_CHANNEL = "studio:lifecycle";
export const DRAFT_STATE_CHANNEL = "studio:draft-state";
export const CLOSE_DECISION_CHANNEL = "studio:close-decision";

export type LifecycleMessage = { type: "prepare-close" | "main-failure"; message?: string };
export type CloseDraftAcknowledgement = { status: "committing" | "clean" | "invalid" };

const ACTIONABLE =
  /project|media|png|wav|audio|export|folder|file|diagnostic|metadata|layer|theme|destination|permission|missing|corrupt|invalid|unsupported|cancel/i;
const ABSOLUTE_PATH =
  /file:\/\/[^\s"'<>]+|\\\\[?.]\\[a-z]:[\\/][^\s"'<>]+|\\\\[^\\/\s"'<>]+[\\/][^\s"'<>]+|[a-z]:[\\/][^\s"'<>]+|\/(?:[^\s/"'<>]+\/)*[^\s"'<>]*/gi;
const FALLBACK = "The app could not complete that action. Your committed project files were not changed.";

const errorText = (input: unknown): string => {
  const seen = new Set<object>();
  const values: string[] = [];
  const visit = (value: unknown, depth: number): void => {
    if (values.join(" ").length >= 2_048 || depth > 4) return;
    if (typeof value === "string") {
      values.push(value.slice(0, 1_024));
      return;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Error || (typeof DOMException !== "undefined" && value instanceof DOMException)) {
      values.push(value.message.slice(0, 1_024));
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 12)) visit(item, depth + 1);
      return;
    }
    let entries: [string, unknown][];
    try {
      entries = Object.entries(value as Record<string, unknown>);
    } catch {
      return;
    }
    for (const [key, item] of entries.slice(0, 12))
      if (!/^(?:stack|argv|env|environment|source|sourceCode)$/i.test(key)) visit(item, depth + 1);
  };
  visit(input, 0);
  return values.join(" ").slice(0, 2_048);
};

export const safeErrorMessage = (error: unknown): string => {
  const message = errorText(error)
    .replace(ABSOLUTE_PATH, "[local path]")
    .replace(/\b(?:argv|environment|process\.env|source code|stack trace)\b[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!message || !ACTIONABLE.test(message)) return FALLBACK;
  return message.slice(0, 360);
};

export const isCancellation = (error: unknown): boolean =>
  /cancelled|canceled|no (?:file|folder) selected/i.test(error instanceof Error ? error.message : String(error));

export class CrashFrequency {
  private failures: number[] = [];

  constructor(
    private readonly maximumOffers = 2,
    private readonly intervalMs = 60_000,
  ) {}

  record(now = Date.now()): boolean {
    this.failures = this.failures.filter((time) => now - time <= this.intervalMs);
    this.failures.push(now);
    return this.failures.length <= this.maximumOffers;
  }
}

export class DraftCloseHandshake {
  dirty = false;
  allowClose = false;
  phase: "idle" | "awaiting" | "committing" | "dialog" = "idle";

  update(dirty: boolean): void {
    this.dirty = dirty;
  }

  begin(): "close" | "prepare" | "wait" {
    if (this.allowClose || !this.dirty) return "close";
    if (this.phase !== "idle") return "wait";
    this.phase = "awaiting";
    return "prepare";
  }

  acknowledge(status: CloseDraftAcknowledgement["status"]): "close" | "confirm" | "wait" {
    if (status === "committing") {
      if (this.phase === "awaiting") this.phase = "committing";
      return "wait";
    }
    if (status === "clean") {
      this.phase = "idle";
      this.dirty = false;
      this.allowClose = true;
      return "close";
    }
    this.phase = "dialog";
    this.dirty = true;
    return "confirm";
  }

  noResponse(): "unresponsive" | "ignore" {
    if (this.phase !== "awaiting") return "ignore";
    this.phase = "dialog";
    return "unresponsive";
  }

  keepEditing(): void {
    this.phase = "idle";
  }

  discard(): void {
    this.phase = "idle";
    this.allowClose = true;
  }
}

export async function settleNativeAction<T>(
  action: Promise<T>,
  onSuccess: (value: T) => void | Promise<void>,
  onFailure: (error: unknown) => void | Promise<void>,
): Promise<void> {
  try {
    await onSuccess(await action);
  } catch (error) {
    try {
      await onFailure(error);
    } catch {
      // The failure path is terminal and must never create another unhandled rejection.
    }
  }
}
