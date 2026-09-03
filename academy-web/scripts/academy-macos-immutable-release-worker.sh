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
INSTALL_ROOT=${7:-/opt/academy}
STAGE_PARENT=${8:-/private/var/root}
NODE=${9:-$NODE}
CLI=${10:-$CLI}
CHOWN=${11:-/usr/sbin/chown}
RM=${12:-/bin/rm}
SUCCESS=false
FAIL_REASON=INSTALLER_REJECTED
STAGE=

envelope() {
  /usr/bin/printf '{"schema":"academy-macos-immutable-release-envelope/v1","status":"%s","reason":"%s"}\n' "$1" "$2"
}

cleanup() {
  if test -n "$STAGE" && test -d "$STAGE" && test ! -L "$STAGE"; then
    /bin/chmod -R u+w "$STAGE" 2>/dev/null || return 1
    "$RM" -rf "$STAGE" 2>/dev/null || return 1
  fi
  test ! -e "$STAGE" && test ! -L "$STAGE"
}

finish() {
  exit_status=$?
  trap - EXIT HUP INT TERM
  if ! cleanup; then
    SUCCESS=false
    FAIL_REASON=CLEANUP_FAILED
  fi
  if $SUCCESS && test "$exit_status" -eq 0; then
    envelope PASS COMPLETE
  else
    envelope FAILED "$FAIL_REASON"
  fi
  exit 0
}
trap finish EXIT HUP INT TERM

