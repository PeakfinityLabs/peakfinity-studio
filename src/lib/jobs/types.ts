// Shape of Job.input: the exact fal endpoint used at submit time plus the
// parameters sent. queue.status/result/cancel must be called with the same
// endpoint id, so it is persisted rather than re-derived.
export type JobInput = {
  endpoint: string;
  params: Record<string, unknown>;
};

export function parseJobInput(input: unknown): JobInput {
  if (
    input &&
    typeof input === "object" &&
    "endpoint" in input &&
    typeof (input as { endpoint: unknown }).endpoint === "string"
  ) {
    const record = input as { endpoint: string; params?: unknown };
    return {
      endpoint: record.endpoint,
      params:
        record.params && typeof record.params === "object"
          ? (record.params as Record<string, unknown>)
          : {},
    };
  }
  throw new Error("Job.input is missing its fal endpoint");
}
