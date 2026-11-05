# Slotbook — Docker Setup and Run Guide
**A Comprehensive, Production-Grade Operator's Guide for Windows 11 & WSL 2 Arch Linux**

This guide provides step-by-step instructions to configure, run, test, inspect, and troubleshoot **Slotbook** using Docker and Docker Compose inside an Arch Linux WSL 2 environment on Windows 11.

---

## 1. Prerequisites & Environment Verification

Before starting, verify your terminal environment. Open your WSL 2 Arch Linux terminal and execute:

```bash
uname -a
node --version
npm --version
git --version
docker --version
docker compose version
```

### Expected Output Summary
- **OS Kernel**: Linux 6.x (WSL 2 standard kernel).
- **Node.js**: v18+ (tested with v20 and v26).
- **Git**: v2.40+.
- **Docker Engine / CLI**: Docker v24+ or v29+.
- **Docker Compose**: Compose v2.20+ or v5+.

### Docker Desktop WSL 2 Integration vs. Native Docker Engine
- **If using Docker Desktop on Windows**: Ensure **Settings &rarr; Resources &rarr; WSL Integration** is enabled for `archlinux`. The Windows Docker Desktop daemon will seamlessly forward commands to `docker` inside WSL 2. **Do not install or start a separate native `dockerd` daemon inside WSL** if Docker Desktop is already running.
- **If using Native Docker inside Arch Linux**: Ensure the daemon is running before invoking compose:
  ```bash
  sudo systemctl start docker
  # Or start in background:
  sudo dockerd > /dev/null 2>&1 &
  ```
- **Permission Check**: Add your user to the `docker` group so `sudo` is not required:
  ```bash
  sudo usermod -aG docker $USER
  ```

---

## 2. Clone the Repository

Clone the repository into your preferred workspace directory:

```bash
mkdir -p ~/projects
cd ~/projects

git clone https://github.com/tiruk007/slotbooking.git
cd slotbooking
```

Inspect the repository tree:
```bash
ls -la
```

---

## 3. Environment Configuration

Slotbook provides a template `.env.example` file. Copy it to create your active `.env`:

```bash
cp .env.example .env
```

### Complete Environment Variable Reference

| Variable | Required | Default in `.env.example` | Purpose & Context |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://postgres:postgres@localhost:5432/slotbook` | Primary PostgreSQL connection string used by Next.js and Drizzle ORM. Inside Docker, this is automatically set to `postgresql://postgres:postgres@postgres:5432/slotbook`. |
| `TEST_DATABASE_URL` | **Yes** | `postgresql://postgres:postgres@localhost:5432/slotbook_test` | Dedicated database for executing the concurrency and reliability test suite without altering development data. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | `http://localhost:3000` | Canonical client-side origin for generating booking links and absolute redirect URLs. |
| `SESSION_SECRET` | **Yes** | `slotbook_production_secure_secret_key_...` | 32+ character cryptographic secret key used to sign and verify HTTP-only host session cookies. |
| `NODE_ENV` | Optional | `development` (or `production` in Docker) | Node runtime environment mode. |
| `POSTGRES_PORT` | Optional | `5433` (in Docker Compose) | The host port mapped to PostgreSQL's internal port `5432`. Defaults to `5433` to prevent collision with any existing local PostgreSQL service running on `5432`. |
| `PORT` | Optional | `3000` | Application HTTP listen port inside the container. |

> [!NOTE]
> Never commit `.env` or production passwords/secrets to Git. The `.gitignore` file enforces exclusion of all `.env*` files except `.env.example`.

---

## 4. Start Using Docker Compose

Run the entire application stack (PostgreSQL 16 + Next.js App) with:

```bash
docker compose up --build
```

### What Happens Internally During Startup:

1. **Image Build (`app` service)**:
   - Docker executes `Dockerfile` in three stages:
     - `deps`: Caches `package.json` and installs production/development dependencies.
     - `builder`: Compiles TypeScript and builds the Next.js App Router production bundle (`next build`).
     - `runner`: Lightweight runtime image based on `node:20-alpine` with `libc6-compat` and `postgresql-client`.
