-- Keep this seed deterministic, non-secret, and free of provider accounts.
-- Location is address/coordinate based, so there is no city catalog to seed.
do $seed$
begin
  raise notice 'Huddle seed complete: cityless location model requires no global seed rows.';
end;
$seed$;
