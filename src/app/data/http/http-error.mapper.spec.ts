import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';

import { AppErrorKind, CheckoutFieldKey } from '../../domain';
import { ApiErrorDto, isTransient, mapHttpError } from './http-error.mapper';

function response(init: {
  status: number;
  body?: ApiErrorDto | string | null;
  headers?: Record<string, string>;
}): HttpErrorResponse {
  return new HttpErrorResponse({
    status: init.status,
    statusText: 'Error',
    error: init.body ?? null,
    url: 'https://api.example/api/v1/orders',
    headers: new HttpHeaders(init.headers ?? {}),
  });
}

/**
 * Every status the contract can return has to become exactly one AppError kind,
 * with a Hebrew message a customer can act on and no leaked internals.
 */
describe('HTTP error mapping', () => {
  it('maps 400 to a validation error', () => {
    expect(mapHttpError(response({ status: 400 })).kind).toBe(AppErrorKind.Validation);
  });

  it('maps 422 to a validation error and keeps the field errors', () => {
    const error = mapHttpError(response({
      status: 422,
      body: {
        fieldErrors: [{ field: CheckoutFieldKey.Email, message: { he: 'אימייל אינו תקין' } }],
      },
    }));
    expect(error.kind).toBe(AppErrorKind.Validation);
    expect(error.fieldErrors.length).toBe(1);
    expect(error.fieldErrors[0].field).toBe(CheckoutFieldKey.Email);
  });

  it('drops a field error that has no message rather than rendering an empty one', () => {
    const error = mapHttpError(response({
      status: 422,
      body: { fieldErrors: [{ field: 'EMAIL' }, { message: { he: 'בלי שדה' } }] },
    }));
    expect(error.fieldErrors).toEqual([]);
  });

  it('maps 401 to unauthorized', () => {
    expect(mapHttpError(response({ status: 401 })).kind).toBe(AppErrorKind.Unauthorized);
  });

  it('maps 403 to forbidden', () => {
    expect(mapHttpError(response({ status: 403 })).kind).toBe(AppErrorKind.Forbidden);
  });

  it('maps 404 to not found', () => {
    expect(mapHttpError(response({ status: 404 })).kind).toBe(AppErrorKind.NotFound);
  });

  it('maps 409 to conflict', () => {
    expect(mapHttpError(response({ status: 409 })).kind).toBe(AppErrorKind.Conflict);
  });

  it('maps 402 to a payment error', () => {
    expect(mapHttpError(response({ status: 402 })).kind).toBe(AppErrorKind.Payment);
  });

  it('maps 429 to rate limited and reads Retry-After seconds', () => {
    const error = mapHttpError(response({ status: 429, headers: { 'Retry-After': '30' } }));
    expect(error.kind).toBe(AppErrorKind.RateLimited);
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.userMessage.he).toContain('30');
  });

  it('reads Retry-After given as an HTTP date', () => {
    const future = new Date(Date.now() + 45_000).toUTCString();
    const error = mapHttpError(response({ status: 503, headers: { 'Retry-After': future } }));
    expect(error.retryAfterSeconds).toBeGreaterThan(30);
  });

  it('maps 500, 502, 503 and 504 to server errors that are retryable', () => {
    for (const status of [500, 502, 503, 504]) {
      const error = mapHttpError(response({ status }));
      expect(error.kind).withContext(String(status)).toBe(AppErrorKind.Server);
      expect(error.retryable).withContext(String(status)).toBeTrue();
    }
  });

  it('maps status 0 to a network error', () => {
    const error = mapHttpError(response({ status: 0 }));
    expect(error.kind).toBe(AppErrorKind.Network);
    expect(error.retryable).toBeTrue();
  });

  it('uses the server userMessage when one is supplied', () => {
    const error = mapHttpError(response({
      status: 409,
      body: { userMessage: { he: 'ההזמנה כבר שולמה.', en: 'This order is already paid.' } },
    }));
    expect(error.userMessage.he).toBe('ההזמנה כבר שולמה.');
    expect(error.userMessage.en).toBe('This order is already paid.');
  });

  it('never promotes a raw server message into customer-facing text', () => {
    const error = mapHttpError(response({
      status: 500,
      body: { message: 'NullPointerException at OrderService.java:412' },
    }));
    expect(error.userMessage.he).not.toContain('NullPointer');
    expect(error.technicalMessage).toContain('NullPointer');
  });

  it('never shows an HTML error page to the customer', () => {
    const error = mapHttpError(response({ status: 502, body: '<html><body>Bad Gateway</body></html>' }));
    expect(error.userMessage.he).not.toContain('html');
    expect(error.kind).toBe(AppErrorKind.Server);
  });

  it('keeps the correlation id for support, from the body or the header', () => {
    expect(mapHttpError(response({ status: 500, body: { correlationId: 'req_abc' } })).correlationId)
      .toBe('req_abc');
    expect(mapHttpError(response({ status: 500, headers: { 'X-Request-Id': 'req_xyz' } })).correlationId)
      .toBe('req_xyz');
  });

  it('keeps the machine-readable code for the UI to branch on', () => {
    expect(mapHttpError(response({ status: 409, body: { code: 'ORDER_ALREADY_PAID' } })).code)
      .toBe('ORDER_ALREADY_PAID');
  });

  it('gives every mapped error a non-empty Hebrew message', () => {
    for (const status of [0, 400, 401, 402, 403, 404, 409, 422, 429, 500, 502, 503, 504, 418]) {
      const error = mapHttpError(response({ status }));
      expect(error.userMessage.he.length).withContext(String(status)).toBeGreaterThan(5);
    }
  });

  it('classifies an unrecognised 4xx as a generic API error', () => {
    expect(mapHttpError(response({ status: 418 })).kind).toBe(AppErrorKind.Api);
  });

  it('classifies an unrecognised 5xx as a server error', () => {
    expect(mapHttpError(response({ status: 599 })).kind).toBe(AppErrorKind.Server);
  });

  it('handles something that is not an HttpErrorResponse at all', () => {
    expect(mapHttpError(new Error('boom')).kind).toBe(AppErrorKind.Api);
    expect(mapHttpError('a string').kind).toBe(AppErrorKind.Api);
  });

  it('marks only network, server and rate-limit failures as worth retrying blindly', () => {
    expect(isTransient(mapHttpError(response({ status: 0 })))).toBeTrue();
    expect(isTransient(mapHttpError(response({ status: 503 })))).toBeTrue();
    expect(isTransient(mapHttpError(response({ status: 429 })))).toBeTrue();
    expect(isTransient(mapHttpError(response({ status: 422 })))).toBeFalse();
    expect(isTransient(mapHttpError(response({ status: 409 })))).toBeFalse();
    expect(isTransient(mapHttpError(response({ status: 402 })))).toBeFalse();
  });
});

