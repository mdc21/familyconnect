# FamilyConnect — Azure Container Apps (Low-Cost Pilot Deployment Guide)

This guide walks you through deploying **FamilyConnect** to **Microsoft Azure** using **Azure Container Apps (Consumption Tier)** paired with a free serverless PostgreSQL database.

Total estimated cost for this pilot deployment: **$0.00 to $3.00 per month**.

---

## 🏗️ Architecture Overview (Pilot Option 2)

```
       [ Affected Citizens & First Responders ]
                          │
                          ▼ HTTPS
       ┌───────────────────────────────────────┐
       │     Azure Container Apps Ingress      │
       │   - Free managed SSL certificate      │
       │   - Edge HTTP/2 termination           │
       │   - External FQDN                     │
       └──────────────────┬────────────────────┘
                          │
                          ▼ Port 3000
       ┌───────────────────────────────────────┐
       │   FamilyConnect Container Instance    │
       │   - Serverless Consumption Plan       │
       │   - Node.js 20 Alpine (<120MB image)  │
       │   - Scale: 1 to 5 replicas (or 0–5)   │
       │   - 0.5 vCPU / 1.0 GiB RAM            │
       └──────────────────┬────────────────────┘
                          │
                          │ TLS Encrypted Connection (SSL)
                          ▼
       ┌───────────────────────────────────────┐
       │  Serverless PostgreSQL 16 (Free Tier) │
       │  - Neon.tech / Supabase (0.5 GB Free) │
       │  - 37+ Tables & Immutable Triggers    │
       │  - Full pg_trgm & uuid-ossp support   │
       └───────────────────────────────────────┘
```

---

## ⏱️ Quickstart Checklist (10–15 Minutes Total)

### Step 1: Provision Free PostgreSQL Database (2 Minutes)

FamilyConnect uses PostgreSQL 16 with standard extensions (`uuid-ossp`, `pg_trgm`, `citext`).

1. Visit **[Neon.tech](https://neon.tech)** (or [Supabase.com](https://supabase.com)) and sign in with GitHub.
2. Click **Create Project**:
   - **Name**: `familyconnect-pilot`
   - **Postgres Version**: `16`
   - **Region**: Select **Asia Pacific (Singapore)** or nearest South Asian node.
3. Copy the connection string provided on your dashboard:
   ```bash
   postgresql://alex:password@ep-crimson-leaf-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

---

### Step 2: Seed the Remote Database (1 Minute)

Run the automated seeder locally against your cloud database connection string. This executes all schema migrations, module registries, Nepal & Assam initial records, and triggers the AI news agent:

```bash
DATABASE_URL="postgresql://alex:password@ep-crimson-leaf-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" npm run db:seed
```

You should see:
```
--- Initializing & Seeding FamilyConnect Database ---
Executing ../src/db/schema.sql...
Executing ../src/db/migration-orchestrator.sql...
Executing ../src/db/seed-modules.sql...
Executing ../src/db/seed.sql...
Executing ../src/db/seed_assam.sql...
Running AI News Collector cycles for initial feed ingestion...
Database initialization & seeding completed successfully.
```

---

### Step 3: Deploy to Azure Container Apps (5 Minutes)

We provide an automated script [`deploy/azure/deploy-aca.sh`](../deploy/azure/deploy-aca.sh) that creates the Resource Group, sets up Azure Container Registry, builds the container image in the cloud, and launches the Container App in **Central India (Pune)**.

1. **Log in to Azure CLI**:
   ```bash
   az login
   ```

2. **Execute Deployment Script**:
   ```bash
   export DATABASE_URL="postgresql://alex:password@ep-crimson-leaf-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
   
   # Optional: Set Gemini API key for AI news intelligence
   export GEMINI_API_KEY="your-gemini-key"

   ./deploy/azure/deploy-aca.sh
   ```

3. The script will output the live public URL:
   ```
   ======================================================================
     ✅ FamilyConnect Successfully Deployed to Azure Container Apps!
   ======================================================================
     Public URL:        https://familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io
     Health Check:      https://familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io/healthz
     Assam Floods:      https://familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io/?event=EVENT-IN-FL-2026-1187
     Nepal GLOF:        https://familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io/?event=EVENT-NP-TIBET-2026
     Coordinator Hub:   https://familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io/console.html
   ======================================================================
   ```

---

## 🌐 Setting Up a Custom Domain (e.g. `portal.familyconnect.live`)

To point a custom domain with free automatic SSL to your Azure Container App:

1. In your DNS provider (e.g., Namecheap, Cloudflare, GoDaddy), add two records:
   - **CNAME Record**:
     - Host / Name: `portal` (or `@`)
     - Value / Target: `familyconnect.jollysea-xxxx.centralindia.azurecontainerapps.io`
   - **TXT Record** (for ownership verification):
     - Host / Name: `asuid.portal`
     - Value: Verification ID found in Container App > Custom Domains.
2. In the **Azure Portal**:
   - Navigate to your Container App (`familyconnect`) > **Custom domains**.
   - Click **Add custom domain**, enter your domain, and select **Managed certificate**.
   - Azure will automatically provision and renew a free Let's Encrypt TLS certificate.

---

## 🤖 Continuous Deployment via GitHub Actions

To enable automatic zero-downtime redeployment on every `git push origin main`:

1. In Azure CLI, generate deployment credentials:
   ```bash
   az ad sp create-for-rbac \
     --name "gh-actions-familyconnect" \
     --role contributor \
     --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/rg-familyconnect-pilot \
     --json-auth
   ```
2. In your GitHub repository (**Settings > Secrets and variables > Actions**), add:
   - `AZURE_CREDENTIALS`: Paste the JSON output from the command above.
   - `AZURE_ACR_NAME`: The name of your Azure Container Registry (e.g. `acrfcpilot12345`).
   - `AZURE_RESOURCE_GROUP`: `rg-familyconnect-pilot`.
3. The workflow in [`.github/workflows/deploy-azure-container-apps.yml`](../.github/workflows/deploy-azure-container-apps.yml) will run all 38 automated tests and deploy new container revisions on each commit.

---

## 💰 Cost Breakdown & Free-Tier Monitoring

| Service | Monthly Usage | Cost |
| :--- | :--- | :--- |
| **Azure Container Apps (vCPU)** | First 180,000 vCPU-seconds free per month | **$0.00** |
| **Azure Container Apps (Memory)** | First 360,000 GiB-seconds free per month | **$0.00** |
| **Azure Container Registry (Basic)** | Container image storage (~120 MB) | **~$0.16 / day** (~$1.50–$3.00/mo) |
| **PostgreSQL 16 (Neon.tech)** | Free tier (0.5 GB database storage, compute included) | **$0.00** |
| **SSL / HTTPS Certificates** | Managed by Azure Container Apps | **$0.00** |
| **Total Estimated Monthly Outlay** | | **~$1.50 – $3.00 / month** |

*Tip: To reduce cost to practically $0.00, you can delete the ACR after deployment, or use Docker Hub / GitHub Container Registry (`ghcr.io`) as the image repository.*
