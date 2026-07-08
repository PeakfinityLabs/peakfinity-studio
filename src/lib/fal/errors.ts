import "server-only";

/**
 * Extracts a human-readable message from @fal-ai/client errors. Validation
 * failures (HTTP 422) carry a `body.detail` array of { msg } entries.
 */
export function falErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "body" in error) {
    const body = (error as { body?: { detail?: Array<{ msg?: string }> | string } }).body;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const messages = [...new Set(detail.map((d) => d?.msg).filter(Boolean))];
      if (messages.length > 0) return messages.join("; ");
    }
  }
  return error instanceof Error ? error.message : "Generation failed";
}

export function isFalValidationError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: number }).status === 422
  );
}
