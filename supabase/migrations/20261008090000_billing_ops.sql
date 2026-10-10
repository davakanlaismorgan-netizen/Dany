-- Opérations de facturation côté serveur : remboursement/révocation et limitation de débit.

-- 1. Remboursement ---------------------------------------------------------------
alter table public.payments add column if not exists refunded_at timestamptz;

-- À appeler (service_role / SQL editor) après un remboursement fait dans le tableau de bord KKiaPay.
-- Idempotent : un second appel pour la même transaction ne retire pas deux mois.
-- Retire un mois à l'échéance (les paiements sont toujours d'un mois) ; si l'échéance est alors
-- dépassée, le compte repasse immédiatement en gratuit. Les données de l'utilisateur sont conservées.
create or replace function public.revoke_payment(p_provider text, p_transaction_id text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_end timestamptz;
  v_new timestamptz;
begin
  select * into v_pay from public.payments
   where provider = p_provider and transaction_id = p_transaction_id
   for update;
  if not found then
    raise exception 'unknown_payment' using errcode = 'P0001';
  end if;

  select current_period_end into v_end from public.subscriptions where user_id = v_pay.user_id;
  if v_pay.refunded_at is not null or v_pay.user_id is null then
    return v_end; -- déjà traité (ou compte supprimé)
  end if;

  update public.payments set refunded_at = now() where id = v_pay.id;

  v_new := coalesce(v_end, now()) - interval '1 month';
  if v_new <= now() then
    update public.subscriptions
       set plan = 'free', status = 'canceled', current_period_end = now()
     where user_id = v_pay.user_id;
    return now();
  end if;
  update public.subscriptions set current_period_end = v_new where user_id = v_pay.user_id;
  return v_new;
end;
$$;

revoke all on function public.revoke_payment(text, text) from public, anon, authenticated;
grant execute on function public.revoke_payment(text, text) to service_role;

-- 2. Limitation de débit de verify-kkiapay -------------------------------------------
-- Évite qu'un compte fasse appeler l'API KKiaPay en boucle avec des références inventées.
create table if not exists public.verify_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists idx_verify_attempts_user_at on public.verify_attempts(user_id, at desc);
alter table public.verify_attempts enable row level security;
revoke all on public.verify_attempts from anon, authenticated;

-- Renvoie true si la tentative est autorisée (et l'enregistre), false si la limite est atteinte.
create or replace function public.register_verify_attempt(p_user_id uuid, p_max integer default 10, p_window interval default interval '10 minutes')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.verify_attempts where at < now() - interval '1 day';
  select count(*) into v_count from public.verify_attempts
   where user_id = p_user_id and at > now() - p_window;
  if v_count >= p_max then
    return false;
  end if;
  insert into public.verify_attempts (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.register_verify_attempt(uuid, integer, interval) from public, anon, authenticated;
grant execute on function public.register_verify_attempt(uuid, integer, interval) to service_role;
grant select, insert, delete on public.verify_attempts to service_role;
