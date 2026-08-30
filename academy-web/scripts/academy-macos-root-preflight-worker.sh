#!/bin/zsh
set -euo pipefail
[[ "$(/usr/bin/id -u)" == 0 ]]
umask 077

stage=/private/var/root/academy-release-recovery-7dca6452
observer=/private/var/root/academy-release-observer-07ed27c0
observation=/private/var/root/academy-release-observation-7dca6452.json
source=/private/tmp/academy-release-sources-fa7
input=/private/tmp/academy-release-package-fa7.json
repo=/private/tmp/academy-result-loss-remediation/academy-web
db_source=/private/tmp/academy-db-stage-065be09
revision=fa7bca732aefa58ab7fc2c784676a113b873466b
release_sha=84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46
phase=BOOTSTRAP
publication=UNKNOWN
reason=UNCLASSIFIED
terminal_ready=false
TRAPZERR() {
  local exit_code=$?
  set +e
  if $terminal_ready; then
    printf '{"schema":"academy-macos-root-preflight-terminal/v1","status":"FAILED","phase":"%s","publication":"%s","reason":"%s"}\n' "$phase" "$publication" "$reason" > "$stage/terminal.json"
    /bin/chmod 600 "$stage/terminal.json"
  fi
  printf 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_FAILED phase=%s publication=%s reason=%s\n' "$phase" "$publication" "$reason" >&2
  exit "$exit_code"
}

phase=OBSERVE_RELEASE
[[ -x "$observer/node" && ! -L "$observer/node" ]]
[[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$observer/node")" == 'root:wheel:500:1' ]]
[[ "$(/usr/bin/shasum -a 256 "$observer/node" | /usr/bin/awk '{print $1}')" == 9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188 ]]
verify_observer_file() {
  local path=$1 expected=$2
  [[ -f "$path" && ! -L "$path" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$path")" == 'root:wheel:400:1' ]]
  [[ "$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}')" == "$expected" ]]
}
verify_observer_file "$observer/academy-macos-release-recovery.mjs" 844d92b9734a18fac1d14c842c25c2ff814b2d7a5840a14690bab3ee517a3d41
verify_observer_file "$observer/academy-release-pointer.mjs" 7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee
verify_observer_file "$observer/academy-release-manifest.mjs" 803f50c7f33ef22f9d199ee8b4e7dfe3810c33861999a8c2109880f62ab4eaec
observation_result="$("$observer/node" "$observer/academy-macos-release-recovery.mjs" "$observation")"
IFS=$'\t' read -r observation_selected install_required <<< "$observation_result"
[[ "$observation_selected" == "$observation" || "$observation_selected" == "$observation.candidate.v1.json" ]]
[[ -f "$observation_selected" && ! -L "$observation_selected" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$observation_selected")" == 'root:wheel:600:1' ]]
[[ "$install_required" == true || "$install_required" == false ]]

phase=CLEANUP_STAGE
if [[ -e "$stage" || -L "$stage" ]]; then
  [[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$stage")" == 'root:wheel:700' ]]
  [[ -f "$stage/.academy-owned" && ! -L "$stage/.academy-owned" ]]
  [[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$stage/.academy-owned")" == 'root:wheel:400:1' ]]
  [[ "$(/bin/cat "$stage/.academy-owned")" == 'academy-root-preflight/7dca6452' ]]
  /bin/rm -rf "$stage"
fi
/usr/bin/install -d -o root -g wheel -m 700 "$stage" "$stage/source" "$stage/tooling"
printf 'academy-root-preflight/7dca6452\n' > "$stage/.academy-owned"
/bin/chmod 400 "$stage/.academy-owned"
[[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$stage/.academy-owned")" == 'root:wheel:400:1' ]]
terminal_ready=true
/bin/cp -R "$source"/. "$stage/source"/
for name in academy-release-cli.mjs academy-release-install.mjs academy-release-manifest.mjs academy-release-pointer.mjs academy-release-render.mjs academy-macos-release-recovery.mjs; do
  /bin/cp "$repo/scripts/$name" "$stage/tooling/$name"
