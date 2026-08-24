-- F03 has no product tables or accounts to seed yet.
-- Keep this file deterministic, non-secret, and free of provider dependencies.
-- Domain packages will add stable UUID-backed fixtures as their tables arrive.

do $seed$
begin
  raise notice 'Huddle F03 seed complete: no application rows required.';
end;
$seed$;
