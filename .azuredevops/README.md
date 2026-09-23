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

## Why a direct push to `main`, not a PR

Argo CD's 4 service Applications already sync `main` automatically
(`syncPolicy.automated.selfHeal`), and the only thing this stage changes
is a `tag:` value in a file Argo CD already watches — no chart or
Application shape changes. A PR step would just be a review gate with
nothing to review (the diff is always "old SHA → new SHA"), while adding
a second manual step between "image pushed" and "image deployed" that
this project doesn't have branch protection or reviewers set up for
today. If that changes, gate this stage behind a PR instead of a direct
push — the script only needs its last `git push` line replaced.
