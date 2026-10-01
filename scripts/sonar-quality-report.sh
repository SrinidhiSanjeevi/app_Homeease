#!/usr/bin/env bash
# sonar-quality-report.sh <service> <project-dir> — enforce the SonarCloud quality gate and report findings.
# Reads report-task.txt from the scan, waits for the analysis, then writes a JSON + Markdown report,
# attaches it to the Azure DevOps run, pushes it to Loki (best effort) and exits 1 if the gate is not OK.
# Env: SONAR_TOKEN (required), LOKI_URL (optional), SONAR_GATE_ENFORCE (default true).
set -uo pipefail

SERVICE="${1:?service name}"
PROJECT_DIR="${2:?project dir}"
OUT_DIR="${SONAR_REPORT_DIR:-${BUILD_ARTIFACTSTAGINGDIRECTORY:-.}/sonar-report}"
ENFORCE="${SONAR_GATE_ENFORCE:-true}"
mkdir -p "${OUT_DIR}"

# Azure leaves undefined macros as the literal "$(NAME)".
[[ "${SONAR_TOKEN:-}" == '$('* ]] && SONAR_TOKEN=""
[[ "${LOKI_URL:-}" == '$('* ]] && LOKI_URL=""

if [[ -z "${SONAR_TOKEN:-}" ]]; then
  echo "##vso[task.logissue type=error]SONAR_TOKEN is not set (add it as a secret to the homeease-ci variable group)."
  exit 1
fi

REPORT_TASK="$(find "${PROJECT_DIR}" . -maxdepth 4 -name report-task.txt 2>/dev/null | head -n1)"
if [[ -z "${REPORT_TASK}" ]]; then
  echo "##vso[task.logissue type=error]report-task.txt not found — SonarCloud analysis did not run."
  exit 1
fi

prop() { grep "^$1=" "${REPORT_TASK}" | head -n1 | cut -d= -f2-; }
PROJECT_KEY="$(prop projectKey)"
CE_TASK_ID="$(prop ceTaskId)"
SERVER_URL="$(prop serverUrl)"; SERVER_URL="${SERVER_URL:-https://sonarcloud.io}"
API="${SERVER_URL%/}"
api() { curl -fsS -u "${SONAR_TOKEN}:" "${API}$1"; }

# 1. Wait for the background analysis task.
ANALYSIS_ID=""
for _ in $(seq 1 60); do
  CE="$(api "/api/ce/task?id=${CE_TASK_ID}")" || CE=""
  STATUS="$(jq -r '.task.status // empty' <<<"${CE}")"
  if [[ "${STATUS}" == "SUCCESS" ]]; then ANALYSIS_ID="$(jq -r '.task.analysisId' <<<"${CE}")"; break; fi
  if [[ "${STATUS}" == "FAILED" || "${STATUS}" == "CANCELED" ]]; then break; fi
  sleep 5
done
if [[ -z "${ANALYSIS_ID}" ]]; then
  echo "##vso[task.logissue type=error]SonarCloud analysis task did not complete (status: ${STATUS:-unknown})."
  exit 1
fi

# 2. Gate status + open issues.
GATE="$(api "/api/qualitygates/project_status?analysisId=${ANALYSIS_ID}")" || { echo "##vso[task.logissue type=error]Cannot read quality gate."; exit 1; }
GATE_STATUS="$(jq -r '.projectStatus.status' <<<"${GATE}")"

ISSUES="$(api "/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&impactSeverities=BLOCKER,HIGH,MEDIUM&ps=500")" || ISSUES='{"issues":[]}'

BRANCH="${BUILD_SOURCEBRANCHNAME:-unknown}"
COMMIT="${BUILD_SOURCEVERSION:-unknown}"

