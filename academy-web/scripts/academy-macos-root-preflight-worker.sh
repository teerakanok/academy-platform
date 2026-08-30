#!/bin/zsh
set -euo pipefail
[[ "$(/usr/bin/id -u)" == 0 ]]
umask 077

stage=/private/var/root/academy-release-stage-d6e517e3
source=/private/tmp/academy-release-sources-fa7
input=/private/tmp/academy-release-package-fa7.json
repo=/private/tmp/academy-activation-prep-ws-fe01de7a/academy-web
db_source=/private/tmp/academy-db-stage-065be09
revision=fa7bca732aefa58ab7fc2c784676a113b873466b
release_sha=84e855c0d11016ceeaed7e40c42ff10d70db8690907d883b7134c1536b135a46

if [[ -e "$stage" ]]; then
  [[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp' "$stage")" == 'root:wheel:700' ]]
  [[ -f "$stage/.academy-owned" && ! -L "$stage/.academy-owned" ]]
  [[ "$(/usr/bin/stat -f '%Su:%Sg:%Lp:%l' "$stage/.academy-owned")" == 'root:wheel:400:1' ]]
  [[ "$(/bin/cat "$stage/.academy-owned")" == 'academy-root-preflight/d6e517e3' ]]
  /bin/rm -rf "$stage"
fi
/usr/bin/install -d -o root -g wheel -m 700 "$stage" "$stage/source" "$stage/tooling"
printf 'academy-root-preflight/d6e517e3\n' > "$stage/.academy-owned"
/bin/chmod 400 "$stage/.academy-owned"
/bin/cp -R "$source"/. "$stage/source"/
for name in academy-release-cli.mjs academy-release-install.mjs academy-release-manifest.mjs academy-release-pointer.mjs academy-release-render.mjs; do
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
verify_root_file "$stage/tooling/academy-release-cli.mjs" 500 beed64ebfadd84e5a09fc79a6aca30d58290ef0fd691a30a15ea8035725139c4
verify_root_file "$stage/tooling/academy-release-install.mjs" 400 c0e653f1db0bac03ea5049ee4901a088a1f039553415d70b65411a5d6c7feca6
verify_root_file "$stage/tooling/academy-release-manifest.mjs" 400 1fe1b055d517780cfac4c43d3e0bce0af455a0ba15b643cde0559e01287be35e
verify_root_file "$stage/tooling/academy-release-pointer.mjs" 400 7cac358f35e6446e314e5cc9f884c9770b3395dcf9394221d6f61c569385fcee
verify_root_file "$stage/tooling/academy-release-render.mjs" 400 03f97f824f0c4ec3476852e85dd821dabaf45562b0049b18a06c5772bb049dde
"$stage/source/node" -e 'const fs=require("fs"),old=process.argv[1],next=process.argv[2],input=process.argv[3],output=process.argv[4];const walk=v=>typeof v==="string"?v.split(old).join(next):Array.isArray(v)?v.map(walk):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;fs.writeFileSync(output,JSON.stringify(walk(JSON.parse(fs.readFileSync(input,"utf8"))))+"\n",{mode:0o600,flag:"wx"})' "$source" "$stage/source" "$input" "$stage/package.json"
/usr/sbin/chown root:wheel "$stage/package.json"
verify_root_file "$stage/package.json" 600 4d45a1346495973f82b67979d2ef0cdde30342e894bf44d93e512c77438921ef

umask 022
"$stage/source/node" "$stage/tooling/academy-release-cli.mjs" render "$stage/package.json" "$stage/rendered" > "$stage/render-result.json"
umask 077
"$stage/source/node" -e 'const fs=require("fs"),v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(v.status!=="RENDERED"||v.releaseRevision!==process.argv[2]||v.releaseSha256!==process.argv[3])process.exit(1)' "$stage/render-result.json" "$revision" "$release_sha"
"$stage/source/node" "$stage/tooling/academy-release-cli.mjs" install "$stage/rendered" /opt/academy "$release_sha" "$revision" > "$stage/install-result.json"
"$stage/source/node" "$stage/tooling/academy-release-cli.mjs" verify /opt/academy "$release_sha" "$revision" > "$stage/verify-result.json"

db_root=/opt/academy/production-db
state_root=/private/var/root/academy-production-state
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
printf 'ACADEMY_SINGLE_PROMPT_PREFLIGHT_PASS\n'
