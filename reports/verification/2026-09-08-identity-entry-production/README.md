# Actual Academy → Identity entry

Real Chrome on production at2026-09-07T18:55UTC: Academy `/sign-in`200 → `/api/auth/identity/start`303 → Accounts `/sign-in`200. Visible email input count1, request-code button present, sign-in-unavailable message absent. Controller inspected the actual captured desktop image. Academy Access credential was injected only in memory; tokens and transaction query values are excluded from artifacts.

Accounts does not require a successful `cloudflared access token` probe for this browser route: CLI could not find an Access application and plain scripted HTTP returned403, but realChrome200 and product-originated navigation succeeded. Missing CLI token is not a browser-access blocker. Direct Accounts root lacks a product transaction and shows return-to-product recovery; start at Academy sign-in.

This closes entry navigation only. No email code was requested, no OTP was entered, and callback/session/entitlement/progress/sign-out acceptance remain open. An earlier networkidle wait timed out on ongoing Turnstile activity; the successful probe waited for the actual visible email field. No challenge bypass or production configuration change was made.
