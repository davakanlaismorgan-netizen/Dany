-- Preuve d'acceptation des CGU : horodatée côté serveur (non falsifiable par le client).
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

-- Les colonnes ne sont PAS ajoutées au GRANT UPDATE de profiles : le client ne peut pas les modifier.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accepted boolean := coalesce(new.raw_user_meta_data ->> 'accepted_terms', '') = 'true';
begin
  insert into public.profiles (id, email, full_name, company, terms_accepted_at, terms_version)
  values (
    new.id,
    coalesce(new.email, ''),
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200),
    left(nullif(new.raw_user_meta_data ->> 'company', ''), 200),
    case when v_accepted then now() end,
    case when v_accepted then left(nullif(new.raw_user_meta_data ->> 'terms_version', ''), 20) end
  );
  insert into public.subscriptions (user_id) values (new.id);
  insert into public.notification_preferences (user_id) values (new.id);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
