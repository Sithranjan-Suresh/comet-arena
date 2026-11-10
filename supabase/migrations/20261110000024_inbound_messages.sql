-- Task 120: newsletters sent to our inbound address are stored here by the webhook and parsed by the
-- ingest-dept job. Service-role only (RLS on, no policies, no grants).
create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  sender text not null,
  subject text not null default '',
  body text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.inbound_messages enable row level security;
create index inbound_messages_unprocessed_idx on public.inbound_messages (received_at) where processed_at is null;
