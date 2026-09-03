/**
 * The API error contract.
 *
 * This is the server half of a two-sided agreement. The client half lives in
 * `src/app/data/http/http-error.mapper.ts` and is covered by 24 unit tests
 * there. If the shape below changes, that mapper must change with it — which is
 * why `docs/API-CONTRACT.md` §2 is the shared reference rather than either
 * implementation.
 *
 * Two rules govern everything here:
 *
 * 1. `message` is for logs and is written in English. It may name internal
 *    detail. It is NEVER rendered to a customer.
 * 2. `userMessage` is the only field a customer ever sees. It is Hebrew-first
 *    and must never contain a stack trace, SQL fragment, provider response or
 *    hostname.
 */

/** Mirrors `AppErrorKind` in the frontend domain. */
export enum ApiErrorKind {
  Api = 'API',
  Validation = 'VALIDATION',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',
  NotFound = 'NOT_FOUND',
  Conflict = 'CONFLICT',
  RateLimited = 'RATE_LIMITED',
  Payment = 'PAYMENT',
  Fulfillment = 'FULFILLMENT',
  Server = 'SERVER',
}

export interface LocalizedText {
  readonly he: string;
  readonly en?: string;
}

export interface ApiFieldError {
  readonly field: string;
  readonly message: LocalizedText;
}

/** The JSON body of every non-2xx response. */
export interface ApiErrorBody {
  readonly kind: ApiErrorKind;
  readonly code: string;
  readonly message: string;
  readonly userMessage: LocalizedText;
  readonly fieldErrors?: readonly ApiFieldError[];
  readonly retryable: boolean;
  readonly correlationId?: string;
}

export interface ApiErrorInit {
  readonly kind: ApiErrorKind;
  readonly status: number;
  /** Stable machine-readable code. The UI may branch on it; never repurpose one. */
  readonly code: string;
  /** English, for logs. Never shown to a customer. */
  readonly message: string;
  readonly userMessage: LocalizedText;
  readonly fieldErrors?: readonly ApiFieldError[];
  readonly retryable?: boolean;
  /** Seconds; emitted as a `Retry-After` header on 429 and 503. */
  readonly retryAfterSeconds?: number;
}

/**
 * The only error type the transport layer serialises.
 *
 * Anything else that escapes a service is caught by the exception filter and
 * turned into a generic 500 whose `userMessage` says nothing internal.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: string;
  readonly userMessage: LocalizedText;
  readonly fieldErrors: readonly ApiFieldError[];
  readonly retryable: boolean;
  readonly retryAfterSeconds?: number;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.userMessage = init.userMessage;
    this.fieldErrors = init.fieldErrors ?? [];
    this.retryable = init.retryable ?? false;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  toBody(correlationId?: string): ApiErrorBody {
    return {
      kind: this.kind,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      ...(this.fieldErrors.length > 0 ? { fieldErrors: this.fieldErrors } : {}),
      retryable: this.retryable,
      ...(correlationId ? { correlationId } : {}),
    };
  }
}

const text = (he: string, en: string): LocalizedText => ({ he, en });

// ---------------------------------------------------------------------------
// Factories
//
// Every factory supplies a Hebrew message a customer can act on. Call sites pass
// the technical detail as `message`, which stays in the logs.
// ---------------------------------------------------------------------------

export const validationError = (
  message: string,
  fieldErrors: readonly ApiFieldError[] = [],
  code = 'VALIDATION_FAILED',
): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Validation,
    status: 422,
    code,
    message,
    userMessage: text(
      'חלק מהפרטים אינם תקינים. בדקו את השדות המסומנים.',
      'Some details are invalid. Please check the highlighted fields.',
    ),
    fieldErrors,
  });

export const badRequestError = (message: string, code = 'BAD_REQUEST'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Validation,
    status: 400,
    code,
    message,
    userMessage: text(
      'הבקשה אינה תקינה. רעננו את הדף ונסו שוב.',
      'That request was not valid. Refresh the page and try again.',
    ),
  });

export const unauthorizedError = (message: string, code = 'UNAUTHENTICATED'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Unauthorized,
    status: 401,
    code,
    message,
    userMessage: text(
      'החיבור פג. היכנסו שוב כדי להמשיך.',
      'Your session has expired. Please sign in again to continue.',
    ),
  });

/**
 * A sign-in that did not match. One message for an unknown address, an account
 * with no password and a wrong password, so the response cannot be used to
 * learn which addresses exist; and worded as what happened, not as an expired
 * session, which is what the generic 401 text would have told the customer.
 */
