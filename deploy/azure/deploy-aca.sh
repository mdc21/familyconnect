#!/usr/bin/env bash
# ==============================================================================
# FamilyConnect — Azure Container Apps (Pilot / Low-Cost Deployment Script)
#
# Usage:
#   export DATABASE_URL="postgresql://user:pass@ep-xxxx.neon.tech/familyconnect?sslmode=require"
#   ./deploy/azure/deploy-aca.sh
# ==============================================================================

set -euo pipefail

# ── Configuration Defaults ───────────────────────────────────────────────────
LOCATION="${AZURE_LOCATION:-centralindia}"          # Pune, India (closest to Nepal & Assam)
RESOURCE_GROUP="${AZURE_RG:-rg-familyconnect-pilot}"
ENVIRONMENT_NAME="cae-familyconnect-pilot"
APP_NAME="familyconnect"
ACR_NAME="acrfcpilot$RANDOM"

echo "======================================================================"
echo "  FamilyConnect — Azure Container Apps Pilot Deployment"
echo "  Region: $LOCATION | RG: $RESOURCE_GROUP"
echo "======================================================================"

# ── Check Prerequisites ─────────────────────────────────────────────────────
command -v az >/dev/null 2>&1 || { echo "Error: Azure CLI ('az') is required. Install from https://aka.ms/installazurecli"; exit 1; }

# Verify Azure login
echo "Checking Azure authentication..."
az account show >/dev/null 2>&1 || { echo "Please log in to Azure using 'az login'"; exit 1; }

# ── Prompt for Database URL if not provided ─────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
    echo ""
    echo "FamilyConnect requires a PostgreSQL 16 database."
    echo "For a \$0/month pilot, create a free database at https://neon.tech or https://supabase.com"
    read -rp "Enter your cloud PostgreSQL DATABASE_URL: " DATABASE_URL
    if [ -z "$DATABASE_URL" ]; then
        echo "Error: DATABASE_URL cannot be empty."
        exit 1
    fi
fi

# ── Generate or read JWT Secret ─────────────────────────────────────────────
if [ -z "${JWT_SECRET:-}" ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || openssl rand -hex 32)
fi

AI_PROVIDER="${AI_PROVIDER:-gemini}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"

# ── 1. Create Resource Group ────────────────────────────────────────────────
echo ""
echo "[1/5] Ensuring Resource Group exists ($RESOURCE_GROUP in $LOCATION)..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

# ── 2. Create Azure Container Registry (Basic SKU ~$0.16/day) ───────────────
echo "[2/5] Creating Azure Container Registry ($ACR_NAME)..."
az acr create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --output none

# ── 3. Build & Push Container Image using ACR Cloud Build ───────────────────
echo "[3/5] Building and pushing Docker container to ACR (cloud build)..."
az acr build \
    --registry "$ACR_NAME" \
    --image "$APP_NAME:latest" \
    .

# Get ACR credentials
ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer --output tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" --output tsv)

# ── 4. Create Azure Container Apps Managed Environment ──────────────────────
echo "[4/5] Setting up Azure Container Apps Environment ($ENVIRONMENT_NAME)..."
az extension add --name containerapp --upgrade --yes >/dev/null 2>&1 || true

az containerapp env create \
    --name "$ENVIRONMENT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --output none

# ── 5. Create or Update Container App ────────────────────────────────────────
echo "[5/5] Deploying FamilyConnect Container App..."

# Set up secrets
SECRETS_ARGS=(
    "database-url=$DATABASE_URL"
    "jwt-secret=$JWT_SECRET"
)
if [ -n "$GEMINI_API_KEY" ]; then
    SECRETS_ARGS+=("gemini-api-key=$GEMINI_API_KEY")
fi

ENV_VARS_ARGS=(
    "DATABASE_URL=secretref:database-url"
    "JWT_SECRET=secretref:jwt-secret"
    "AI_PROVIDER=$AI_PROVIDER"
    "NODE_ENV=production"
    "PORT=3000"
)
if [ -n "$GEMINI_API_KEY" ]; then
    ENV_VARS_ARGS+=("GEMINI_API_KEY=secretref:gemini-api-key")
fi

az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$ENVIRONMENT_NAME" \
    --image "$ACR_SERVER/$APP_NAME:latest" \
    --registry-server "$ACR_SERVER" \
    --registry-username "$ACR_NAME" \
    --registry-password "$ACR_PASSWORD" \
    --ingress external \
    --target-port 3000 \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 1 \
    --max-replicas 5 \
    --secrets "${SECRETS_ARGS[@]}" \
    --env-vars "${ENV_VARS_ARGS[@]}" \
    --output none

# ── Deployment Summary ──────────────────────────────────────────────────────
FQDN=$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "properties.configuration.ingress.fqdn" --output tsv)

echo ""
echo "======================================================================"
echo "  ✅ FamilyConnect Successfully Deployed to Azure Container Apps!"
echo "======================================================================"
echo "  Public URL:        https://$FQDN"
echo "  Health Check:      https://$FQDN/healthz"
echo "  Assam Floods:      https://$FQDN/?event=EVENT-IN-FL-2026-1187"
echo "  Nepal GLOF:        https://$FQDN/?event=EVENT-NP-TIBET-2026"
echo "  Coordinator Hub:   https://$FQDN/console.html"
echo "======================================================================"
echo ""
echo "Next Step: If you haven't yet seeded the remote database, run:"
echo "  DATABASE_URL=\"$DATABASE_URL\" npm run db:seed"
echo "======================================================================"
