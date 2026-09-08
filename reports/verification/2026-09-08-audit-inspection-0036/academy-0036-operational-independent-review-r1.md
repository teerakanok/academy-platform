# Academy0036 operational packet — bounded independent review

Verdict: PASS — ไม่พบ material security/operational blocker ใน exact metadata-only packet นี้
Reviewed 2026-09-08; read-only review, ไม่มี production/DB execution หรือ product/SQL edit โดย reviewer
Reuse source acceptance: `academy-operator-rehearsal-independent-review-r1.md`; accepted operator seam ไม่ถูก audit ใหม่
Product source `/private/tmp/academy-csp-cde63a58`, packet source release `584f3b6`; migration SHA256 `93ae2bb111bb94730907d788e7f89654b60c33be29d9aa8fb50da2fd50a0195a`

## Exact bindings
- Manifest `academy-0036-packet-manifest-r1.json` SHA256 `c8ac78a22331b10730628210b36cc869a0ae8bd429c70845f21b625c8442e2dd`
- `academy-0036-commit-r1.sql` — `5bce0fef3fdd0fbc058d0ac0c549cc94ec060c30b2fc6b383e083238265512c0`
- `academy-0036-rollback-r1.sql` — `8d44be899ef3476a3e2510d46ecfae22c130967cb994f7c1a01fa1bf62dfff9f`
- `academy-0036-inverse-commit-r1.sql` — `dac7d9934fbec72ff0c86edc8c1e8860d430bfb3fa95ea249b69124a66eb673d`
- `academy-0036-inverse-rehearsal-r1.sql` — `298feb8a7fae85632d39c13eb3af385db90e2d1722d353d5236b89ae0db551f7`
- `academy-0036-postcondition-r1.sql` — `e7a698985a8c791e465e97aef44184d4eefc67a30e30a9ad567ead03bfb53415`
- Independent `rtk proxy python3` SHA256 checks: all 5/5 files match before/after review; migration bytes embedded exactly in forward packet
- Source body MD5 independently computed: staff `678670779a4257c0268ab48ddbab169e`; entitlement `72e8b23c4d6353638958617804eb7ec4`; both match executable guards

## Forward guard and custody
- `commit:1–10`: single transaction, lock timeout2s/statement timeout10s, transaction advisory lock `academy:migration:0036`
- Guard requires database postgres/current_user supabase_admin; refuses either function name at any signature before CREATE OR REPLACE
- Requires both audit tables owned by postgres, RLS enabled/FORCE false, and both existing operator roles non-superuser/non-BYPASSRLS
- `commit:11` SET LOCAL ROLE postgres creates the two functions under the existing table owner; RESET ROLE precedes terminal transaction statement
- This is migration ownership binding only; no SET ROLE academy_staff_admin/academy_entitlement_operator, no row mutation RPC and no bootstrap/grant bypass
- Source writes only function metadata/EXECUTE ACLs; no user/staff/entitlement/audit row writes, new roles, passwords, role membership, table grants or RLS changes
- `commit:95–101` verifies exact function signature, owner, SECURITY DEFINER, STABLE, JSONB return, search_path and body MD5 before COMMIT
- ACL guard requires intended operator EXECUTE and rejects every ACL grantee outside owner/intended operator, non-EXECUTE privilege or grant option; source explicitly grants each intended operator
- Same postcondition text is embedded verbatim in forward and inverse packets; `source_embedded_exactly=True`, both `postcondition_embedded_* = True`

## Rehearsal and inverse
- Forward commit vs rollback files differ only terminal COMMIT/ROLLBACK and diagnostic marker; root must observe successful production ROLLBACK before invoking COMMIT
- Forward rehearsal exercises CREATE/ACL/postconditions then rolls everything back; a subsequent commit rechecks absence and table/role baseline from scratch
- Inverse verifies target/operator and the same owner/body/ACL properties before dropping the exact two signatures
- DROP has no CASCADE; unexpected dependencies fail the transaction rather than deleting dependents; after DROP it refuses any remaining function with either name
- Inverse rehearsal vs inverse commit differ only final ROLLBACK/COMMIT; rollback restores metadata without a whole-database restore
- Existing backup0035 may remain protected custody; this packet neither invokes nor relies on restoring all shared production data

## Actual evidence inspected
- `academy-0036-preflight-readonly-r1.json` at `2026-09-08T05:46:46.360365+00:00`: canonical SSH with StrictHostKeyChecking/BatchMode, docker psql `-X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -U supabase_admin -d postgres`; exit0
- Preflight stdout: database postgres/operator supabase_admin, newFunctions0, both audit tables owner postgres/RLS true/FORCE false
- Preflight's existingInspectors query names `inspect_staff_role_assignment` rather than existing `inspect_staff_role`; receipt proves only course inspector metadata and is not used as a staff-inspector gate
- `academy-0036-forward-inverse-local-r1.json` at `2026-09-08T05:49:05.458900+00:00`: owned local fixture, psql ON_ERROR_STOP=1, exit0, stdout two blank lock-result lines then `2`, stderr empty
- Local SQL SHA256 `1f158f3aeda70fdabb8254e28ca908d795405ad366545e485a0661d3a0f176f3` independently matches receipt
- Independently reconstructed local sequence from exact forward+inverse packets: only documented database/owner substitutions, removal of inner terminal boundaries, initial owned-function drops and final count after overall ROLLBACK; exact equality=True
- Local sequence therefore executed forward postconditions and guarded inverse; final `2` confirms original function count restored, not a separately measured post-rollback full catalog digest

## Useful claim limits
- Local success does not claim production0036 installed; no live mutation receipt was supplied for this review
- Production execution must keep the observed supabase_admin transport and ON_ERROR_STOP, complete ROLLBACK rehearsal first, then COMMIT and fresh exact postcondition readback
- This packet enables bounded audit inspection only; dedicated operator login inputs, owner bootstrap/entitlement rehearsal/apply and product journey acceptance remain separate
- No correction requested within the reviewed packet scope; this PASS records independent evidence, not additional live authority
