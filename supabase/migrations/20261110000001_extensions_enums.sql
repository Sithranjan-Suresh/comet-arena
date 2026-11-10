-- Task 9: extensions and enums (engineering_spec §3).
-- Enum values must mirror lib/schemas/enums.ts (checked by tests/enums-sql.test.ts).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists vector with schema extensions;

create type public.ig_account_type as enum ('business', 'creator', 'personal_or_missing', 'unknown');
create type public.competition_tier as enum ('campus', 'regional', 'national');
create type public.competition_cost as enum ('free', 'paid', 'unknown');
create type public.competition_format as enum ('in_person', 'virtual', 'hybrid', 'unknown');
create type public.competition_status as enum ('live', 'unverified', 'expected', 'past', 'rejected');
create type public.source_type as enum (
  'instagram', 'submission', 'host', 'devpost', 'mlh', 'dept', 'utdclubs', 'campusgroups'
);
create type public.queue_kind as enum ('low_confidence', 'possible_duplicate');
create type public.queue_status as enum ('open', 'done');
create type public.submission_status as enum ('pending', 'published', 'queued', 'rejected', 'merged');
create type public.ingest_class as enum ('competition', 'results', 'not_competition', 'error');
create type public.post_status as enum ('open', 'closed');
create type public.entry_result as enum ('participated', 'advanced', 'finalist', 'third', 'second', 'first');
create type public.warning_window as enum ('d7', 'd1');
