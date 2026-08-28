# Huddle pilot runbooks

These short runbooks are for the two project owners. Never paste a token, session,
report narrative, private address, or service-role key into an issue, PR, log, or
screenshot.

## Failed or stale sports sync

1. Check the safe sync outcome/run ID and provider freshness banner; do not retry
   repeatedly while a run is already active.
2. Confirm the provider status and quota outside public logs. Keep the last good
   catalog serving; never clear it as a recovery step.
3. Correct the server secret/provider configuration in the managed secret store,
   then run one protected sync and verify the safe run summary.
4. If still failing, leave catalog data intact, record the run ID and public error
   code, and pause manual retries.

## Token or secret rotation

1. Create the replacement in the provider or hosting secret store. Never commit it.
2. Update the relevant Vercel/Supabase/GitHub secret and redeploy/restart the one
   consumer. For `SPORTS_SYNC_SECRET`, update caller and receiver in one window.
3. Run the smallest authorized smoke check, then revoke the old credential.
4. Run `npm run security:audit`. If exposure is suspected, rotate first and then
   assess Git history/artifacts; deleting one current file is not remediation.

## Bad database migration

1. Stop new deployment/migration attempts and preserve the exact failing output.
2. Keep the current hosted database and backups intact. Never hand-edit production
   schema to make a migration appear successful.
3. Reproduce from `npm run db:reset` locally, add a forward corrective migration
   and a regression test, then run the complete database/type drift gates.
4. Deploy the reviewed forward migration. Restore from a verified backup only when
   forward correction cannot protect data, with both owners present.

## Account, group, venue, or event suspension

1. Confirm the target and report evidence in the platform-only queue; group admins
   do not receive report access.
2. Choose the least severe effective action, record a bounded reason, and verify the
   transactional product-state and audit result.
3. Confirm affected visibility, mutation, attendance, and future home-location reads
   are denied. Preserve attendance and invitation history.
4. Keep the safety center and appeal route reachable. A different moderator reviews
   the appeal where practical. Reverse only through the audited reversal path.
5. Review timed actions at expiry and record a reversal/outcome; do not edit profile
   suspension columns directly.

## Urgent report or harmful content removal

1. The interface tells the reporter that Huddle is not an emergency service. If
   danger is immediate, direct them to local emergency services while preserving
   their ability to submit the report.
2. Assign the report promptly and avoid copying its narrative outside the protected
   queue. Do not reveal reporter identity to targets or group administrators.
3. Apply the narrowest safe action: correction/removal, warning, restriction,
   suspension, cancellation, or ban. Record the reason and verify the public content
   or access is actually removed.
4. Retain audit evidence and provide the affected owner/user the appeal route. Do
   not expose private addresses during moderation; ordinary moderators have no
   exceptional address-access path.
