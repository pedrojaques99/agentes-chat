#!/usr/bin/env bash
# Puts the fork's visant/build in production on this VPS, in one command:
#   ssh root@<vps> bash /opt/agentes/src/deploy/visant/update.sh
#
# 1. pulls visant/build into /opt/agentes/src (fast-forward only)
# 2. stops if production already runs that commit
# 3. backs the database up to /opt/agentes/backups (keeps the last 14)
# 4. builds agentes-visant:<sha>
# 5. points AGENTES_IMAGE in .env at it and restarts the app (migrations run on boot)
# 6. waits for "healthy"; if it never comes, puts the previous image back and says so
# 7. removes the previous image and the build cache (the disk is shared with Coolify's apps)
set -euo pipefail

ROOT=/opt/agentes
SRC=$ROOT/src
APP=agentes-agentes-1
DB=agentes-postgres-1

say() { printf '\n== %s\n' "$*"; }

cd "$SRC"
say "Pulling visant/build"
git pull --ff-only -q origin visant/build
SHA=$(git rev-parse --short=9 HEAD)
NEW="agentes-visant:$SHA"
OLD=$(grep '^AGENTES_IMAGE=' "$ROOT/.env" | cut -d= -f2)
echo "running: $OLD"
echo "new:     $NEW  ($(git log -1 --format=%s))"
if [ "$OLD" = "$NEW" ]; then
  echo "Production already runs this commit. Nothing to do."
  exit 0
fi

say "Backing up the database"
mkdir -p "$ROOT/backups"
DUMP="$ROOT/backups/pre-$SHA-$(date +%F-%H%M).sql.gz"
docker exec "$DB" sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$DUMP"
zcat "$DUMP" | grep -q "dump complete" || { echo "Backup incomplete: stopping before touching anything."; exit 1; }
ls -1t "$ROOT"/backups/*.sql.gz | tail -n +15 | xargs -r rm -f
echo "saved $DUMP"

say "Building $NEW"
docker build -q -t "$NEW" . >/dev/null

say "Switching to $NEW"
cd "$ROOT"
sed -i "s|^AGENTES_IMAGE=.*|AGENTES_IMAGE=$NEW|" .env
docker compose up -d agentes >/dev/null

say "Waiting for the app"
state=starting
for _ in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)
  [ "$state" = healthy ] && break
  sleep 5
done
if [ "$state" != healthy ]; then
  echo "The new version did not become healthy ($state). Last log lines:"
  docker logs --tail 30 "$APP" 2>&1 | cut -c1-240
  say "Putting $OLD back"
  sed -i "s|^AGENTES_IMAGE=.*|AGENTES_IMAGE=$OLD|" .env
  docker compose up -d agentes >/dev/null
  echo "Back on $OLD. The database backup is $DUMP (a migration that ran may need it)."
  exit 1
fi
echo "healthy on $NEW"

say "Cleaning up"
[ -n "$OLD" ] && docker rmi "$OLD" >/dev/null 2>&1 && echo "removed $OLD" || true
docker builder prune -f >/dev/null
df -h / | tail -1
say "Done: production runs $NEW"
