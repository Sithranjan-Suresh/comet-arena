#!/usr/bin/env bash
# Throwaway local Postgres for testing migrations + RLS without Docker/Supabase CLI.
#   scripts/db-test.sh start   -> init + start cluster, create db `comet`
#   scripts/db-test.sh reset   -> drop/recreate db, load bootstrap + all migrations
#   scripts/db-test.sh test    -> reset, then run supabase/tests/*.sql (must exit 0)
#   scripts/db-test.sh psql    -> open psql
#   scripts/db-test.sh stop
# Requires postgresql-16 + postgresql-16-pgvector. Runs as the `postgres` OS user when root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
DATA="${PGDATA_DIR:-/var/tmp/comet-pgdata}"
PORT="${PGPORT:-54329}"
DB=comet

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
psql_db() { as_pg "$PGBIN/psql -p $PORT -h /tmp -v ON_ERROR_STOP=1 -q -X $*"; }

start() {
  if [ ! -d "$DATA" ]; then
    mkdir -p "$DATA"; [ "$(id -u)" = 0 ] && chown postgres "$DATA"
    as_pg "$PGBIN/initdb -D $DATA -A trust >/dev/null"
  fi
  as_pg "$PGBIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp' -l $DATA/log -w start" >/dev/null || true
}
reset() {
  start
  as_pg "$PGBIN/psql -p $PORT -h /tmp -q -X -d postgres -c 'drop database if exists $DB' -c 'create database $DB'"
  psql_db "-d $DB -f $ROOT/supabase/tests/bootstrap.sql"
  for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
    echo "apply $(basename "$f")"; psql_db "-d $DB -f $f"
  done
}
case "${1:-}" in
  start) start ;;
  reset) reset ;;
  test)
    reset
    for f in $(ls "$ROOT"/supabase/tests/[0-9]*.sql 2>/dev/null | sort); do
      echo "test $(basename "$f")"; psql_db "-d $DB -f $f"
    done
    echo "DB tests passed" ;;
  psql) as_pg "$PGBIN/psql -p $PORT -h /tmp -d $DB" ;;
  stop) as_pg "$PGBIN/pg_ctl -D $DATA stop" ;;
  *) echo "usage: $0 start|reset|test|psql|stop"; exit 1 ;;
esac
