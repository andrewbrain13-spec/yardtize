-- An operator flag for the pilot admin screen.
--
-- The obvious version of this — an ADMIN_EMAILS environment variable — would
-- work, but it puts the guest list in a place only a deploy can change. A
-- column travels with the account.
--
-- The catch is that profiles already lets a user update their own row, which
-- would let anyone flip their own flag to true. Postgres column privileges fix
-- that, but a table-level UPDATE grant covers every column, so the table-level
-- grant has to come off first and the editable columns be handed back by name.
-- Anything added to profiles later is read-only to its owner until it is added
-- to this list on purpose — the safe direction for that mistake to fail.

alter table profiles add column is_admin boolean not null default false;

revoke update on profiles from authenticated;
grant update (role, full_name) on profiles to authenticated;

-- The founder's two accounts.
update profiles
   set is_admin = true
 where email in ('abrain@braingroup.com', 'andrew.brain13@gmail.com');
