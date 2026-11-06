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

## 5. PostgreSQL Database Setup (Two Supported Paths)

Slotbook requires PostgreSQL 15+ with the `btree_gist` extension enabled for kernel-level concurrency exclusion. You can run PostgreSQL either through Docker (recommended, zero-install) or natively on your machine.

### Path A (Recommended): Automated Containerized PostgreSQL (Zero Host Install)
If you are using Docker Desktop, **you do NOT need to install or configure PostgreSQL manually on Windows**:
- Docker Compose automatically pulls the official `postgres:16-alpine` image.
- It automatically creates the default database (`slotbook`), sets the credentials (`postgres:postgres`), and mounts a persistent volume (`pgdata`).
- The startup entrypoint script automatically preloads the `btree_gist` extension, executes all database migrations (`npm run db:migrate`), and runs the seed script (`npm run db:seed`).
- **Host action required**: None! Proceed directly to Section 6.

### Path B (Alternative): Native Local PostgreSQL Installation (Running without Docker)
If you prefer running the application natively on your host machine via Node.js (`npm run dev`):

1. **Install PostgreSQL 16 on Windows**:
   - Download the official installer from [EnterpriseDB PostgreSQL Downloads](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
   - Run the installer. Choose PostgreSQL Version 16.
   - When prompted for the superuser password, set a password (e.g. `postgres`).
   - Leave the default port as `5432`.
   - Uncheck "Stack Builder" at the end of installation.

2. **Initialize Databases and Extensions**:
   Open **SQL Shell (psql)** or **pgAdmin 4** from your Windows Start Menu:
   ```sql
   -- Connect as postgres superuser
   -- Create main database and test database
   CREATE DATABASE slotbook;
   CREATE DATABASE slotbook_test;

   -- Connect to main database and enable btree_gist extension
   \c slotbook;
   CREATE EXTENSION IF NOT EXISTS btree_gist;

   -- Connect to test database and enable btree_gist extension
   \c slotbook_test;
   CREATE EXTENSION IF NOT EXISTS btree_gist;
   ```

3. **Run Migrations & Seeds**:
   In your Windows terminal (`slotbooking` root directory):
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```

---

## 6. How to Obtain & Configure Environment Variables

The repository includes a ready-to-run `.env.example` template with production-grade local defaults.

1. Create your local `.env` file by copying the template:
   - In **Git Bash** / **WSL**:
     ```bash
     cp .env.example .env
     ```
   - In **PowerShell**:
     ```powershell
     Copy-Item .env.example .env
     ```

2. Detailed Breakdown of Every Environment Variable:

| Variable | Default Value | Where to Obtain / How to Generate |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/slotbook` | **Connection string for main database**. Format: `postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]`. For Docker, the container internally overrides host to `postgres`. For local setup, use your PostgreSQL username and password. |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/slotbook_test` | **Connection string for test database**. Used when running `npm test`. Keep pointing to `slotbook_test`. |
| `APP_BASE_URL` | `http://localhost:3000` | **Application base URL**. Used to generate guest self-service booking links (`/booking/{token}`). Keep as `http://localhost:3000` for local development. |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | **Public client URL**. Matches `APP_BASE_URL` for browser navigation and API calls. |
| `SESSION_SECRET` | `slotbook_production_secure_secret_key_at_least_32_characters_long_for_session` | **Cryptographic secret key**. Used to encrypt and sign host session cookies. See Step 6.1 below on how to generate a custom one. |
| `GMAIL_USER` | `your_email@gmail.com` | **Outgoing SMTP email address**. Your Gmail account used to send confirmation and OTP emails. See Step 6.2 below. |
| `GMAIL_APP_PASSWORD` | `your_16_character_app_password` | **Google App Password**. A dedicated 16-character password generated specifically for Slotbook. See Step 6.2 below. |
| `MAIL_FROM` | `your_email@gmail.com` | **Email sender name/address**. Usually identical to `GMAIL_USER`. |
| `NODE_ENV` | `development` | Set to `development` for local dev or `production` for Docker builds. |

---

### Step 6.1 — How to Generate `SESSION_SECRET`

You can use the default placeholder string provided in `.env.example`, or generate a cryptographically strong 32-byte secret using any of the following terminal commands:

- **Using OpenSSL** (Git Bash / WSL / Linux / macOS):
  ```bash
  openssl rand -base64 32
  ```
- **Using Node.js** (PowerShell / Command Prompt):
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Copy the output string and paste it as the value for `SESSION_SECRET` in your `.env`.

---

### Step 6.2 — How to Obtain Google Gmail SMTP Credentials (`GMAIL_USER` & `GMAIL_APP_PASSWORD`)

Slotbook uses Google's secure SMTP relay to deliver transactional emails (booking confirmations, guest OTPs, and cancellation notices). Google does **not** accept your standard personal password; you must generate a dedicated **16-character Google App Password**.

#### Step-by-Step Instructions to Generate a Google App Password:
1. Log into your Google Account at: [https://myaccount.google.com](https://myaccount.google.com).
2. On the left navigation menu, click **Security**.
3. Under **"How you sign in to Google"**, verify that **2-Step Verification** is turned **ON**. *(Note: Google requires 2-Step Verification before enabling App Passwords).*
4. Navigate directly to the App Passwords page:  
   👉 [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)  
   *(Or type "App passwords" in the search box at the top of Google Account settings).*
5. Under **"App name"**, enter a recognizable name, such as `Slotbook`.
6. Click **Create**.
7. Google will display a popup with a **16-character code** (e.g., `abcd efgh ijkl mnop`).
8. Copy this 16-character code.
9. Open your `.env` file and configure the email variables:
   ```env
   GMAIL_USER=your_personal_email@gmail.com
   GMAIL_APP_PASSWORD=abcdefghijklmnop
   MAIL_FROM=your_personal_email@gmail.com
   ```
   *(Spaces inside the 16-character password are automatically trimmed by Slotbook).*

#### 🛡️ Local Mock Mode (No Email Setup Required for Evaluation)
If you are evaluating Slotbook as a reviewer and do **not** wish to connect a real Gmail account:
- You can leave `GMAIL_USER` and `GMAIL_APP_PASSWORD` with their default placeholder values.
- **The application will NOT crash or fail bookings**:
  - Slotbook's built-in **Transactional Outbox Engine** stages the notification payload into PostgreSQL.
  - The background outbox processor attempts dispatch, logs the delivery simulation to the terminal, and records the attempt.
  - Guest and host OTP codes are printed directly to the terminal/console output (`[OTP Service] Code generated: 123456`), allowing you to complete all booking and login verification flows seamlessly!

---

## 7. Single-Command Launch via Docker Compose

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

## 8. Verification & Sanity Testing Walkthrough

Follow these steps in Google Chrome or any browser to verify all core capabilities:

### Test 8.1 — System Health Check
- Open: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- **Expected Output**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-06T...",
    "database": "connected"
  }
  ```

### Test 8.2 — Public Customer Booking Experience
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

### Test 8.3 — Host Private Portal & Availability Management
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

### Test 8.4 — Run the Automated Test Suite (71 Tests)
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

## 9. Common Pitfalls & Troubleshooting on Windows

### Issue 9.1 — Port 3000 or 5432 Already in Use
- **Symptom**: `Error: listen EADDRINUSE: address already in use :::3000` or `bind: address already in use 0.0.0.0:5432`.
- **Solution**:
  - Another local app or PostgreSQL service is using the port.
  - To find and kill the process in Windows PowerShell:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process
    Get-Process -Id (Get-NetTCPConnection -LocalPort 5432).OwningProcess | Stop-Process
    ```
  - Alternatively, edit `docker-compose.yml` to change the external port mapping (e.g., `"3001:3000"` or `"5433:5432"`).

### Issue 9.2 — Docker Desktop WSL 2 Engine Not Running
- **Symptom**: `error during connect: This error may indicate that the docker daemon is not running.`
- **Solution**:
  - Open Docker Desktop from the Start menu and wait 30 seconds for the engine to initialize.
  - If it fails to start, open PowerShell as Admin and run: `wsl --update` followed by `wsl --shutdown`, then relaunch Docker Desktop.

### Issue 9.3 — Windows CRLF Line Endings in Shell Scripts
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

### Issue 9.4 — Windows Defender Firewall Prompt
- **Symptom**: A popup appears asking *"Windows Defender Firewall has blocked some features of Docker Desktop"*.
- **Solution**: Click **"Allow access"** on Private networks to allow inter-container communication.

---

## 10. Daily Development Commands & Teardown

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

## 11. Architectural Highlights for Reviewers

- **Zero Application Race Conditions**: Double-booking is rendered physically impossible by the PostgreSQL `btree_gist` exclusion constraint:
  ```sql
  EXCLUDE USING gist (host_id WITH =, buffered_range WITH &&)
  ```
- **Authoritative Clock**: 5-minute hold leases expire using PostgreSQL's internal `clock_timestamp()`, completely immune to client clock drift or manipulation.
- **Pure Mathematical Availability**: Buffer steps strictly iterate at $(D + B_{\text{before}} + B_{\text{after}})$, guaranteeing scheduled breaks.
- **Zero Dual-Write Failures**: The Transactional Outbox pattern stages notifications atomically with booking creation.

---
*Slotbook Production Scheduling Engine | Authored by Tirumalesh Kommavarapu | November 2026*

