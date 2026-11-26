# Runs in the image of the previous major version (postgresql.upgrade.fromImage), before the
# server. When the volume holds the data of that version and none of the new one yet, it starts
# the old server on its socket only, dumps the database and stops it. The old folder is left as it
# is, to go back to the previous image if needed.
set -eu
old="/var/lib/postgresql/${FROM_MAJOR}/docker"
new="/var/lib/postgresql/${TO_MAJOR}/docker"
dump="/var/lib/postgresql/upgrade/from-${FROM_MAJOR}.dump"
if [ ! -s "$old/PG_VERSION" ] || [ -s "$new/PG_VERSION" ] || [ -s "$dump" ]; then
  exit 0
fi
echo "PostgreSQL ${FROM_MAJOR} data found: dumping it for ${TO_MAJOR}"
mkdir -p /var/lib/postgresql/upgrade
pg_ctl -D "$old" -w -t 600 \
  -o "-c listen_addresses='' -c unix_socket_directories=/var/run/postgresql" start
pg_dump -h /var/run/postgresql -U "$POSTGRES_USER" -Fc -f "$dump.part" "$POSTGRES_DB"
pg_ctl -D "$old" -m fast -w -t 600 stop
mv "$dump.part" "$dump"
echo "Dumped to $dump"
