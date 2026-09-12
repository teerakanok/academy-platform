# Academy browser sign-out

Consumer implementation notes for the canonical Identity producer contract
`docs/integration/browser-signout-contract.md`, SHA-256
`b57a09ec528afce8747542ce20c01de708f0cc8da1a017298ef2b6aa9214784d`,
reviewed from the parent candidate on 2026-09-11. That producer document owns the
shared contract. This consumer is prepared locally; production acceptance remains open.

1. The browser sends same-origin `POST /api/auth/sign-out`. Academy validates the
   mutation Origin, revokes its current opaque session when available and expires
   its current and legacy cookies. The response reports local revocation as
   `confirmed` or `not-confirmed` and supplies the exact approved SSO endpoint.
2. Only after validating that response, the browser awaits
   `POST https://accounts.cyberskills.co.th/v1/sessions/signout`, with
   `credentials: include`, `mode: cors`, `redirect: error`, `cache: no-store`,
   `Content-Type: application/json` and body `{}`. A five-second abort deadline
   covers the connection and response. The response reader additionally bounds
   the JSON to 1024 bytes and depth one, rejecting duplicate keys.
3. Success requires a successful HTTP response and exactly `{ "signedOut": true }`.
   Opaque, redirected, rejected, timed-out or malformed responses remain unconfirmed.
   Client URL validation accepts only the exact endpoint, including its path.
4. Both page and fallback CSP permit connections to `self` and only the exact
   accounts origin. Identity owns Origin/Fetch-Metadata admission, credentialed
   CORS and preflight restricted to approved consumers on this endpoint, JSON
   mutation validation, durable IdP session revocation, cookie expiry and no-store.
5. Navigation waits for this bounded result. If SSO is unconfirmed, the sign-in
   page states that clearly and links to the account center for sign-out before
   leaving a shared device. If local revocation is also unconfirmed, it states
   that only browser cookies were cleared. It never claims global logout.

Scope: this ends the current Academy session and current browser's Identity SSO
session when confirmed. Existing sessions in other products or on other devices
are not revoked by this action. Lifecycle suspension/deletion and durable
cross-product revocation are separate contracts owned by the Identity producer.

Required release proof: credentialed production browser request accepted under the
actual CSP/CORS/Access configuration; successful confirmation; expired Academy
and IdP cookies; old Academy credential denied; no silent SSO resume after logout;
negative Origin/preflight and failure UX; Identity and Crux blast-radius checks.
