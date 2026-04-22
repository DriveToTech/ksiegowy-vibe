FROM postgres:17-alpine

RUN apk add --no-cache bash rclone tzdata

COPY ops/backup/run-postgres-backup.sh /usr/local/bin/run-postgres-backup.sh
COPY ops/backup/check-backup-freshness.sh /usr/local/bin/check-backup-freshness.sh

RUN chmod +x /usr/local/bin/run-postgres-backup.sh /usr/local/bin/check-backup-freshness.sh

ENTRYPOINT ["/usr/local/bin/run-postgres-backup.sh"]
