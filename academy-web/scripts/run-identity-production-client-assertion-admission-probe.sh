#!/bin/bash
set -euo pipefail

umask 077
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
readonly SCRIPT_DIR
readonly PROBE="$SCRIPT_DIR/identity-production-client-assertion-admission-probe.mjs"

fail() {
  printf 'ACADEMY_IDENTITY_ASSERTION_PROMPT=FAIL\n' >&2
  exit 1
}

[[ $# -eq 0 && -t 0 && -t 2 && -f "$PROBE" ]] || fail

private_jwk=''
cleanup() {
  private_jwk=''
}
trap cleanup EXIT HUP INT TERM

printf 'เปิด Bitwarden รายการ "Academy - Identity Client Assertion Private JWK" แล้ววางค่า JWK ที่ prompt นี้เพียงครั้งเดียว (input ถูกซ่อนและไม่ถูกเขียนลง disk): ' >&2
IFS= read -r -s private_jwk || fail
printf '\n' >&2
[[ -n "$private_jwk" ]] || fail

printf '%s' "$private_jwk" | node "$PROBE" --admission-probe
