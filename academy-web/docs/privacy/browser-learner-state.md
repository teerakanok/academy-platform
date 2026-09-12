# Browser learner state (candidate)

Unsubmitted checkpoint answers and simulation inputs are memory-only in the current
tab. Rerenders retain the draft; full reloads and new tabs do not. Submitted learning
records remain server-authoritative. Legacy checkpoint, player attempt and course
progress localStorage prefixes are removed on app startup, store use and logout
intent. Theme, locale and unrelated keys remain untouched. Storage denial is handled
without changing authorization or preventing learning; deletion cannot be promised
where the browser denies access to an existing store.

After a verified local cookie-clearing response, the client sends only a fixed
same-origin BroadcastChannel message and random per-tab identifier. The identifier
contains no account/session material and never persists. It prevents the originating
tab from reloading itself before the awaited Identity SSO request completes. Other
tabs clear draft memory and rendered body immediately, then navigate to sign-in.
This confirms no global product-session revocation. Unverified local logout responses
retain the error/retry contract without sibling notification or success navigation.

The pageshow handler clears draft memory and rendered body before reloading a
persisted document, including when BroadcastChannel is unavailable. Protected HTML
must keep the edge `private, no-store` response policy: ordinary HTTP history cache
must not restore an old authorized response. A browser that refuses BroadcastChannel
cannot receive the immediate sibling signal; server authorization and the persisted
document handler remain required. Offline failure may leave a blank page, never a
success claim based on unverified revocation.

Evidence: 33 focused unit tests and eight checks using actual bundled modules in two
Chromium tabs verify memory-only storage, exact legacy cleanup, initiating-tab SSO
ordering, sibling clearing, reload loss and synchronous persisted-event clearing.
Four real loopback HTTP checks verify native back navigation before/after actual
fixture-cookie deletion with the production no-store policy. The automation browser
reported `BackForwardCacheDisabledForDelegate`; an actual BFCache restore was not
observed. Synthetic persisted-event execution is not a claim of native BFCache or
production acceptance. Full built-app and live producer/consumer journey receipts
remain release requirements.

