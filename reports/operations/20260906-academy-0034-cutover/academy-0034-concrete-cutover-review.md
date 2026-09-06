# Academy concrete cutover review

No execution by reviewer. Current candidate standby deployment94dd9d6d-5449-4c02-8253-c87e9ddd459a: old90c390@100, maintenancef126@0. Target application candidatebd109 retainedinactive.

ExactSQL reviewed wrapper11f942279ea4012566e9f49b5563b7b3d33c73ea89f30cff96d50a5928a96e4f at academy-0034-reviewed-wrapper-r2.sql; exactmigration6355c54a... unchanged.
ActualproductionROLLBACK passed0, schema+ownerbytes equal003eb7eeccd4c5167152ddbb52857b362c1c6f2d6b90f7d2249fb86300dce036. Receipt academy-0034-production-rollback-r2.json. Existing1session has no unexpired120s representative: skip recorded, not an active-cookie proof. Localactivecookiecompatibility provedseparately.

AuthenticatedAccessCLIlogin0, homepage200/coursepreviews; actualSafarihomepagecapture. Maintenance0callback303/sign-in identity-unavailable/noSetCookie; sameinputoldversion1bindingexpiry cookie, sooverridebehavior distinguished. Canonicalstart/api/auth/identity/start303identity-unavailable/nocookie; dashboard307signin/nocookie. Receipts academy-maintenance-paired-callback.json, academy-maintenance-canonical-start.json, academy-maintenance-start-dashboard.json (its earlier /auth/start404 is explicitly NOT canonicalproof).

Ordered execution:
1. Recheck expecteddeployment94dd and threeversionIDs/exactcode/scriptidentity; prepareforward/abort CLIcommands beforetraffic.
2. Wrangler versionsdeploy f126@100 bd109@0; verifyactualdeployment and canonicalcallback/startno-cookie behavior withoutoverride.
3. Wait >=35s, proveactiveclaims0 and noheldidentity-table locks, whileallauthruntime disabled.
4. Run academy-0034-backup-host.py (sameexisting protectedpg_dump -Fc --schema=academy method; newexclusive0700dir+0600archive, fsync, sha, pg_restore --list). No dump values leavehost.
5. Re-run sameexact reviewedwrapper with academy-0034-host-rehearsal.py modefalse; verifyROLLBACK0+schemaunchanged whilemaintenanceactive.
6. Run academy-0034-host-commit.py onlywithverifiedbackupreceipt/expectedbaseline003eb; exactsamewrapper+SQL, commandmode true. Verify COMMITobserved+postconditions marker, sessioncount/aggregatedigests/owners/grants.
7. Immediately versionsdeploy bd109@100; verifyactualdeployment/currentversion; GET root/signin/hostgate/callback shape. Production0034postverify counts+grant/marker read-only. No reusefounderOTP/cookie ascanary; actualnewlearnerjourney remainsseparateproof.

Recovery: beforeCOMMITorprovenrolledback, old90@100 possible; afterCOMMIToruncertaincommit doNOTreturnold90. Querymarker/schema/ownersfirst; retainmaintenance andforwardbd109. NeverautoretryCOMMITontransportfailure. DBrestoreisnotroutinecompensation andhasnoproventwo-tableprocedure; no restore authorizedbythispacket.

Scopeofreview: guards/ordering/source+backupbinding/secret-safeoutput andboundedrecovery, especiallyroot-authoredhostcommit.py. Do notinventanotherapprovalgate; author/independentreviewer evidence remainsseparate. Rootoperator hascurrentownerliveauthority/budget50; no ownerdecisionneededforroutine reversiblecutover.
