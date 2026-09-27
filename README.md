# HomeEase

A home-services booking platform — customers book professionals for
services, admins manage bookings/professionals/services, payments run
through Razorpay via an internal payment service. Five services, built
and shipped as containers, deployed by two companion repos:

- **`gitops_homeease`** — Helm charts + Argo CD. Deploys this repo's
  images to the live AKS cluster (`aks-homeease-dev`).
- **`Infrastruture_Homeease`** — Terraform. Provisions the Azure
  infrastructure this runs on (and a parallel, unapplied AWS path).

This repo owns the application code and its CI: build, scan, sign, push.
It does not deploy anything itself — see "How an image goes live" below.

## Services

| Service | Port | Public? | Role |
|---|---|---|---|
| `frontend` | 8080 | Yes (via nginx) | Customer-facing React SPA |
| `admin-frontend` | 8080 | Yes (via nginx) | Admin console React SPA |
| `backend` | 5000 | Via `frontend`'s proxy | Customer API — auth, bookings, services, payments orchestration |
| `admin-backend` | 5001 | Via `admin-frontend`'s proxy | Admin API — professionals, bookings management, audit log |
| `payment-service` | 5002 | Internal only | Razorpay integration — order creation, verification, refunds. Callable only by `backend` |

`frontend`/`admin-frontend` are Vite/React apps served by
`nginx-unprivileged`, which also reverse-proxies `/api/` to their
respective backend(s) — the browser never talks to `backend`/
`admin-backend`/`payment-service` directly. `backend`, `admin-backend`,
and `payment-service` are Node/Express APIs backed by MongoDB.

## Repo layout

```
backend/, admin-backend/, frontend/, admin-frontend/, payment-service/
  Dockerfile            multi-stage, non-root, health-checked (see below)
  .env.example          required env vars — copy to .env, fill in real values
  package.json           start/dev/lint/build scripts; only backend has a test script
  sonar-project.properties

docker-compose.yml       local orchestration — all 5 services + a shared bridge network
azure-pipelines.yml       Azure DevOps CI — the pipeline that feeds the LIVE cluster
.azuredevops/             one-time human setup this pipeline needs (service connections,
                         environment approvals) — see its own README
.github/workflows/
  aws-ci.yml              GitHub Actions CI — builds/scans/signs/pushes to ECR (AWS side,
                         no live deployment target today — see Infrastruture_Homeease's
                         _reference-eks/ and environments/fargate-dev/)
.pre-commit-config.yaml   gitleaks, run locally before a commit leaves your machine
scripts/sonar-scan.sh     local SonarQube scan against all services
```

## Running locally

```bash
nvm use                       # .nvmrc pins Node 22
cp backend/.env.example backend/.env
cp admin-backend/.env.example admin-backend/.env
cp payment-service/.env.example payment-service/.env
# fill in real values — MONGO_URI, JWT_SECRET, RAZORPAY_* at minimum

docker compose up --build
# frontend:       http://localhost:8080
# admin-frontend: http://localhost:8081
```

Each service also runs standalone for development:

```bash
cd backend && npm ci && npm run dev     # nodemon, hits your local .env
cd frontend && npm ci && npm run dev    # vite dev server
```

Health endpoints (used by Docker healthchecks and Kubernetes probes
alike): `/health/live` (process up), `/health/ready` (dependencies, e.g.
MongoDB, actually reachable), `/api/health` (legacy/general). Frontends
expose `/health` via nginx.

## CI — two pipelines, one set of gates

Both pipelines run the same security posture, cloud-native
implementations of the same idea — see either workflow file's own header
comment for the full reasoning:

- **`azure-pipelines.yml`** (Azure DevOps) — the **live** path. Builds,
  scans (Trivy fs + image, npm audit, Hadolint), signs (Key Vault KMS,
  currently disabled pending a signing key — see the file's own
  comment), pushes to ACR, then promotes the new tag into
  `gitops_homeease` by committing directly to its `main`. Argo CD picks
  it up from there.
- **`aws-ci.yml`** (GitHub Actions) — same gates, keyless Cosign signing
  via GitHub OIDC (works today, unlike the Azure side), pushes to ECR,
  then promotes the tag into `Infrastruture_Homeease`'s
  `environments/fargate-dev/image-tags.auto.tfvars` for the AWS Fargate
  path.

Only `backend` has a real test suite (`node --test`) today — CI runs it
for backend only, matching what actually exists rather than faking
coverage for the other four services. Every service gets: lint,
`npm audit --audit-level=high`, Trivy filesystem scan, a SonarQube scan
with an **enforced** Quality Gate (not just submitted-and-ignored).

## How an image goes live

```
git push (this repo)
  → CI builds, scans, signs, pushes to a registry
  → CI commits a tag bump to the GitOps/infra repo
  → Argo CD (Azure) or a gated Terraform apply (AWS Fargate) picks it up
```

Nothing in this repo runs `kubectl apply`, `helm install`, or
`terraform apply` — deployment is entirely the other two repos'
responsibility, triggered by a commit this repo's CI makes.

## Security posture

- Every Dockerfile: multi-stage, non-root user, `readOnlyRootFilesystem`
  at the Kubernetes layer, `dumb-init` for signal handling, no `npm`/
  `npx` in the runtime image.
- Gitleaks on every push (CI) and every commit (pre-commit hook).
- No static cloud credentials anywhere — both CI pipelines authenticate
  via OIDC (GitHub OIDC → AWS IAM role; Azure DevOps Workload Identity
  federation → Azure).
- Prometheus metrics (`prom-client`) on every backend service — RED
  method (`http_request_duration_seconds`, `http_requests_total`) plus
  business-specific counters/gauges, scraped by the observability stack
  in `gitops_homeease`.