2. **Database Container Initialization (`postgres` service)**:
   - Starts `postgres:16-alpine`.
   - Initializes PostgreSQL cluster with default database `slotbook` and credentials `postgres:postgres`.
3. **Health Check Probing**:
   - Docker monitors PostgreSQL readiness using the native probe:
     `pg_isready -U postgres -d slotbook`
   - The probe retries every 3 seconds until healthy.
4. **App Service Startup Coordination**:
   - The `app` container waits for `postgres` to become healthy via:
     `depends_on: { postgres: { condition: service_healthy } }`
5. **Entrypoint Script Execution (`docker-entrypoint.sh`)**:
   - The container script polls PostgreSQL over the internal Docker network.
   - Once connected, it executes migrations:
     `npm run db:migrate` &rarr; enables `btree_gist`, creates all 8 tables, indexes, and GiST exclusion constraints.
6. **Automatic Seeding**:
   - Executes `npm run db:seed` &rarr; inserts demo host `alex@slotbook.dev`, three event types (30-min chat, 60-min strategy session, 4-seat workshop), and Mon–Fri availability windows.
7. **Server Launch**:
   - Next.js production server starts: `npm start` (listening on `0.0.0.0:3000`).
8. **Ready State**:
   - The application becomes accessible at `http://localhost:3000`.

---

## 5. Background Execution (Detached Mode)

To run the stack in the background without occupying your terminal:

```bash
docker compose up -d --build
```

### Inspecting Running Containers

```bash
docker compose ps
```

Expected output:
```text
NAME                IMAGE             COMMAND                  SERVICE    STATUS                   PORTS
slotbook-app        slotbooking-app   "./docker-entrypoint…"   app        Up (healthy)             0.0.0.0:3000->3000/tcp
slotbook-postgres   postgres:16-alpine "docker-entrypoint.s…"  postgres   Up (healthy)             0.0.0.0:5433->5432/tcp
```

---

## 6. Viewing Logs

Stream unified logs for all services:
```bash
docker compose logs -f
```

Stream logs for individual services using their exact service names:

```bash
# Application server logs (HTTP requests, errors, outbox events)
docker compose logs -f app

# PostgreSQL database server logs
docker compose logs -f postgres
```

---

## 7. PostgreSQL Database Access

Connect to the PostgreSQL database running inside the Docker container using `docker compose exec`:

```bash
docker compose exec postgres psql -U postgres -d slotbook
```

### Useful SQL Inspection Queries

Inspect all schema tables:
```sql
\dt
```

Check the active reservations table (GiST exclusion protected):
```sql
SELECT id, host_id, event_type_id, booking_id, buffered_range FROM active_reservations;
```

Inspect bookings:
```sql
SELECT id, guest_name, guest_email, status, start_at, end_at, hold_expires_at FROM bookings ORDER BY created_at DESC;
```

Inspect configured event types:
```sql
SELECT id, name, slug, duration_minutes, capacity, buffer_before, buffer_after FROM event_types;
```

Inspect idempotency records:
```sql
SELECT id, key, request_hash, response_status, created_at FROM idempotency_keys;
```

Inspect transactional notification outbox:
```sql
SELECT id, booking_id, event_type, delivery_status, created_at FROM notification_outbox;
```

Exit the `psql` console:
```sql
\q
```

---

## 8. Application Access & Demo URLs

Once the containers are running, navigate to these URLs in your web browser:

