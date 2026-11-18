export type SafeHttpErrorPayload = {
  error: string;
  code: string;
};

export function internalServerErrorPayload(): SafeHttpErrorPayload {
  return {
    error: "Internal server error.",
    code: "INTERNAL_SERVER_ERROR",
  };
}

export function requestRejectedPayload(): SafeHttpErrorPayload {
  return {
    error: "Request could not be completed.",
    code: "REQUEST_REJECTED",
  };
}