jq -n --arg service "${SERVICE}" --arg gate "${GATE_STATUS}" --arg branch "${BRANCH}" --arg commit "${COMMIT}" \
      --arg build "${BUILD_BUILDID:-0}" --arg project "${PROJECT_KEY}" --arg url "${API}/dashboard?id=${PROJECT_KEY}" \
      --argjson gateRaw "${GATE}" --argjson issuesRaw "${ISSUES}" '
  def sev: (.impacts // [] | map(.severity) | if index("BLOCKER") then "BLOCKER" elif index("HIGH") then "HIGH" elif index("MEDIUM") then "MEDIUM" else "LOW" end);
  ($issuesRaw.issues | map({severity: sev, rule: .rule, file: (.component | sub("^[^:]*:"; "")), line: .line, message: .message})) as $list
  | { service: $service, project: $project, gate: $gate, branch: $branch, commit: $commit, build: $build, dashboard: $url,
      failedConditions: [$gateRaw.projectStatus.conditions[] | select(.status == "ERROR") | {metric: .metricKey, actual: .actualValue, threshold: .errorThreshold}],
      counts: { blocker: ($list | map(select(.severity=="BLOCKER")) | length),
                high:    ($list | map(select(.severity=="HIGH")) | length),
                medium:  ($list | map(select(.severity=="MEDIUM")) | length) },
      issues: ($list | sort_by(.severity | if . == "BLOCKER" then 0 elif . == "HIGH" then 1 else 2 end)) }
' > "${OUT_DIR}/${SERVICE}.json"

# 3. Markdown summary on the run page.
{
  echo "# SonarCloud — ${SERVICE}: ${GATE_STATUS}"
  echo
  jq -r '"Blocker **\(.counts.blocker)** · High **\(.counts.high)** · Medium **\(.counts.medium)** — [dashboard](\(.dashboard))"' "${OUT_DIR}/${SERVICE}.json"
  echo
  if [[ "$(jq '.failedConditions | length' "${OUT_DIR}/${SERVICE}.json")" -gt 0 ]]; then
    echo "## Failed conditions"
    jq -r '.failedConditions[] | "- `\(.metric)` = \(.actual) (threshold \(.threshold))"' "${OUT_DIR}/${SERVICE}.json"
    echo
  fi
  if [[ "$(jq '.issues | length' "${OUT_DIR}/${SERVICE}.json")" -gt 0 ]]; then
    echo "| Severity | Rule | Location | Message |"
    echo "|---|---|---|---|"
    jq -r '.issues[] | "| \(.severity) | \(.rule) | \(.file):\(.line // "-") | \(.message | gsub("\\|"; "/")) |"' "${OUT_DIR}/${SERVICE}.json"
  fi
} > "${OUT_DIR}/${SERVICE}.md"
cat "${OUT_DIR}/${SERVICE}.md"
echo "##vso[task.uploadsummary]${OUT_DIR}/${SERVICE}.md"

# 4. Loki (best effort — never affects the build result).
if [[ -n "${LOKI_URL:-}" ]]; then
  LINE="$(jq -c . "${OUT_DIR}/${SERVICE}.json")"
  PAYLOAD="$(jq -n --arg svc "${SERVICE}" --arg gate "${GATE_STATUS}" --arg branch "${BRANCH}" --arg line "${LINE}" \
    '{streams:[{stream:{app:"homeease-ci",source:"sonarcloud",service:$svc,gate:$gate,branch:$branch},values:[[((now*1000000000)|floor|tostring),$line]]}]}')"
  curl -fsS --max-time 10 -H "Content-Type: application/json" ${LOKI_AUTH_HEADER:+-H "${LOKI_AUTH_HEADER}"} \
    --data-binary "${PAYLOAD}" "${LOKI_URL%/}/loki/api/v1/push" >/dev/null \
    && echo "Pushed Sonar report to Loki." || echo "Loki unreachable — report not stored."
fi

# 5. Enforce.
if [[ "${GATE_STATUS}" != "OK" && "${ENFORCE}" == "true" ]]; then
  echo "##vso[task.logissue type=error]Quality gate ${GATE_STATUS} for ${SERVICE}."
  exit 1
fi
exit 0
