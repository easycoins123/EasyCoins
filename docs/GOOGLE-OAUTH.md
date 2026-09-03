# Google sign-in

Everything in the code is finished. What is missing is a Google Cloud OAuth
client, which only the account owner can create. This document is the exact
list of what to click and what to paste.

Until the two secrets are set, the backend reports `google: false` from
`GET /api/v1/auth/methods`, the storefront hides the Google button, and
password sign-in continues to work. Nothing is broken by leaving this undone;
the button simply does not appear.

---

## 1. What the code already does

Written and covered by tests, so it does not need revisiting:

| Step | Behaviour |
| --- | --- |
| Start | `GET /api/v1/auth/google?returnTo=/account` builds the Google authorization URL |
| CSRF | A random 24-byte nonce is generated per attempt |
| State | `state` = `nonce.base64url(returnTo)`; only its SHA-256 hash is stored |
| Cookie | The hash goes in a cookie that is `httpOnly`, `sameSite=lax`, and `secure` outside development |
| Return | The callback compares hashes with `timingSafeEqual`, never `===` |
| Redirect safety | `returnTo` must start with a single `/`; `//evil.com` and absolute URLs are rejected |
| Code exchange | Authorization code is exchanged server-side, over TLS |
| Signature | The ID token is verified against Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`) |
| Issuer | Must be `accounts.google.com` or `https://accounts.google.com` |
| Audience | Must equal our `GOOGLE_CLIENT_ID` |
| Expiry | `exp` must be in the future |
| Email | Refused unless `email_verified` is `true` |
| Session | A fresh session is issued; the pre-login session is discarded |

The client secret is only ever read by the backend. It is never sent to the
browser and must never be placed in an Angular `environment.*.ts` file, because
everything in those files ships to every visitor.

---

## 2. Create the OAuth client

1. Open <https://console.cloud.google.com/apis/credentials>.
2. Select the project, or create one.
3. Configure the **OAuth consent screen** first, if it has not been done:
   - User type: **External**
   - App name: **EASYCOINS**
   - Support email and developer contact email: the owner's address
   - Scopes: `openid`, `email`, `profile` — nothing more is used
   - While the app is in **Testing**, only accounts listed under *Test users*
     can sign in. Press **Publish app** when it should work for real customers.
4. **Credentials → Create credentials → OAuth client ID**
5. Application type: **Web application**
6. Name it something recognisable, for example `EASYCOINS storefront`.

### Authorized JavaScript origins

The origin the storefront is served from. It is the site, not the API.

```
https://www.easycoins.co.il
```

For local work, add:

```
http://localhost:4200
```

### Authorized redirect URIs

This must match the backend callback **exactly**, including the scheme, the
`/api/v1` prefix and the absence of a trailing slash. Google compares it as a
literal string and rejects anything that differs by a character.

The route is `@Get('auth/google/callback')` under a global prefix of `api/v1`:

```
https://www.easycoins.co.il/api/v1/auth/google/callback
```

For local work, add:

```
http://localhost:3000/api/v1/auth/google/callback
```

> If the API is ever served from its own hostname, the redirect URI follows the
> **API**, not the storefront.

Press **Create**, then copy the client ID and client secret.

---

## 3. Set the environment variables

On the API project only (Vercel project `easy-coins`): *Settings → Environment
Variables*, then redeploy.

Both URLs below go through the **storefront** domain, not the API's own
hostname. The storefront rewrites `/api/*` to the API project, so the session
cookie the callback sets lands on `www.easycoins.co.il`, where the storefront
reads it. Pointing the callback at the API hostname would set the cookie on the
wrong site and every Google sign-in would land signed out.

```
GOOGLE_CLIENT_ID=<the client ID from Google>
GOOGLE_CLIENT_SECRET=<the client secret from Google>
GOOGLE_REDIRECT_URI=https://www.easycoins.co.il/api/v1/auth/google/callback
APP_BASE_URL=https://www.easycoins.co.il
```

Notes the config layer enforces:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set **together**.
  Setting one alone fails startup, on purpose, rather than half-enabling
  sign-in.
- In staging and production `GOOGLE_REDIRECT_URI` must be **https**. A plaintext
  redirect is refused.
- `GOOGLE_REDIRECT_URI` defaults to `http://localhost:3000/api/v1/auth/google/callback`,
  which is correct for development and wrong for anywhere else. Set it
  explicitly in production.
- `APP_BASE_URL` is where the customer is returned after the callback. Leaving
  it at its `http://localhost:4200` default in production sends customers to
  their own machine.

Restart the service. `GET /api/v1/auth/methods` should now return
`"google": true`, and the button appears on the account screen by itself.

---

## 4. Check it

1. Open `/account` on the storefront. **המשך עם Google** should be visible above
   the email field.
2. Press it. Google should show the consent screen with the name **EASYCOINS**.
3. Approve. You should land back on `/account`, signed in.
4. Sign out and sign in again. The second time should not ask for consent.

### When it fails

| Symptom | Cause |
| --- | --- |
| `redirect_uri_mismatch` | The redirect URI in Google does not match `GOOGLE_REDIRECT_URI` byte for byte. Check the scheme, the `/api/v1` prefix, and any trailing slash. |
| `access_blocked` | The consent screen is still in *Testing* and the address is not a listed test user. |
| Button never appears | The two secrets are not both set, or the service was not restarted. Check `/api/v1/auth/methods`. |
| Returns to the site signed out | `APP_BASE_URL` is wrong, or the state cookie was dropped — check that the API is on https in production. |
| `Unexpected token issuer` / `issued for another application` | `GOOGLE_CLIENT_ID` does not match the client that issued the token. Usually two OAuth clients in one project. |

---

## 5. What is deliberately not done

- **No Google account is ever created for a customer.** Sign-in matches on the
  verified email address. Someone who registered with a password and later uses
  Google lands in the same account.
- **No refresh tokens are requested or stored.** The ID token is used once to
  establish identity, then discarded. There is nothing to leak later and nothing
  to revoke.
- **No Google profile picture or contact scope.** `profile` is requested for the
  display name only.
