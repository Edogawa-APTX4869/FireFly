# Quickstart & Setup Guide (create.md)

This guide walks you through setting up and running the complete **FireFly** stack from scratch — either locally for development or as a production containerized service on Docker / Portainer / Synology NAS.

---

## Architecture Overview

The repository provides a complete 4-container production stack:

```
                  ┌────────────────────────────────────────┐
                  │          Browser / Mobile PWA          │
                  └───────────────────┬────────────────────┘
                                      │ :3000 (HTTP / SSL)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       firefly-web (Companion App)     │
                  │  • Next.js 16 + React 19 + Tailwind CSS│
                  │  • Encrypted Cookie Proxy (AES-256)    │
                  │  • Embedded SQLite (Icons & Templates) │
                  │  • Ramble AI Fast-Access Assistant     │
                  └───────────────────┬────────────────────┘
                                      │ Internal Docker Network (:8080)
                                      ▼
                  ┌────────────────────────────────────────┐
                  │       firefly-app (Firefly III Core)   │
                  │  • Official Firefly III Engine         │
                  └───────┬────────────────────────┬───────┘
                          │                        │
                          ▼                        ▼
       ┌──────────────────────────────┐ ┌──────────────────────────────┐
       │ firefly-db (PostgreSQL 16)   │ │ firefly-cron (Alpine Cron)   │
       │ Persistent storage for core  │ │ Scheduled recurring jobs     │
       └──────────────────────────────┘ └──────────────────────────────┘
```

---

## Option 1: One-Click Production Deployment via Docker Compose

### Prerequisites
- Docker Engine 24+ & Docker Compose v2+
- Or a container management UI like **Portainer**, **Synology Container Manager**, or **TrueNAS SCALE**.

### Step 1: Clone the Repository
```bash
git clone https://github.com/Edogawa-APTX4869/wallet.git
cd wallet
```

### Step 2: Configure Environment Variables
You can customize variables directly in `docker-compose.yml` or create an `.env` file in the root directory:

```env
# Security: 32+ character key for session cookie encryption
SESSION_SECRET=generate_a_random_32_character_string_here

# Firefly III App Key (exactly 32 characters)
FF_APP_KEY=generate_another_random_32_character_key

# PostgreSQL Database Password
FF_DB_PASSWORD=a_strong_database_password_here

# Daily Cron Token (32 characters)
FF_STATIC_CRON_TOKEN=a_32_character_cron_token_here

# Optional: Pre-configured Firefly Personal Access Token for instant auto-login
# FIREFLY_TOKEN=your_firefly_personal_access_token_here

# Optional: AI Assistant (OpenAI / Local Ollama / Gemini-compatible endpoint)
# ASSISTANT_LLM_ENDPOINT=http://ollama:11434/v1
# ASSISTANT_LLM_MODEL=llama3.2
# ASSISTANT_LLM_API_KEY=
```

### Step 3: Start the Stack
```bash
docker compose up -d --build
```

### Step 4: Initial Access & Setup
1. **Firefly III Backend**: Open `http://localhost:8080` (or `http://your-server-ip:8080`) to finish the initial Firefly III database migration and register your primary admin user.
2. **Generate Token**: In Firefly III, go to **Profile → OAuth → Personal Access Tokens**, click **Create New Token**, and copy the generated token.
3. **FireFly Companion App**: Open `http://localhost:3000` (or `http://your-server-ip:3000`), enter your Firefly URL (`http://firefly-app:8080` or public address) and your token, then click **Connect**.

---

## Option 2: Local Development Setup

If you already have a running Firefly III instance and want to run the web frontend locally:

### Step 1: Install Dependencies
```bash
# In the root repository:
npm install

# Or inside the web project:
cd firefly-web
npm install
```

### Step 2: Create Local Environment File
```bash
cd firefly-web
cp .env.example .env.local
```
Edit `.env.local` and define `SESSION_SECRET` with any 32+ character secret string:
```env
SESSION_SECRET=any_random_32_character_string_for_local_testing_1234
```

### Step 3: Launch Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

---

## Quality Checks & Testing Commands

Run all verification tools with zero warnings:

| Command | Action |
|---|---|
| `npm run typecheck` | Next.js route typegen and strict TypeScript checking (`tsc --noEmit`) |
| `npm run lint` | ESLint verification |
| `npm test` | Vitest unit tests (FX calculations, rate resolution, math) |
| `npm run build` | Next.js production compilation with Turbopack |
| `npm start` | Run the compiled production build |

---

## Persistent Storage Volumes

When deploying via Docker Compose, 3 named volumes preserve your data across updates and restarts:
- `firefly_web_data`: Companion app SQLite database (custom icons, account colors, templates, AI preferences).
- `firefly_iii_db`: PostgreSQL database files.
- `firefly_iii_upload`: Attachments and file uploads.
