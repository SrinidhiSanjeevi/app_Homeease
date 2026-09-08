#!/usr/bin/env bash
# =============================================================
# sonar-scan.sh — run SonarQube scanner for all four services
#
# Usage:
#   ./scripts/sonar-scan.sh              # scan all services
#   ./scripts/sonar-scan.sh backend      # scan one service
#
# Credentials come from .env at the repo root — never typed
# directly into a terminal command.
# =============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

# ── Validate .env exists ─────────────────────────────────────
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found." >&2
  echo "Create it with:" >&2
  echo "  SONAR_TOKEN=<your-token>" >&2
  echo "  SONAR_HOST_URL=http://localhost:9000" >&2
  exit 1
fi

# ── Source credentials (never echo them) ─────────────────────
# shellcheck source=/dev/null
set -a
source "${ENV_FILE}"
set +a

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "ERROR: SONAR_TOKEN is not set in ${ENV_FILE}" >&2
  exit 1
fi

if [[ -z "${SONAR_HOST_URL:-}" ]]; then
  SONAR_HOST_URL="http://localhost:9000"
fi

# ── Determine which services to scan ─────────────────────────
ALL_SERVICES=(backend admin-backend payment-service frontend)
SERVICES=("${@:-${ALL_SERVICES[@]}}")

echo "==> Scanning services: ${SERVICES[*]}"
echo "==> Host: ${SONAR_HOST_URL}"
echo ""

FAILED=()

for SERVICE in "${SERVICES[@]}"; do
  SERVICE_DIR="${REPO_ROOT}/${SERVICE}"

  if [[ ! -d "${SERVICE_DIR}" ]]; then
    echo "WARN: ${SERVICE_DIR} does not exist — skipping." >&2
    continue
  fi

  if [[ ! -f "${SERVICE_DIR}/sonar-project.properties" ]]; then
    echo "WARN: ${SERVICE_DIR}/sonar-project.properties not found — skipping." >&2
    continue
  fi

  echo "──────────────────────────────────────────────────────"
  echo "Scanning: ${SERVICE}"
  echo "──────────────────────────────────────────────────────"

  # Mount the entire repo root so the scanner can see .git for
  # SCM blame information. sonar.projectBaseDir points the scanner
  # at the specific service subfolder within the mounted volume.
  if docker run --rm \
      --network host \
      -e SONAR_TOKEN \
      -e SONAR_HOST_URL \
      -v "${REPO_ROOT}:/usr/src" \
      sonarsource/sonar-scanner-cli \
      -Dproject.settings="/usr/src/${SERVICE}/sonar-project.properties" \
      -Dsonar.projectBaseDir="/usr/src/${SERVICE}"; then
    echo "✓ ${SERVICE}: scan submitted"
  else
    echo "✗ ${SERVICE}: scan FAILED" >&2
    FAILED+=("${SERVICE}")
  fi

  echo ""
done

# ── Summary ───────────────────────────────────────────────────
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "==> FAILED services: ${FAILED[*]}" >&2
  exit 1
else
  echo "==> All scans submitted successfully."
fi
