-- MonitorHub - cadastro de usuarios e alertas de preco no Supabase
-- Rode este arquivo no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.monitorhub_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_name text,
  whatsapp_phone text,
  product_query text not null,
  brand text,
  source text not null default 'all'
    check (source in ('all', 'amazon', 'mercadolivre')),
  target_price numeric(12, 2) not null
    check (target_price > 0),
  notification_channel text not null default 'email'
    check (notification_channel in ('email', 'whatsapp', 'both')),
  status text not null default 'active'
    check (status in ('active', 'paused')),
  last_notified_at timestamptz,
  matched_product_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitorhub_alert_notifications (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.monitorhub_price_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  product_key text not null,
  product_title text not null,
  product_price numeric(12, 2),
  product_url text,
  message text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists monitorhub_price_alerts_user_idx
  on public.monitorhub_price_alerts (user_id, created_at desc);

create index if not exists monitorhub_price_alerts_active_idx
  on public.monitorhub_price_alerts (status, source, target_price);

create index if not exists monitorhub_alert_notifications_alert_idx
  on public.monitorhub_alert_notifications (alert_id, created_at desc);

alter table public.monitorhub_price_alerts enable row level security;
alter table public.monitorhub_alert_notifications enable row level security;

drop policy if exists "monitorhub users can read own alerts" on public.monitorhub_price_alerts;
create policy "monitorhub users can read own alerts"
  on public.monitorhub_price_alerts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "monitorhub users can insert own alerts" on public.monitorhub_price_alerts;
create policy "monitorhub users can insert own alerts"
  on public.monitorhub_price_alerts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "monitorhub users can update own alerts" on public.monitorhub_price_alerts;
create policy "monitorhub users can update own alerts"
  on public.monitorhub_price_alerts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "monitorhub users can delete own alerts" on public.monitorhub_price_alerts;
create policy "monitorhub users can delete own alerts"
  on public.monitorhub_price_alerts
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "monitorhub users can read own notifications" on public.monitorhub_alert_notifications;
create policy "monitorhub users can read own notifications"
  on public.monitorhub_alert_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);
