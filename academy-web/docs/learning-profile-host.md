# Academy learning profile host

`/profile` checks the Academy session and reads the signed Core self profile when
the host client is explicitly configured. Otherwise it shows an unavailable state.
The dashboard links to this page. Every self request takes issuer and subject
from the active server session; browser commands cannot supply a principal or name.

The host is disabled unless `ACADEMY_CORE_PROFILE_ENABLED=1` and all of
`ACADEMY_CORE_PROFILE_ORIGIN`, `ACADEMY_CORE_PROFILE_CLIENT_ID`,
`ACADEMY_CORE_PROFILE_KEY_ID`, `ACADEMY_CORE_PROFILE_PRIVATE_KEY_PEM`,
`ACADEMY_CORE_PROFILE_ENVIRONMENT`, and `ACADEMY_CORE_PROFILE_ISSUER` are present
and valid. The private key is runtime-injected, never a browser setting. Core must
register the client for the specific self and public-share operations and issuer.
An incomplete registration, issuer mismatch, unavailable session, invalid response,
or Core outage fails closed. This source does not register clients or enable them.

`src/core-profile-ui` is generated from CYBERSKILLS Core. Core owns the renderer,
profile contracts, share preview, and public card. Academy supplies theme tokens
through `ProfileHost`. Academy also supplies the radar variables on the host so
the public card has the same colours as the private view. Do not edit the
generated files in Academy.

From `academy-web`, regenerate and verify the files against a reviewed Core source:

```sh
node "$CORE_ROOT/product/profile-ui/sync-to-host.mjs" "$PWD/src" --zod-v3
node "$CORE_ROOT/product/profile-ui/sync-to-host.mjs" "$PWD/src" --check --zod-v3
```

`--zod-v3` uses Academy's Zod 4 compatibility export. `SOURCE.json` records the
source hashes and the contract transformation. The host must also pass the Academy
build and focused renderer tests when the Core source changes.

The shared renderer's interface text is currently English. Translations belong in
Core so that each host uses the same renderer. Before enabling the host, it needs:

- An active Identity Control session and activation projection in the deployed
  Academy runtime, plus a Core client registration for that exact issuer.
- The existing edge rate limiter for anonymous share reads. The share URL keeps
  its secret in the fragment; the browser sends it in a same-origin POST body,
  and Academy relays it to Core without caching or placing it in a query string.
- A trusted Core source for the share account name and assessed evidence. Core owns
  the name and eligibility decisions. TA and testing activity must not increase
  profile skills, and browser-computed scores must not become verified evidence.

The tests use explicitly synthetic identities and profiles. They do not prove a
live identity binding, client registration, evidence export, or deployment.
