# CI/CD pipeline — one-time setup

The pipeline itself is `../azure-pipelines.yml`, with per-service steps
in `templates/`. This file only covers what a human has to configure
once, outside of Git, for the pipeline to run — none of it can be set up
from a commit in this repo.

## `GITOPS_PAT` — required for the Promote stage

Stage 4 (Promote) bumps `image.tag` in
[`Gitops_Homeease`](https://github.com/SrinidhiSanjeevi/Gitops_Homeease)'s
`charts/<service>/values-azure-dev.yaml` files (all 5 services: backend,
admin-backend, frontend, admin-frontend, payment-service) and pushes the
commit directly to that repo's `main` — that's what Argo CD's
already-automated sync policy then picks up.

**As of this writing, `GITOPS_PAT` does not yet exist in the
`homeease-ci` variable group** (verified via `az pipelines
variable-group variable list`) — the Promote stage will fail fast with
an explicit error until it's added. Follow the steps below once.

To let this pipeline push there, add a secret pipeline variable named
`GITOPS_PAT`:

1. On **github.com/SrinidhiSanjeevi/Gitops_Homeease** → Settings →
   Developer settings → Personal access tokens → **Fine-grained tokens**
   → generate one scoped to **only this repository**, with **Contents:
   Read and write** permission and nothing else (no org-wide access, no
   other permission scopes).
2. In Azure DevOps → Pipelines → Library → the `homeease-ci` variable
   group (already used by this pipeline for `PUSHGATEWAY_URL`) → add a
   variable named `GITOPS_PAT`, paste the token, and toggle
   **Keep this value secret** on. Never commit this value to either
   repo.
3. Re-run the pipeline. If `GITOPS_PAT` isn't set, the Promote stage
   fails fast with an explicit error instead of a confusing git-auth
   failure — see the "Bump image.tag + push" step in
   `../azure-pipelines.yml`.

Azure DevOps automatically redacts any exact occurrence of a secret
variable's value from build logs, including if it ends up embedded in a
URL inside a git error message — this is the same mechanism
`$(System.AccessToken)` already relies on in the Report stage below, not
something new added for this token.

## Why a direct push to `main` for DEV, not a PR

Argo CD's DEV service Applications already sync `main` automatically
(`syncPolicy.automated.selfHeal`), and the only thing the DEV Promote
stage changes is a `tag:` value in a file Argo CD already watches. For
DEV, continuous deployment is the goal: every verified merge should be
running within minutes, and a review of "old SHA -> new SHA" adds a
wait without adding information. PROD is different — see below.

## PROD promotion (stage 7) — one-time setup

Stage 7 copies the image tags DEV was **verified** at into
`Gitops_Homeease`'s `charts/<service>/values-azure-prod.yaml`, and only
after a human approves it on the `homeease-prod` Azure DevOps
environment. Nothing is rebuilt. It is compiled out of the pipeline
until `enableProdPromotion` is `'true'` in `../azure-pipelines.yml`.

**Do these in order, and do not flip the switch before step 3.** If the
pipeline references an environment that doesn't exist, Azure DevOps
creates it automatically **with no approvals**, so the first run would
promote without anyone approving it.

1. **Environment.** Pipelines -> Environments -> New environment ->
   name `homeease-prod`, resource *None*.
2. **Approval.** `homeease-prod` -> *Approvals and checks* ->
   - **Approvals**: add the approver(s). On a one-person project, keep
     *"Allow approvers to approve their own runs"* on, or nobody can
     approve. With two or more people, turn it off, so whoever pushed
     the change can't also approve it.
   - **Exclusive lock**: add it. Together with the stage's
     `lockBehavior: runLatest`, older runs still waiting are cancelled
     when a newer one reaches the gate.
3. **PROD token.** Create a second fine-grained GitHub PAT (same scope
   as `GITOPS_PAT`: only `Gitops_Homeease`, *Contents: Read and write*).
   Pipelines -> Library -> new variable group **`homeease-prod-gitops`**
   -> secret variable `GITOPS_PROD_PAT`. Under the group's *Pipeline
   permissions*, allow **only this pipeline** (not "open access").
4. Set `enableProdPromotion: 'true'` in `../azure-pipelines.yml`, commit
   through the normal PR.

The next `main` run then stops at *7. Promote to PROD* with
"Waiting for approval". Approve it and the stage pushes one commit to
`Gitops_Homeease` (`ci(prod): promote ... to prod`). Reject it, or let
it time out, and PROD is untouched.

The prod cluster itself (Terraform `environments/prod`, its ArgoCD,
`argocd/azure-prod/bootstrap/root-app.yaml`, the `REPLACE_ME` values) is
a separate prerequisite. Until it exists, an approved promotion only
updates Git, and nothing deploys it.

### What the approval does and does not protect

`GITOPS_PAT` and `GITOPS_PROD_PAT` are both repo-wide Contents:write
tokens. A fine-grained PAT cannot be limited to one path, so either
token, or any person with write access to `Gitops_Homeease`, can edit
`values-azure-prod.yaml` directly. The approval gates **this pipeline's**
route to PROD. It does not stop someone from bypassing the pipeline.
What the separate token does buy: it is only released to the job after
approval, it can be revoked without breaking DEV, and it can only be
used by this pipeline. Making Git itself enforce the approval is a
future step: PR-based promotion with a required reviewer, on a branch
or repo the DEV token cannot write to.
