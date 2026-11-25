-- Neon Postgres (project ufsc-calendario, São Paulo). Nothing here names a student: accounts are
-- an HMAC of the Moodle user id (user_key), and every payload is AES-256-GCM (server/crypto.ts).

-- Manual absences ("Manual" tab), one row per account, synced across devices. They only last for
-- their semester: `semester` is the newest one in the payload, and the row is deleted when the next
-- semester starts (api/jobs/delete-past-semesters.ts; the calendar is in shared/semester.ts).
create table if not exists manual_notes (
  user_key text primary key,
  payload text not null,
  semester text not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- Anonymous usage for the local panel: when each account first and last opened the app.
create table if not exists app_usage (
  user_key text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_days integer not null default 1
);

-- How many accounts opened the app on each day (America/Sao_Paulo). Counts only.
create table if not exists daily_usage (
  day date primary key,
  users integer not null default 0
);

-- Bug reports sent from the profile. Anonymous: no user_key; the payload is bound to the id.
-- Resolving one in the local panel deletes it.
create table if not exists bug_reports (
  id uuid primary key,
  created_at timestamptz not null default now(),
  payload text not null
);
create index if not exists bug_reports_created_at on bug_reports (created_at desc);
