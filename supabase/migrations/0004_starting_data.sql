-- Nestly database, part 4 of 4: the data every install starts with.
-- Universities with their student email domains and semester calendars, and the subscription price.
-- Check each domain is really what that university gives students before launch.

insert into public.universities (id, name, short, domain, area, lat, lng, sems) values
  ('ucu', 'Uganda Christian University', 'UCU Mukono', 'ucu.ac.ug', 'Mukono', 0.3536, 32.7553,
    '[{"start": "2027-01-11", "end": "2027-05-14"}, {"start": "2027-08-09", "end": "2027-12-10"}]'),
  ('mak', 'Makerere University', 'Makerere', 'mak.ac.ug', 'Kampala', 0.3349, 32.5677,
    '[{"start": "2027-01-18", "end": "2027-05-21"}, {"start": "2027-08-16", "end": "2027-12-17"}]'),
  ('kyu', 'Kyambogo University', 'Kyambogo', 'kyu.ac.ug', 'Kyambogo', 0.3509, 32.6297, null),
  ('mubs', 'Makerere University Business School', 'MUBS', 'mubs.ac.ug', 'Nakawa', 0.3264, 32.6178, null)
on conflict (id) do nothing;

insert into public.config (id, sub_fee, per_hostel, grace_days) values (1, 50000, true, 7)
on conflict (id) do nothing;
