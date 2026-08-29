-- Production receives migrations, not the local-only seed replay. Keep the
-- reviewed Israel discovery fallbacks in migration history so every hosted
-- environment has the same required reference catalog after `db push`.
insert into public.cities (id, slug, name_en, center, active)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'jerusalem',
    'Jerusalem',
    extensions.st_setsrid(extensions.st_makepoint(35.21633, 31.76904), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'tel-aviv-yafo',
    'Tel Aviv-Yafo',
    extensions.st_setsrid(extensions.st_makepoint(34.78057, 32.08088), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    'haifa',
    'Haifa',
    extensions.st_setsrid(extensions.st_makepoint(34.99928, 32.81303), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    'rishon-lezion',
    'Rishon LeZion',
    extensions.st_setsrid(extensions.st_makepoint(34.78939, 31.97102), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000005',
    'petah-tikva',
    'Petah Tikva',
    extensions.st_setsrid(extensions.st_makepoint(34.88747, 32.08707), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000006',
    'netanya',
    'Netanya',
    extensions.st_setsrid(extensions.st_makepoint(34.85917, 32.33294), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000007',
    'ashdod',
    'Ashdod',
    extensions.st_setsrid(extensions.st_makepoint(34.64966, 31.79213), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000008',
    'bnei-brak',
    'Bnei Brak',
    extensions.st_setsrid(extensions.st_makepoint(34.83380, 32.08074), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000009',
    'holon',
    'Holon',
    extensions.st_setsrid(extensions.st_makepoint(34.77918, 32.01034), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000010',
    'beer-sheva',
    'Be''er Sheva',
    extensions.st_setsrid(extensions.st_makepoint(34.79130, 31.25181), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    'ramat-gan',
    'Ramat Gan',
    extensions.st_setsrid(extensions.st_makepoint(34.81065, 32.08227), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    'rehovot',
    'Rehovot',
    extensions.st_setsrid(extensions.st_makepoint(34.81199, 31.89421), 4326)::extensions.geography,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000013',
    'ashkelon',
    'Ashkelon',
    extensions.st_setsrid(extensions.st_makepoint(34.57149, 31.66926), 4326)::extensions.geography,
    true
  )
on conflict (id) do update
set slug = excluded.slug,
    name_en = excluded.name_en,
    center = excluded.center,
    active = excluded.active;

do $migration$
begin
  if (select count(*) from public.cities where active) < 13 then
    raise exception 'Hosted city catalog migration did not produce at least 13 active fallbacks.';
  end if;
end;
$migration$;