done
/usr/sbin/chown -R root:wheel "$stage"
/usr/bin/find "$stage/source" "$stage/tooling" -type d -exec /bin/chmod 500 {} +
/usr/bin/find "$stage/source" "$stage/tooling" -type f -exec /bin/chmod 400 {} +
/bin/chmod 500 "$stage/source/node" "$stage/tooling/academy-release-cli.mjs"
verify_root_file() {
  local path=$1 mode=$2 expected=$3
  [[ -f "$path" && ! -L "$path" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$path")" == "root:wheel:$mode:1" ]]
  [[ "$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}')" == "$expected" ]]
}
verify_root_file "$stage/source/node" 500 9bc64e922cba152eedf55cd4528ac0b5b7e0f4cd9d671d77bb0830c9796ea188
verify_root_file "$stage/tooling/academy-release-cli.mjs" 500 6e91274bb01f78446c6bbf91dd76cc84d4e44765c7ef6122fe8171d6de46099c
verify_root_file "$stage/tooling/academy-release-install.mjs" 400 4ec50af32ac10a26bc5bad2782a5f6faf3da7df3cabc87765007fa240a98eb72
verify_root_file "$stage/tooling/academy-release-manifest.mjs" 400 803f50c7f33ef22f9d199ee8b4e7dfe3810c33861999a8c2109880f62ab4eaec
verify_root_file "$stage/tooling/academy-release-pointer.mjs" 400 7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee
verify_root_file "$stage/tooling/academy-release-render.mjs" 400 03f97f824f0c4ec3476852e85dd821dabaf45562b0049b18a06c5772bb049dde
verify_root_file "$stage/tooling/academy-macos-release-recovery.mjs" 400 844d92b9734a18fac1d14c842c25c2ff814b2d7a5840a14690bab3ee517a3d41
phase=PREPARE_PACKAGE
"$stage/source/node" -e 'const fs=require("fs"),old=process.argv[1],next=process.argv[2],input=process.argv[3],output=process.argv[4];const walk=v=>typeof v==="string"?v.split(old).join(next):Array.isArray(v)?v.map(walk):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;fs.writeFileSync(output,JSON.stringify(walk(JSON.parse(fs.readFileSync(input,"utf8"))))+"\n",{mode:0o600,flag:"wx"})' "$source" "$stage/source" "$input" "$stage/package.json"
/usr/sbin/chown root:wheel "$stage/package.json"
verify_root_file "$stage/package.json" 600 39767520f14a070d4a840cdb178789efe6d9e37060725ad6f6a3f9f81d27ab3a

if [[ "$install_required" == true ]]; then
  phase=RENDER_RELEASE
  : > "$stage/render-result.json"
  /bin/chmod 600 "$stage/render-result.json"
  umask 022
  "$stage/source/node" "$stage/tooling/academy-release-cli.mjs" render "$stage/package.json" "$stage/rendered" > "$stage/render-result.json"
  umask 077
  "$stage/source/node" -e 'const fs=require("fs"),v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.status!=="RENDERED"||v.releaseRevision!==process.argv[2]||v.releaseSha256!==process.argv[3])process.exit(1)' "$stage/render-result.json" "$revision" "$release_sha"
  phase=INSTALL_RELEASE
  publication=UNKNOWN
  reason=DIAGNOSTIC_FAILED
  "$stage/source/node" "$stage/tooling/academy-release-cli.mjs" diagnose-install "$stage/rendered" /opt/academy "$release_sha" "$revision" > "$stage/install-diagnostic.json"
  reason="$("$stage/source/node" -e 'const fs=require("fs"),v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")),ok=new Set(["EXACT_CANDIDATE","CRASH_WINDOW_0700","FOREIGN_TARGET","FOREIGN_STAGE","OWNED_STAGE_RECOVERABLE","TARGET_ABSENT"]);if(v.schema!=="academy-release-install-diagnostic/v1"||v.status!=="INSPECTED"||!ok.has(v.reason))process.exit(1);process.stdout.write(v.reason)' "$stage/install-diagnostic.json")"
  [[ "$reason" != FOREIGN_TARGET && "$reason" != FOREIGN_STAGE ]]
  "$stage/source/node" "$stage/tooling/academy-release-cli.mjs" install "$stage/rendered" /opt/academy "$release_sha" "$revision" > "$stage/install-result.json"