export const invalidCredentialsError = (): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Unauthorized,
    status: 401,
    code: 'INVALID_CREDENTIALS',
    message: 'Email or password is incorrect',
    userMessage: text(
      'האימייל או הסיסמה שגויים.',
      'Email or password is incorrect.',
    ),
  });

export const accountInactiveError = (): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Unauthorized,
    status: 401,
    code: 'ACCOUNT_INACTIVE',
    message: 'This account is not active',
    userMessage: text(
      'החשבון הזה אינו פעיל. פנו לתמיכה.',
      'This account is not active. Please contact support.',
    ),
  });

export const forbiddenError = (message: string, code = 'FORBIDDEN'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Forbidden,
    status: 403,
    code,
    message,
    userMessage: text(
      'אין לכם הרשאה לפעולה הזו.',
      'You do not have permission to do that.',
    ),
  });

export const notFoundError = (message: string, code = 'NOT_FOUND'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.NotFound,
    status: 404,
    code,
    message,
    userMessage: text('הפריט המבוקש לא נמצא.', 'We could not find what you were looking for.'),
  });

export const conflictError = (
  message: string,
  code: string,
  userMessage?: LocalizedText,
): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Conflict,
    status: 409,
    code,
    message,
    userMessage:
      userMessage ??
      text(
        'משהו השתנה מאז שהתחלתם. רעננו את הדף ונסו שוב.',
        'Something changed since you started. Refresh the page and try again.',
      ),
  });

export const rateLimitedError = (message: string, retryAfterSeconds: number): ApiError =>
  new ApiError({
    kind: ApiErrorKind.RateLimited,
    status: 429,
    code: 'RATE_LIMITED',
    message,
    userMessage: text(
      `יותר מדי ניסיונות. אפשר לנסות שוב בעוד ${retryAfterSeconds} שניות.`,
      `Too many attempts. You can try again in ${retryAfterSeconds} seconds.`,
    ),
    retryable: true,
    retryAfterSeconds,
  });

export const paymentError = (
  message: string,
  code: string,
  userMessage?: LocalizedText,
): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Payment,
    status: 402,
    code,
    message,
    userMessage:
      userMessage ??
      text(
        'התשלום לא הושלם ולא בוצע חיוב. אפשר לנסות שוב או לבחור אמצעי תשלום אחר.',
        'The payment did not complete and you were not charged. Try again or use another method.',
      ),
    retryable: true,
  });

export const fulfillmentError = (message: string, code = 'FULFILLMENT_FAILED'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Fulfillment,
    status: 409,
    code,
    message,
    userMessage: text(
      'הייתה תקלה באספקת ההזמנה. צוות התמיכה שלנו כבר מטפל בכך.',
      'There was a problem delivering your order. Our support team is on it.',
    ),
  });

/**
 * The catch-all. Its `userMessage` is deliberately uninformative: an unexpected
 * failure must not tell a stranger anything about our internals.
 */
export const serverError = (message: string, code = 'INTERNAL_ERROR'): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Server,
    status: 500,
    code,
    message,
    userMessage: text(
      'השירות אינו זמין כרגע. אנחנו מטפלים בזה, נסו שוב בעוד רגע.',
      'The service is unavailable right now. We are on it, please try again shortly.',
    ),
    retryable: true,
  });

export const serviceUnavailableError = (
  message: string,
  retryAfterSeconds = 30,
  code = 'SERVICE_UNAVAILABLE',
): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Server,
    status: 503,
    code,
    message,
    userMessage: text(
      'השירות אינו זמין כרגע. נסו שוב בעוד רגע.',
      'The service is unavailable right now. Please try again shortly.',
    ),
    retryable: true,
    retryAfterSeconds,
  });

/**
 * 413. Express body-parser rejects the request before any handler runs, so this
 * is produced by the exception filter rather than by a service.
 */
export const payloadTooLargeError = (message: string): ApiError =>
  new ApiError({
    kind: ApiErrorKind.Api,
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message,
    userMessage: text(
      'הבקשה גדולה מדי.',
      'That request is too large.',
    ),
  });

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
