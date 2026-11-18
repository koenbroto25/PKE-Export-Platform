import { describe, expect, it } from "vitest";
import { internalServerErrorPayload, requestRejectedPayload } from "./http-errors.js";

describe("safe HTTP error payloads", () => {
  it("does not expose internal server error details", () => {
    expect(internalServerErrorPayload()).toEqual({
      error: "Internal server error.",
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("uses a generic message for rejected client requests", () => {
    expect(requestRejectedPayload()).toEqual({
      error: "Request could not be completed.",
      code: "REQUEST_REJECTED",
    });
  });
});
