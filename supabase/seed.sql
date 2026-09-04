-- Keep this seed deterministic, non-secret, and free of provider accounts.
-- Location is address/coordinate based, so there is no city catalog to seed.
-- VB01 public-venue entitlements belong only in explicit per-run test fixtures.
-- There is no permanent demo owner or venue to activate in this zero-row seed.
do $seed$
begin
  raise notice 'Huddle seed complete: cityless location model requires no global seed rows.';
end;
$seed$;
