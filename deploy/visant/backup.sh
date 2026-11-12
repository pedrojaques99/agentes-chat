#!/bin/sh
# Daily dump of the agentes.chat database on Visant's VPS, the last 14 kept in /opt/agentes/backups.
# The compose `backup` profile needs an S3 bucket; this one stays on the machine.
# Install (as root, once):
#   install -m 700 deploy/visant/backup.sh /opt/agentes/backup.sh
#   (crontab -l; echo "17 4 * * * /opt/agentes/backup.sh >> /var/log/agentes-backup.log 2>&1") | crontab -
# Restore: gunzip -c backups/agentes-<date>.sql.gz | docker compose exec -T postgres psql -U agentes agentes
set -e
cd /opt/agentes
install -d -m 700 backups
f=backups/agentes-$(date +%F).sql.gz
docker compose exec -T postgres pg_dump -U agentes agentes | gzip > "$f.tmp"
mv "$f.tmp" "$f"
ls -1t backups/agentes-*.sql.gz | tail -n +15 | xargs -r rm -f
