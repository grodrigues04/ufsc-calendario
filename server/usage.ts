// Anonymous usage, read only by the local panel (panel/):
// - app_usage: per account key, the first and last time the app was opened and on how many days;
// - daily_usage: how many accounts opened the app on each day (a count, no account keys).
// Nothing else: no name, no Moodle id, no device.

import { database } from './storage.js'

/**
 * Counts an opening of the app (the app loads the manual absences every time it opens).
 * Writes at most once every few minutes per account, plus once on each new day.
 */
export async function recordVisit(accountKey: string): Promise<void> {
  // All parts see the row as it was before this visit: `previous` tells whether today is a new day.
  await database()`
    with previous as (
      select last_seen_at from app_usage where user_key = ${accountKey}
    ), today as (
      select (now() at time zone 'America/Sao_Paulo')::date as day
    ), visit as (
      insert into app_usage as usage (user_key) values (${accountKey})
      on conflict (user_key) do update set
        last_seen_at = now(),
        active_days = usage.active_days
          + ((usage.last_seen_at at time zone 'America/Sao_Paulo')::date < (select day from today))::int
      where usage.last_seen_at < now() - interval '5 minutes'
        or (usage.last_seen_at at time zone 'America/Sao_Paulo')::date < (select day from today)
    )
    insert into daily_usage (day, users)
    select day, 1 from today
    where not exists (
      select 1 from previous where (previous.last_seen_at at time zone 'America/Sao_Paulo')::date >= today.day
    )
    on conflict (day) do update set users = daily_usage.users + 1`
}
