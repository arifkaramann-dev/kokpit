/** HTTP-aware error with a status code, shared by client and server. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Factory-style helpers so call sites can `throw ForbiddenError("...")`. */
export const ForbiddenError = (message = "Forbidden") => new HttpError(403, message);
export const UnauthorizedError = (message = "Unauthorized") => new HttpError(401, message);
export const NotFoundError = (message = "Not Found") => new HttpError(404, message);
export const BadRequestError = (message = "Bad Request") => new HttpError(400, message);