fi
phase=VERIFY_RELEASE
"$stage/source/node" "$stage/tooling/academy-release-cli.mjs" verify /opt/academy "$release_sha" "$revision" > "$stage/verify-result.json"
phase=REOBSERVE_RELEASE
"$stage/source/node" "$stage/tooling/academy-macos-release-recovery.mjs" "$stage/publication-result.json"
/bin/chmod 600 "$stage/publication-result.json"
publication="$("$stage/source/node" -e 'const fs=require("fs"),v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.schema!=="academy-macos-release-observation/v1"||v.status!=="OBSERVED"||v.publication!=="CANDIDATE"||v.installRequired!==false)process.exit(1);process.stdout.write(v.publication)' "$stage/publication-result.json")"

db_root=/opt/academy/production-db
state_root=/private/var/root/academy-production-state
phase=STAGE_DATABASE
[[ "$(/usr/bin/shasum -a 256 /opt/academy/production-operations/academy-poola-production-producer.mjs | /usr/bin/awk '{print $1}')" == 4a1db4922fdb39b5b8841adb186b39e463a9e53448abb8d19bb4ea21198afc15 ]]
ensure_root_directory() {
  local path=$1
  if [[ -e "$path" ]]; then
    [[ -d "$path" && ! -L "$path" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$path")" == 'root:wheel:700' ]]
  else
    /usr/bin/install -d -o root -g wheel -m 700 "$path"
  fi
}
ensure_root_directory "$db_root"
ensure_root_directory "$db_root/migrations"
ensure_root_directory "$state_root"
ensure_root_directory /private/var/lib/academy
ensure_root_directory /private/var/lib/academy/wrangler
install_or_match() {
  local mode=$1 source_file=$2 target=$3 expected=$4 created=false
  if [[ -e "$target" ]]; then
    [[ -f "$target" && ! -L "$target" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$target")" == "root:wheel:$mode:1" ]]
    [[ "$(/usr/bin/shasum -a 256 "$target" | /usr/bin/awk '{print $1}')" == "$expected" ]]
  else
    /usr/bin/install -o root -g wheel -m "$mode" "$source_file" "$target"
    created=true
    if [[ ! -f "$target" || -L "$target" || "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$target")" != "root:wheel:$mode:1" \
      || "$(/usr/bin/shasum -a 256 "$target" | /usr/bin/awk '{print $1}')" != "$expected" ]]; then
      $created && /bin/rm -f "$target"
      return 1
    fi
  fi
}
install_or_match 400 "$db_source/migrations/0021_unlink_email_derived_lead_ownership.sql" "$db_root/migrations/0021_unlink_email_derived_lead_ownership.sql" add7fb419f608925afe2e87c78d6d6297153a12a4f34be793921abdbeced4805
install_or_match 400 "$db_source/migrations/0022_identity_lifecycle_projection.sql" "$db_root/migrations/0022_identity_lifecycle_projection.sql" df3e746d5c3863a626c93993730ffec0c805a9d4b63f32883745592037edd8e0
install_or_match 400 "$db_source/migrations/0023_identity_lifecycle_pull_lease.sql" "$db_root/migrations/0023_identity_lifecycle_pull_lease.sql" eff6bf92af29569cfac15201184a17f5cc201d8092a783866a0d973c3087f5c1
install_or_match 400 "$db_source/migrations/0024_identity_profile_activation.sql" "$db_root/migrations/0024_identity_profile_activation.sql" f0322b64ab270dec8d73e663f0cc2017c0c91df0a558488bb70aa32232fa7cab
install_or_match 400 "$db_source/migrations/0025_identity_authorization_transaction.sql" "$db_root/migrations/0025_identity_authorization_transaction.sql" 14934b499d3cb1a27751c8e3552577b0aa5c55bd8c649e5f67187cea1155e94d
install_or_match 400 "$db_source/migrations/0026_identity_lifecycle_principal_contract.sql" "$db_root/migrations/0026_identity_lifecycle_principal_contract.sql" 5739f1257fa5a18419b8296236dc17f04d21e11ee491da1e85cca90d2f4beaf4
install_or_match 400 "$db_source/migrations/0027_identity_session_store.sql" "$db_root/migrations/0027_identity_session_store.sql" 48d916aa5ae8cac47c800d116ae1c9780580940788f4804c2208fc9f52583fe0
install_or_match 600 "$db_source/database-config.json" "$db_root/database-config.json" 4cb0613a51b783d48d596551b25f6c8044ea13325cc848f47d57601f035c4c21
install_or_match 600 "$db_source/p1-p7-config.json" /opt/academy/production-operations/p1-p7-config.json 0be8bd9b822047919f06dbf1662bc6e24d0b1a393945fe70220603069ad74e0b
[[ "$(/usr/bin/shasum -a 256 "$db_root/database-config.json" | /usr/bin/awk '{print $1}')" == 4cb0613a51b783d48d596551b25f6c8044ea13325cc848f47d57601f035c4c21 ]]
[[ "$(/usr/bin/shasum -a 256 /opt/academy/production-operations/p1-p7-config.json | /usr/bin/awk '{print $1}')" == 0be8bd9b822047919f06dbf1662bc6e24d0b1a393945fe70220603069ad74e0b ]]

release=/opt/academy/releases/$release_sha
whoami=/private/var/root/academy-wrangler-whoami-d6e517e3.txt
phase=AUTHENTICATE_CLOUDFLARE
valid_whoami() {
  [[ -f "$whoami" && ! -L "$whoami" && "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$whoami")" == 'root:wheel:600:1' ]]
  local size="$(/usr/bin/stat -f '%z' "$whoami")"
  [[ "$size" -gt 0 && "$size" -le 65536 ]]
}
if [[ -e "$whoami" || -L "$whoami" ]]; then
  valid_whoami
else
  whoami_tmp="$stage/whoami.tmp"
  trap '/bin/rm -f "$whoami_tmp"' EXIT
  set -o noclobber
  HOME=/private/var/root LANG=C LC_ALL=C PATH=/usr/bin:/bin "$release/node" "$release/wrangler/bin/wrangler.js" login >/dev/null 2>&1
  HOME=/private/var/root LANG=C LC_ALL=C PATH=/usr/bin:/bin "$release/node" "$release/wrangler/bin/wrangler.js" whoami > "$whoami_tmp" 2>/dev/null
  [[ -f "$whoami_tmp" && ! -L "$whoami_tmp" ]]
  local_size="$(/usr/bin/stat -f '%z' "$whoami_tmp")"
  [[ "$local_size" -gt 0 && "$local_size" -le 65536 ]]
  /bin/chmod 600 "$whoami_tmp"
  /bin/ln "$whoami_tmp" "$whoami"
  /bin/rm "$whoami_tmp"
  trap - EXIT
  valid_whoami
fi
/bin/chmod 600 "$stage"/*-result.json
phase=COMPLETE
printf '{"schema":"academy-macos-root-preflight-terminal/v1","status":"PASS","phase":"COMPLETE","publication":"CANDIDATE","cloudflare":"AUTHENTICATED"}\n' > "$stage/terminal.json"
/bin/chmod 600 "$stage/terminal.json"
printf 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_PASS\n'
