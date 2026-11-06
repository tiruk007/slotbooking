# Slotbook — Fresh PC Setup & Verification Guide

> **Target Audience**: Technical Reviewer / Software Architect  
> **Target Environment**: Brand-new Windows 10 / 11 PC (Zero Prerequisites)  
> **Repository**: [https://github.com/tiruk007/slotbooking.git](https://github.com/tiruk007/slotbooking.git)  
> **Primary Launch Method**: Multi-container Docker Compose with self-bootstrapping entrypoint  
> **Verified Status**: 71 of 71 Automated Tests Passing (100%)

---

## 1. Introduction

Slotbook is an enterprise-grade appointment scheduling engine built with Next.js 14, TypeScript, and PostgreSQL 16. It guarantees zero double-bookings through PostgreSQL kernel-level GiST exclusion constraints (`btree_gist`), handles timezone mathematics seamlessly across Daylight Saving Time (DST) boundaries, and eliminates dual-write notification failures via the Transactional Outbox pattern.

This document provides a complete, step-by-step setup and verification walkthrough for running Slotbook on a **brand-new Windows 10 or 11 laptop or desktop**. No Node.js or PostgreSQL installations are required on the host system; the entire application and database stack are fully containerized.

---

## 2. Windows Base Software Installation

If you are setting up a fresh Windows machine, install the following tools:

### Step 2.1 — Install Google Chrome (or Edge / Firefox)
- Download and install [Google Chrome](https://www.google.com/chrome/).

### Step 2.2 — Install Visual Studio Code
- Download and install [VS Code for Windows](https://code.visualstudio.com/).
- Recommended extensions:
  - **Docker** (`ms-azuretools.vscode-docker`)
  - **WSL** (`ms-vscode-remote.remote-wsl`)

### Step 2.3 — Install Git for Windows
- Download and install [Git for Windows](https://git-scm.com/download/win).
- During installation:
  - Choose default editor (VS Code or Notepad).
  - Under **Adjusting your line ending conversions**, select:  
    `Checkout as-is, commit Unix-style line endings` (recommended to avoid Windows CRLF issues with shell scripts).

### Step 2.4 — Install Docker Desktop for Windows
- Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/).
- During installation, ensure the checkbox **"Use WSL 2 instead of Hyper-V"** is **CHECKED**.
- Restart your computer when prompted.
- Launch Docker Desktop from the Start menu. Wait until the whale icon in the Windows taskbar stays solid green (indicating Docker daemon is running).

---

## 3. WSL 2 Verification (Windows Subsystem for Linux)

Docker Desktop on Windows relies on the WSL 2 backend for near-native Linux kernel performance.

1. Open **Windows PowerShell** as Administrator (Right-click Start -> *Terminal (Admin)* or *PowerShell (Admin)*).
2. Verify WSL status:
   ```powershell
   wsl --status
   ```
3. If WSL is not installed or outdated, run:
   ```powershell
   wsl --install
   wsl --update
   ```
4. In Docker Desktop Settings (`gear icon` -> `General`), ensure **"Use the WSL 2 based engine"** is checked.
5. In `Resources` -> `WSL Integration`, enable integration with your default WSL distro if desired.

---

## 4. Repository Cloning & Workspace Setup

Open **Git Bash** or **Windows Terminal** (PowerShell / Command Prompt):

1. Navigate to your desired working directory (e.g. `C:\Projects` or `Downloads`):
   ```bash
   cd /c/Users/$USER/Downloads
   # or in PowerShell: cd $HOME\Downloads
   ```

2. Clone the official repository:
   ```bash
   git clone https://github.com/tiruk007/slotbooking.git
   ```

3. Enter the repository directory:
   ```bash
   cd slotbooking
   ```

---

## 5. Environment Configuration

The repository includes a ready-to-run `.env.example` template with sensible defaults for local Docker execution.

1. Create your local `.env` file by copying the template:
   - In **Git Bash** / **WSL**:
     ```bash
     cp .env.example .env
     ```
   - In **PowerShell**:
     ```powershell
     Copy-Item .env.example .env
     ```

2. Explanation of Key Environment Variables:

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port on which the Next.js web application is exposed. |
| `DATABASE_URL` | `postgresql://slotbook_user:slotbook_secure_password@slotbook-db:5432/slotbook_db` | Connection string pointing to containerized PostgreSQL. |
| `SESSION_SECRET` | `slotbook_super_secret_session_key_min_32_chars` | Encryption key for host session cookies. |
| `NEXT_PUBLIC_APP_URL`| `http://localhost:3000` | Base URL used for email links and host calendar URLs. |
| `SMTP_HOST` | `smtp.gmail.com` | Outgoing email server. |
| `SMTP_PORT` | `587` | Outgoing email port (STARTTLS). |
| `SMTP_USER` | `your_email@gmail.com` | Host SMTP mailbox (optional for local mock mode). |
| `SMTP_PASS` | `your_app_password` | App password (if testing live SMTP delivery). |

> **Note on Email Notifications**: For local reviewer testing, real SMTP credentials are completely optional. The built-in Transactional Outbox stages notifications into PostgreSQL and logs deliveries cleanly without crashing or failing bookings.

---

## 6. Single-Command Launch via Docker Compose

Run the following command in the root of the repository:

```bash
docker compose up --build
```

### What happens automatically during launch:
1. **Database Container (`slotbook-db`)**:
   - Downloads PostgreSQL 16 Alpine.
   - Initializes database cluster and installs the `btree_gist` extension.
   - Mounts a persistent volume (`postgres_data`) so data survives container restarts.
   - Activates a Docker health check (`pg_isready -U slotbook_user -d slotbook_db`).

2. **Application Container (`slotbook-app`)**:
   - Multi-stage build compiles TypeScript, bundles Next.js 14 assets, and sets up Node 20 runtime.
   - Executes `docker-entrypoint.sh`:
     - Waits for PostgreSQL container health check to turn green.
     - Automatically runs PostgreSQL database migrations (`npm run db:migrate`).
     - Automatically runs idempotent seed scripts (`npm run db:seed`) to create initial host data.
     - Boots the production server at `http://localhost:3000`.

When you see:
```text
Ready in ...ms
- Local: http://localhost:3000
```
the application is fully operational!

---

## 7. Verification & Sanity Testing Walkthrough

Follow these steps in Google Chrome or any browser to verify all core capabilities:

### Test 7.1 — System Health Check
- Open: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **Expected Output**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-06T...",
    "database": "connected"
  }
  ```

### Test 7.2 — Public Customer Booking Experience
1. Open the homepage: [http://localhost:3000](http://localhost:3000)
2. Click **"Explore Events"** or navigate directly to the seeded host booking page:  
   [http://localhost:3000/book/tirumalesh/30-minutes](http://localhost:3000/book/tirumalesh/30-minutes)
3. **Select a Date**: Click any available date on the calendar.
4. **Timezone Projection**: Notice the timezone dropdown at the top right. Switch between `Asia/Kolkata` (Host's primary zone) and `America/New_York` (Guest zone). Slot times recalculate dynamically.
5. **Select a Slot**: Click an available slot (e.g., 9:10 AM).
6. **Hold Reservation**: A 5-minute lease is acquired via PostgreSQL GiST exclusion.
7. **Enter Guest Details**: Enter name and email (e.g. `guest@example.com`).
8. **Verify OTP**: Enter the 6-digit OTP (displayed in console or test sandbox `123456`).
9. **Confirmation**: You are redirected to the confirmation screen displaying appointment details, host name, duration, and cancellation/reschedule links.

### Test 7.3 — Host Private Portal & Availability Management
1. Open Host Login: [http://localhost:3000/host/login](http://localhost:3000/host/login)
2. Enter the seeded host credentials:
   - **Email**: `host@slotbook.internal` (or `tirumaleshkommavarapu@gmail.com`)
   - **Password**: `Password123!`
   - *(Or enter email to receive host login OTP)*
3. **Host Overview Dashboard**:
   - Inspect confirmed appointments, active event types, and total scheduled hours.
4. **Availability & Overrides Tab**:
   - View weekly recurring working hours (Monday through Friday).
   - Add a date override (e.g. marking a holiday or custom afternoon hours).
   - Click **"Save Weekly Rules"** — verified clean save with zero schema errors.
5. **Bookings Tab**:
   - Inspect confirmed bookings, past bookings, and cancelled bookings.
   - Cancel or reschedule an appointment and watch status update immediately.

### Test 7.4 — Run the Automated Test Suite (71 Tests)
Verify that all 71 unit, integration, and concurrency tests pass against the live PostgreSQL container:

```bash
docker compose exec slotbook-app npm test
```

**Expected Test Output**:
```text
Test Suites: 7 passed, 7 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        4.821 s
Ran all test suites.
```

---

## 8. Common Pitfalls & Troubleshooting on Windows

### Issue 8.1 — Port 3000 or 5432 Already in Use
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::3000` or `bind: address already in use 0.0.0.0:5432`.
- **Solution**:
  - Another local app or PostgreSQL service is using the port.
  - To find and kill the process in Windows PowerShell:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
    Get-Process -Id (Get-NetTCPConnection -LocalPort 5432).OwningProcess | Stop-Process
    ```
  - Alternatively, edit `docker-compose.yml` to change the external port mapping (e.g., `"3001:3000"` or `"5433:5432"`).

### Issue 8.2 — Docker Desktop WSL 2 Engine Not Running
- **Symptom**: `error during connect: This error may indicate that the docker daemon is not running.`
- **Solution**:
  - Open Docker Desktop from the Start menu and wait 30 seconds for the engine to initialize.
  - If it fails to start, open PowerShell as Admin and run: `wsl --update` followed by `wsl --shutdown`, then relaunch Docker Desktop.

### Issue 8.3 — Windows CRLF Line Endings in Shell Scripts
- **Symptom**: `exec /app/docker-entrypoint.sh: no such file or directory` or `\r: command not found`.
- **Solution**:
  - Windows Git may have converted LF to CRLF upon checkout.
  - Convert it back to Unix line endings in Git Bash:
    ```bash
    dos2unix docker-entrypoint.sh
    # or via git:
    git config core.autocrlf false
    git checkout docker-entrypoint.sh
    ```

### Issue 8.4 — Windows Defender Firewall Prompt
- **Symptom**: A popup appears asking *"Windows Defender Firewall has blocked some features of Docker Desktop"*.
- **Solution**: Click **"Allow access"** on Private networks to allow inter-container communication.

---

## 9. Daily Development Commands & Teardown

| Action | Command |
| :--- | :--- |
| **Stop Containers (Preserve Data)** | `docker compose stop` |
| **Restart Stopped Containers** | `docker compose start` |
| **Tail Live Application Logs** | `docker compose logs -f slotbook-app` |
| **Tail Database Logs** | `docker compose logs -f slotbook-db` |
| **Run Migrations Manually** | `docker compose exec slotbook-app npm run db:migrate` |
| **Re-Seed Database** | `docker compose exec slotbook-app npm run db:seed` |
| **Full Teardown (Clean Slate)** | `docker compose down -v` |

---

## 10. Architectural Highlights for Reviewers

- **Zero Application Race Conditions**: Double-booking is rendered physically impossible by the PostgreSQL `btree_gist` exclusion constraint:
  ```sql
  EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)
  ```
- **Authoritative Clock**: 5-minute hold leases expire using PostgreSQL's internal `clock_timestamp()`, completely immune to client clock drift or manipulation.
- **Pure Mathematical Availability**: Buffer steps strictly iterate at $(D + B_{\text{before}} + B_{\text{after}})$, guaranteeing scheduled breaks.
- **Zero Dual-Write Failures**: The Transactional Outbox pattern stages notifications atomically with booking creation.

---
*Slotbook Production Scheduling Engine | Authored by Tirumalesh Kommavarapu | November 2026*
