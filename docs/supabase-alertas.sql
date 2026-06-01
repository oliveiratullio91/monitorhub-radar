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
  product_id text,
  product_key text,
  product_title text,
  product_url text,
  product_image text,
  product_source_label text,
  product_current_price numeric(12, 2),
  product_original_price numeric(12, 2),
  product_currency text not null default 'BRL',
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

alter table public.monitorhub_price_alerts
  add column if not exists product_id text,
  add column if not exists product_key text,
  add column if not exists product_title text,
  add column if not exists product_url text,
  add column if not exists product_image text,
  add column if not exists product_source_label text,
  add column if not exists product_current_price numeric(12, 2),
  add column if not exists product_original_price numeric(12, 2),
  add column if not exists product_currency text not null default 'BRL';

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

create index if not exists monitorhub_price_alerts_product_key_idx
  on public.monitorhub_price_alerts (product_key);

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

-- Fluxo sugerido no n8n:
-- 1. Apos atualizar /api/n8n/products, chame GET ou POST /api/alerts/evaluate?limit=1000
--    com markNotified=true para criar registros pendentes em monitorhub_alert_notifications.
-- 2. Chame GET /api/alerts/notifications para listar pendencias.
-- 3. Envie por Gmail/SMTP/WhatsApp no n8n.
-- 4. Marque cada notificacao com PATCH /api/alerts/notifications:
--    { "id": "...", "status": "sent" } ou { "id": "...", "status": "failed", "errorMessage": "..." }.
