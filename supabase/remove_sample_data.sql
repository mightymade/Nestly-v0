-- Removes the Nestly sample data: the sample hostels and every sample account, with everything that belongs to them.
-- Real accounts and real hostels are not touched. Run it in Supabase > SQL Editor.

begin;
delete from public.hostels where id in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15', 'h16', 'h17', 'h18', 'h20', 'h19');
delete from public.invites where code in ('HILL-4821');
delete from public.audit where id in ('a9', 'a2', 'a1', 'a8', 'a3', 'a7', 'a4', 'a5', 'a6');
delete from auth.users where lower(email) in (
  'sarah.atim@ucu.ac.ug',
  'peter.kizito@gmail.com',
  'grace.namuli@gmail.com',
  'daniel.okello@gmail.com',
  'robert.mutebi@gmail.com',
  'moses.ssekandi@gmail.com',
  'annet.kyomuhendo@gmail.com',
  'sarah.nakato@gmail.com',
  'ruth.akello@gmail.com',
  'joseph.waiswa@gmail.com',
  'collins.wasswa1@ucu.ac.ug',
  'prossy.nalwoga2@ucu.ac.ug',
  'brian.okello3@ucu.ac.ug',
  'joan.nansubuga4@ucu.ac.ug',
  'ivan.ssali5@ucu.ac.ug',
  'allan.byaruhanga6@ucu.ac.ug',
  'kevin.ouma7@ucu.ac.ug',
  'grace.achieng8@ucu.ac.ug',
  'esther.namara9@ucu.ac.ug',
  'ruth.nakku10@ucu.ac.ug',
  'daphne.atim11@ucu.ac.ug',
  'lydia.akol12@ucu.ac.ug',
  'moses.kato13@ucu.ac.ug',
  'paul.mugisha14@ucu.ac.ug',
  'henry.opio15@ucu.ac.ug',
  'agnes.nambi16@ucu.ac.ug',
  'faith.akello17@ucu.ac.ug',
  'mercy.auma18@ucu.ac.ug',
  'hassan.lubega19@ucu.ac.ug',
  'tonny.kato20@ucu.ac.ug',
  'rita.nankya@ucu.ac.ug',
  'simon.lule@ucu.ac.ug',
  'pamela.adong@ucu.ac.ug',
  'martin.ochieng@ucu.ac.ug',
  'juliet.kemigisha@ucu.ac.ug',
  'ben.twinomujuni@ucu.ac.ug',
  'patience.akello@ucu.ac.ug',
  'derrick.mukasa@ucu.ac.ug',
  'sharon.nakato@ucu.ac.ug',
  'isaac.opio@ucu.ac.ug',
  'winnie.atuhaire@ucu.ac.ug',
  'edwin.kato@ucu.ac.ug',
  'lydia.namutebi@ucu.ac.ug',
  'allan.mugerwa@ucu.ac.ug',
  'rose.achieng@ucu.ac.ug',
  'henry.ssali@ucu.ac.ug',
  'grace.amony@ucu.ac.ug',
  'moses.waiswa@ucu.ac.ug'
);
commit;
