#!/bin/sh
set -eu
umask 077

PACKAGE_SOURCE=$1
SOURCES_SOURCE=$2
PACKAGE_SHA256=$3
EXPECTED_RELEASE_SHA256=$4
EXPECTED_RELEASE_REVISION=$5
TOOLING_ROOT=$6
NODE=$TOOLING_ROOT/node
CLI=$TOOLING_ROOT/academy-release-cli.mjs
INSTALL_ROOT=/opt/academy
SUCCESS=false
FAIL_REASON=INSTALLER_REJECTED
STAGE=

envelope() {
  /usr/bin/printf '{"schema":"academy-macos-immutable-release-envelope/v1","status":"%s","reason":"%s"}\n' "$1" "$2"
}

cleanup() {
  test -z "$STAGE" && return 0
  test -d "$STAGE" && test ! -L "$STAGE" || return 1
  /bin/chmod -R u+w "$STAGE" 2>/dev/null || return 1
  /bin/rm -rf "$STAGE" 2>/dev/null || return 1
  test ! -e "$STAGE" && test ! -L "$STAGE"
}

finish() {
  exit_status=$?
  trap - EXIT HUP INT TERM
  cleanup_status=0
  cleanup || cleanup_status=$?
  if $SUCCESS && test "$exit_status" -eq 0 && test "$cleanup_status" -eq 0; then
    envelope PASS COMPLETE
  else
    test "$cleanup_status" -eq 0 || FAIL_REASON=CLEANUP_FAILED
    envelope FAILED "$FAIL_REASON"
  fi
  exit 0
}
interrupted() {
  SUCCESS=false
  FAIL_REASON=INTERRUPTED
  exit 1
}
trap finish EXIT
trap interrupted HUP INT TERM

file_sha256() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

test -f "$PACKAGE_SOURCE" && test ! -L "$PACKAGE_SOURCE"
test "$(file_sha256 "$PACKAGE_SOURCE")" = "$PACKAGE_SHA256"
test -d "$SOURCES_SOURCE" && test ! -L "$SOURCES_SOURCE"
test -x "$NODE" && test ! -L "$NODE"
test -f "$CLI" && test ! -L "$CLI"

STAGE=$(/usr/bin/mktemp -d /private/var/root/academy-immutable-release.XXXXXXXX)
test -d "$STAGE" && test ! -L "$STAGE"
test "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$STAGE")" = 'root:wheel:700'

/bin/cp -pR "$SOURCES_SOURCE" "$STAGE/sources"
/usr/sbin/chown -R root:wheel "$STAGE/sources"
/usr/bin/find "$STAGE/sources" -type d -exec /bin/chmod a+rx,a-w {} +
/usr/bin/find "$STAGE/sources" -type f -exec /bin/chmod a+rX,a-w {} +
/bin/mkdir -p "$STAGE/sources/helpers"
for helper in academy-production-cloudflare-helper.mjs identity-production-activation-preflight.mjs academy-release-manifest.mjs academy-release-pointer.mjs current-deployment.mjs; do
  /bin/cp -p "$TOOLING_ROOT/$helper" "$STAGE/sources/helpers/$helper"
  /usr/sbin/chown root:wheel "$STAGE/sources/helpers/$helper"
  /bin/chmod 500 "$STAGE/sources/helpers/$helper"
done
test -z "$(/usr/bin/find "$STAGE/sources" -type l -print -quit)"

/bin/cp -p "$PACKAGE_SOURCE" "$STAGE/package-input.json"
/usr/sbin/chown root:wheel "$STAGE/package-input.json"
/bin/chmod 400 "$STAGE/package-input.json"
test "$(file_sha256 "$STAGE/package-input.json")" = "$PACKAGE_SHA256"