/**
 * The account screens depend on a wrong password reading as a wrong password.
 * The server normally words it; when only the code arrives, the client does.
 */
describe('HTTP error mapping: account codes', () => {
  it('words a wrong password as such when the server sends only the code', () => {
    const error = mapHttpError(response({ status: 401, body: { code: 'INVALID_CREDENTIALS' } }));
    expect(error.kind).toBe(AppErrorKind.Unauthorized);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.userMessage.he).toBe('האימייל או הסיסמה שגויים.');
  });

  it('lets the server\'s own wording win over the client fallback', () => {
    const error = mapHttpError(response({
      status: 401,
      body: { code: 'INVALID_CREDENTIALS', userMessage: { he: 'ניסוח מהשרת', en: 'From the server' } },
    }));
    expect(error.userMessage.he).toBe('ניסוח מהשרת');
  });

  it('keeps the generic session message for an unknown 401 code', () => {
    const error = mapHttpError(response({ status: 401, body: { code: 'SOMETHING_ELSE' } }));
    expect(error.userMessage.he).toContain('היכנסו שוב');
  });

  it('words a weak password and an unusable reset link', () => {
    expect(mapHttpError(response({ status: 422, body: { code: 'WEAK_PASSWORD' } })).userMessage.he).toContain('8 תווים');
    expect(mapHttpError(response({ status: 401, body: { code: 'RESET_TOKEN_INVALID' } })).userMessage.he).toContain('קישור');
  });
});
