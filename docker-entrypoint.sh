#!/bin/sh
set -e

echo "==> Waiting for PostgreSQL database to become available..."
until node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect()
  .then(() => { client.end(); process.exit(0); })
  .catch(() => process.exit(1));
" 2>/dev/null; do
  echo "Database is unavailable - sleeping 1s"
  sleep 1
done

echo "==> Database is ready! Running migrations..."
npm run db:migrate

echo "==> Seeding database with demo host and events..."
npm run db:seed

echo "==> Starting Slotbook application server..."
exec npm start