"$NODE" - "$STAGE/package-input.json" "$STAGE/package.json" "$SOURCES_SOURCE" "$STAGE/sources" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const fs = require('node:fs')
const [input, output, sourceRoot, stagedRoot, expectedRevision] = process.argv.slice(2)
const rewrite = value => {
  if (typeof value === 'string') {
    if (value === sourceRoot) return stagedRoot
    if (value.startsWith(`${sourceRoot}/`)) return `${stagedRoot}${value.slice(sourceRoot.length)}`
    return value
  }
  if (Array.isArray(value)) return value.map(rewrite)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewrite(item)]))
  }
  return value
}
const source = fs.readFileSync(input, 'utf8')
const parsed = JSON.parse(source)
const rewritten = rewrite(parsed)
if (rewritten.releaseRevision !== expectedRevision) process.exit(1)
fs.writeFileSync(output, `${JSON.stringify(rewritten)}\n`, { flag: 'wx', mode: 0o600 })
NODE_SCRIPT
/usr/sbin/chown root:wheel "$STAGE/package.json"
/bin/chmod 600 "$STAGE/package.json"

FAIL_REASON=RENDER_REJECTED
EXPECTED_RELEASE_REVISION=$EXPECTED_RELEASE_REVISION \
  "$NODE" "$CLI" render "$STAGE/package.json" "$STAGE/rendered" > "$STAGE/render-result.json"
/bin/chmod 600 "$STAGE/render-result.json"
"$NODE" - "$STAGE/render-result.json" "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const fs = require('node:fs')
const [path, expectedSha, expectedRevision] = process.argv.slice(2)
const value = JSON.parse(fs.readFileSync(path, 'utf8'))
if (value.status !== 'RENDERED' || value.releaseSha256 !== expectedSha || value.releaseRevision !== expectedRevision) process.exit(1)
NODE_SCRIPT

FAIL_REASON=DIAGNOSIS_REJECTED
"$NODE" "$CLI" diagnose-install "$STAGE/rendered" "$INSTALL_ROOT" \
  "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" > "$STAGE/diagnostic.json"
/bin/chmod 600 "$STAGE/diagnostic.json"
diagnostic_reason=$("$NODE" - "$STAGE/diagnostic.json" <<'NODE_SCRIPT'
const fs = require('node:fs')
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const accepted = new Set(['TARGET_ABSENT', 'EXACT_CANDIDATE', 'CRASH_WINDOW_0700', 'OWNED_STAGE_RECOVERABLE'])
if (value.schema !== 'academy-release-install-diagnostic/v1' || value.status !== 'INSPECTED' || typeof value.reason !== 'string') process.exit(1)
if (!accepted.has(value.reason)) process.exit(2)
process.stdout.write(value.reason)
NODE_SCRIPT
) || {
  FAIL_REASON=FOREIGN_STATE_REJECTED
  exit 1
}
test -n "$diagnostic_reason"

FAIL_REASON=INSTALL_REJECTED
"$NODE" "$CLI" install "$STAGE/rendered" "$INSTALL_ROOT" \
  "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" > "$STAGE/install-result.json"
/bin/chmod 600 "$STAGE/install-result.json"
"$NODE" - "$STAGE/install-result.json" <<'NODE_SCRIPT'
const fs = require('node:fs')
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!['INSTALLED', 'IDEMPOTENT'].includes(value.status)) process.exit(1)
NODE_SCRIPT

FAIL_REASON=VERIFY_REJECTED
"$NODE" "$CLI" verify "$INSTALL_ROOT" "$EXPECTED_RELEASE_SHA256" \
  "$EXPECTED_RELEASE_REVISION" > "$STAGE/verify-result.json"
/bin/chmod 600 "$STAGE/verify-result.json"
"$NODE" - "$STAGE/verify-result.json" "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const fs = require('node:fs')
const [path, expectedSha, expectedRevision] = process.argv.slice(2)
const value = JSON.parse(fs.readFileSync(path, 'utf8'))
const keys = Object.keys(value).sort().join(',')
if (keys !== 'releaseRevision,releaseSha256,status'
  || value.status !== 'VERIFIED'
  || value.releaseSha256 !== expectedSha
  || value.releaseRevision !== expectedRevision) process.exit(1)
NODE_SCRIPT
SUCCESS=true
FAIL_REASON=COMPLETE
