-- Task 70: double opt-in bookkeeping for Comet Arena Weekly.
alter table public.email_subscribers add column confirmation_sent_at timestamptz;
create unique index email_subscribers_confirm_token_key on public.email_subscribers (confirm_token);