if test "$#" -gt 12; then exit 1; fi
case "$INSTALL_ROOT" in /*) ;; *) exit 1;; esac
case "$STAGE_PARENT" in /*) ;; *) exit 1;; esac
test ! -e "$INSTALL_ROOT" -o -d "$INSTALL_ROOT"
test ! -L "$INSTALL_ROOT"
test -d "$STAGE_PARENT" && test ! -L "$STAGE_PARENT"
test -x "$CHOWN" && test ! -L "$CHOWN"
test -x "$RM" && test ! -L "$RM"

test -f "$PACKAGE_SOURCE" && test ! -L "$PACKAGE_SOURCE"
test -d "$SOURCES_SOURCE" && test ! -L "$SOURCES_SOURCE"
test -x "$NODE" && test ! -L "$NODE"
test -f "$CLI" && test ! -L "$CLI"
test "${#PACKAGE_SHA256}" -eq 64
test "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$STAGE_PARENT" 2>/dev/null)" = \
  "$(/usr/bin/id -un):$(/usr/bin/id -gn):700"

STAGE=$(/usr/bin/mktemp -d "$STAGE_PARENT/academy-immutable-release.XXXXXXXX")
test -d "$STAGE" && test ! -L "$STAGE"
test "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$STAGE")" = \
  "$(/usr/bin/id -un):$(/usr/bin/id -gn):700"

/bin/cp -pR "$SOURCES_SOURCE" "$STAGE/sources"
if test "$(/usr/bin/id -u)" -eq 0; then
  "$CHOWN" -R root:wheel "$STAGE/sources"
fi
/usr/bin/find "$STAGE/sources" -type d -exec /bin/chmod a-w {} +
/usr/bin/find "$STAGE/sources" -type f -exec /bin/chmod a-w {} +
test -z "$(/usr/bin/find "$STAGE/sources" -type l -print -quit)"

"$NODE" - "$PACKAGE_SOURCE" "$STAGE/package-input.json" "$PACKAGE_SHA256" \
  "$SOURCES_SOURCE" "$STAGE/sources" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const { createHash } = require('node:crypto')
const constants = require('node:fs').constants
const fs = require('node:fs')
const [sourcePath, outputPath, expectedDigest, sourceRoot, stagedRoot,
  expectedRevision] = process.argv.slice(2)
const SHA256 = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const exact = (value, keys) => value && typeof value === 'object' &&
  !Array.isArray(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key))
let descriptor
try {
  descriptor = fs.openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
  const metadata = fs.fstatSync(descriptor)
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size < 2 ||
      metadata.size > 1024 * 1024 || (metadata.mode & 0o022)) process.exit(1)
  const chunks = []
  while (true) {
    const chunk = Buffer.alloc(64 * 1024)
    const length = fs.readSync(descriptor, chunk, 0, chunk.length, null)
    if (length === 0) break
    chunks.push(chunk.subarray(0, length))
  }
  const bytes = Buffer.concat(chunks)
  const source = bytes.toString('utf8')
  if (bytes.length !== Buffer.byteLength(source) ||
      createHash('sha256').update(bytes).digest('hex') !== expectedDigest ||
      !SHA256.test(expectedDigest) || !REVISION.test(expectedRevision)) process.exit(1)
  const value = JSON.parse(source)
  if (!exact(value, ['schema','releaseRevision','nodeSource','wranglerDirectory',
    'wranglerEntrypoint','applicationDirectory','helpers']) ||
    value.schema !== 'academy-release-package-input/v2' ||
    value.releaseRevision !== expectedRevision || typeof value.nodeSource !== 'string' ||
    typeof value.wranglerDirectory !== 'string' || typeof value.wranglerEntrypoint !== 'string' ||
    typeof value.applicationDirectory !== 'string' ||
    !Array.isArray(value.helpers) || value.helpers.length < 1 ||
    !value.helpers.every(helper => exact(helper, ['sourcePath','path','mode']) &&
      typeof helper.sourcePath === 'string' && typeof helper.path === 'string' &&
      [0o400,0o444,0o500,0o555].includes(helper.mode))) process.exit(1)
  if (new Set(value.helpers.map(helper => helper.path)).size !== value.helpers.length ||
      new Set(value.helpers.map(helper => helper.sourcePath)).size !== value.helpers.length)
    process.exit(1)
  const paths = [value.nodeSource,value.wranglerDirectory,value.applicationDirectory,
    ...value.helpers.map(helper => helper.sourcePath)]
  if (!paths.every(path => path === sourceRoot || path.startsWith(`${sourceRoot}/`)))
    process.exit(1)
  const rewrite = item => item === sourceRoot ? stagedRoot
    : item.startsWith(`${sourceRoot}/`) ? `${stagedRoot}${item.slice(sourceRoot.length)}` : item
  const rewritten = { ...value, nodeSource: rewrite(value.nodeSource),
    wranglerDirectory: rewrite(value.wranglerDirectory),
    applicationDirectory: rewrite(value.applicationDirectory),
    helpers: value.helpers.map(helper => ({ ...helper, sourcePath: rewrite(helper.sourcePath) })) }
  const canonical = `${JSON.stringify(rewritten)}\n`
  if (Buffer.byteLength(canonical) !== canonical.length) process.exit(1)
  const output = fs.openSync(outputPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o400)
  try { fs.writeFileSync(output, canonical); fs.fsyncSync(output) } finally { fs.closeSync(output) }
} finally { if (descriptor !== undefined) fs.closeSync(descriptor) }
NODE_SCRIPT

ACADEMY_RELEASE_CLI=$CLI \
  EXPECTED_RELEASE_REVISION=$EXPECTED_RELEASE_REVISION \
  "$NODE" - "$STAGE/package-input.json" <<'NODE_SCRIPT'
const { pathToFileURL } = require('node:url')
const [packagePath] = process.argv.slice(2)
const cli = await import(pathToFileURL(process.env.ACADEMY_RELEASE_CLI).href)
const spec = await cli.readAcademyReleasePackageInput({ path: packagePath })
if (spec.releaseRevision !== process.env.EXPECTED_RELEASE_REVISION) process.exit(1)
NODE_SCRIPT

EXPECTED_RELEASE_REVISION=$EXPECTED_RELEASE_REVISION \
  "$NODE" "$CLI" render "$STAGE/package-input.json" "$STAGE/rendered" > "$STAGE/render-result.json"
/bin/chmod 600 "$STAGE/render-result.json"
"$NODE" - "$STAGE/render-result.json" "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const fs = require('node:fs')
const [path, expectedSha, expectedRevision] = process.argv.slice(2)
const source = fs.readFileSync(path, 'utf8')
const value = JSON.parse(source)
if (source !== `${JSON.stringify(value)}\n` ||
  Object.keys(value).join(',') !== 'status,releaseSha256,releaseRevision' ||
  value.status !== 'RENDERED' || value.releaseSha256 !== expectedSha ||
  value.releaseRevision !== expectedRevision) process.exit(1)
NODE_SCRIPT

"$NODE" "$CLI" diagnose-install "$STAGE/rendered" "$INSTALL_ROOT" \
  "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" > "$STAGE/diagnostic.json"
/bin/chmod 600 "$STAGE/diagnostic.json"
diagnostic_reason=$("$NODE" - "$STAGE/diagnostic.json" <<'NODE_SCRIPT'
const fs = require('node:fs')
const source = fs.readFileSync(process.argv[2], 'utf8')
const value = JSON.parse(source)
const accepted = new Set(['TARGET_ABSENT', 'EXACT_CANDIDATE', 'CRASH_WINDOW_0700', 'OWNED_STAGE_RECOVERABLE'])
if (source !== `${JSON.stringify(value)}\n` ||
  Object.keys(value).join(',') !== 'schema,status,reason' ||
  value.schema !== 'academy-release-install-diagnostic/v1' || value.status !== 'INSPECTED' ||
  !accepted.has(value.reason)) process.exit(1)
process.stdout.write(value.reason)
NODE_SCRIPT
) || {
  FAIL_REASON=FOREIGN_STATE_REJECTED
  exit 1
}
test -n "$diagnostic_reason"

"$NODE" "$CLI" install "$STAGE/rendered" "$INSTALL_ROOT" \
  "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" > "$STAGE/install-result.json"
/bin/chmod 600 "$STAGE/install-result.json"
"$NODE" - "$STAGE/install-result.json" <<'NODE_SCRIPT'
const fs = require('node:fs')
const source = fs.readFileSync(process.argv[2], 'utf8')
const value = JSON.parse(source)
if (source !== `${JSON.stringify(value)}\n` ||
  Object.keys(value).join(',') !== 'status,releaseSha256,releaseRevision' ||
  !['INSTALLED', 'IDEMPOTENT'].includes(value.status)) process.exit(1)
NODE_SCRIPT

"$NODE" "$CLI" verify "$INSTALL_ROOT" "$EXPECTED_RELEASE_SHA256" \
  "$EXPECTED_RELEASE_REVISION" > "$STAGE/verify-result.json"
/bin/chmod 600 "$STAGE/verify-result.json"
"$NODE" - "$STAGE/verify-result.json" "$INSTALL_ROOT" \
  "$EXPECTED_RELEASE_SHA256" "$EXPECTED_RELEASE_REVISION" <<'NODE_SCRIPT'
const constants = require('node:fs').constants
const fs = require('node:fs')
const { join } = require('node:path')
const [verifyPath, installRoot, expectedSha, expectedRevision] = process.argv.slice(2)
const readJson = path => {
  const descriptor = fs.openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const metadata = fs.fstatSync(descriptor)
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 4096) process.exit(1)
    const source = fs.readFileSync(descriptor, 'utf8')
    const value = JSON.parse(source)
    if (source !== `${JSON.stringify(value)}\n`) process.exit(1)
    return { metadata, value }
  } finally { fs.closeSync(descriptor) }
}
const verify = readJson(verifyPath)
if (Object.keys(verify.value).join(',') !== 'status,releaseSha256,releaseRevision' ||
  verify.value.status !== 'VERIFIED' || verify.value.releaseSha256 !== expectedSha ||
  verify.value.releaseRevision !== expectedRevision) process.exit(1)
const pointerPath = join(installRoot, 'current.json')
const pointer = readJson(pointerPath)
if (Object.keys(pointer.value).join(',') !==
  'schema,releaseSha256,releaseRevision,previousReleaseSha256,updatedAt' ||
  pointer.value.schema !== 'academy-release-pointer/v1' ||
  pointer.value.releaseSha256 !== expectedSha ||
  pointer.value.releaseRevision !== expectedRevision ||
  (pointer.value.previousReleaseSha256 !== null &&
    !/^[a-f0-9]{64}$/.test(pointer.value.previousReleaseSha256)) ||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(pointer.value.updatedAt)) process.exit(1)
const releaseDirectory = join(installRoot, 'releases', expectedSha)
const releaseMetadata = fs.lstatSync(releaseDirectory)
const manifestMetadata = fs.lstatSync(join(releaseDirectory, 'manifest.json'))
if (!releaseMetadata.isDirectory() || releaseMetadata.isSymbolicLink() ||
  !manifestMetadata.isFile() || manifestMetadata.isSymbolicLink()) process.exit(1)
NODE_SCRIPT

SUCCESS=true