| Surface | URL | Description & Credentials |
|---|---|---|
| **Landing Page** | [http://localhost:3000](http://localhost:3000) | System overview, feature highlights, and quick links |
| **Host Dashboard** | [http://localhost:3000/dashboard](http://localhost:3000/dashboard) | Authenticated host administration panel |
| **Host Sign In** | [http://localhost:3000/login](http://localhost:3000/login) | **Email**: `alex@slotbook.dev`<br>**Password**: `password123` |
| **Public 1-on-1 Booking** | [http://localhost:3000/alex@slotbook.dev/30-min-chat](http://localhost:3000/alex@slotbook.dev/30-min-chat) | 30-Minute Quick Chat (Capacity: 1, 10m buffers) |
| **Public Group Booking** | [http://localhost:3000/alex@slotbook.dev/team-workshop](http://localhost:3000/alex@slotbook.dev/team-workshop) | Group Workshop (Capacity: 4, serialized row locks) |
| **Health Probe** | [http://localhost:3000/api/health](http://localhost:3000/api/health) | JSON endpoint returning DB connectivity status |
| **Slots API** | [http://localhost:3000/api/hosts/alex@slotbook.dev/events/30-min-chat/slots](http://localhost:3000/api/hosts/alex@slotbook.dev/events/30-min-chat/slots) | Public slots query endpoint |

---

## 9. Running Automated Tests

The test suite validates concurrency, idempotency, hold timeouts, and DST edge cases.

### Option A: Execute Tests Inside the Running App Container
```bash
docker compose exec app npm test
```

### Option B: Execute Tests Locally Against Host PostgreSQL
If you have local Node.js and PostgreSQL running:
```bash
npm test
```

### Why Concurrency Tests Require Real PostgreSQL
Slotbook's double-booking prevention relies on:
1. **GiST Exclusion Constraints (`btree_gist`)**: Requires PostgreSQL's internal spatial indexing engine to evaluate overlapping timestamp ranges (`tstzrange && tstzrange`). In-memory SQLite or mock databases do not support GiST exclusion.
2. **Row-Level Locks (`SELECT ... FOR UPDATE`)**: Relies on PostgreSQL's actual lock manager and transaction isolation (`READ COMMITTED`) to serialize concurrent transactions.

---

## 10. Stopping the Application

To gracefully stop and remove containers and networks:

```bash
docker compose down
```

### Preserving vs. Deleting Database Data

```bash
# Normal shutdown (PRESERVES database data in the pgdata volume):
docker compose down

# Destructive shutdown (DELETES the database volume):
docker compose down -v
```

> [!CAUTION]
> Running `docker compose down -v` permanently destroys the `pgdata` volume, deleting all hosts, event types, and historical bookings. Only use `-v` if you intend to execute a full factory reset.

---

## 11. Troubleshooting Guide

### Issue 1: "address already in use: 0.0.0.0:5432"
- **Cause**: A local PostgreSQL server is already running on port `5432` on your host machine.
- **Resolution**:
  - The default `docker-compose.yml` maps to host port `5433` via `"${POSTGRES_PORT:-5433}:5432"`.
  - If you need to stop your local host PostgreSQL daemon:
    ```bash
    wsl -d archlinux -u postgres -- pg_ctl -D /var/lib/postgres/data stop
    ```

### Issue 2: "Port 3000 already in use"
- **Cause**: Another Next.js or Node.js process is occupying port 3000.
- **Resolution**: Identify and terminate the occupying process:
  ```bash
  sudo ss -tulpn | grep 3000
  # Or kill the process:
  sudo fuser -k 3000/tcp
  ```

### Issue 3: Docker daemon unavailable ("Cannot connect to the Docker daemon")
- **Cause**: Docker service is not running in WSL.
- **Resolution**:
  - If using Docker Desktop: Start Docker Desktop in Windows and verify WSL integration.
  - If using standalone Docker:
    ```bash
    sudo systemctl start docker
    # Or start daemon manually:
    sudo dockerd > /dev/null 2>&1 &
    ```

### Issue 4: "Container slotbook-postgres not healthy"
- **Cause**: PostgreSQL initialization failed or crashed due to corrupted volume.
- **Diagnosis**:
  ```bash
  docker compose logs postgres
  ```
- **Reset Volume**:
  ```bash
  docker compose down -v
  docker compose up --build
  ```

### Issue 5: Windows Browser Cannot Reach `http://localhost:3000`
- **Cause**: WSL 2 networking bridge firewall or mirror mode issue.
- **Resolution**:
  - Find your WSL IP address:
    ```bash
    ip addr show eth0 | grep "inet\b" | awk '{print $2}' | cut -d/ -f1
    ```
  - Try opening `http://<WSL_IP>:3000` in your Windows browser.
  - Ensure Windows Defender is not blocking incoming connections on port 3000.

### Issue 6: Migration or Seed Failure on Startup
- **Diagnosis**:
  ```bash
  docker compose logs app
  ```
- **Manual Migration Run**:
  ```bash
  docker compose exec app npm run db:migrate
  docker compose exec app npm run db:seed
  ```
