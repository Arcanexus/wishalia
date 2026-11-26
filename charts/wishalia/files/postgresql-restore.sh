# Runs in the image of the new major version, after postgresql-dump.sh. It makes the new data
# folder aside (<folder>.upgrading) with the image's own steps, restores the dump in it, and only
# then renames it: the server never starts on a half-made database. A failed attempt is thrown
# away and redone at the next start.
set -Eeo pipefail
new="/var/lib/postgresql/${TO_MAJOR}/docker"
dump="/var/lib/postgresql/upgrade/from-${FROM_MAJOR}.dump"
if [ -s "$new/PG_VERSION" ] || [ ! -s "$dump" ]; then
  exit 0
fi
echo "Restoring the PostgreSQL ${FROM_MAJOR} dump into ${TO_MAJOR}"
export PGDATA="$new.upgrading"
rm -rf "$PGDATA"
# The image's entrypoint, sourced for its functions only (it does not start the server)
source /usr/local/bin/docker-entrypoint.sh
docker_setup_env
docker_create_db_directories
docker_init_database_dir
pg_setup_hba_conf
docker_temp_server_start postgres
docker_setup_db
pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --single-transaction "$dump"
docker_temp_server_stop
mv "$PGDATA" "$new"
mv "$dump" "$dump.restored"
echo "PostgreSQL ${TO_MAJOR} is ready; the ${FROM_MAJOR} folder is kept, delete it once all is well"
