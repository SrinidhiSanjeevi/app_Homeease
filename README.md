                         ┌──────────────────────┐
                         │       CUSTOMER       │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   CUSTOMER FRONTEND  │
                         │       React          │
                         └──────────┬───────────┘
                                    │
                                    │ REST API
                                    ▼
                         ┌──────────────────────┐
                         │       BACKEND        │
                         │    Node / Express    │
                         │                      │
                         │ Auth • Services      │
                         │ Booking • Emergency  │
                         │ Business Logic       │
                         └───────┬───────┬──────┘
                                 │       │
                   ┌─────────────┘       └──────────────┐
                   │                                    │
                   ▼                                    ▼
          ┌──────────────────┐                 ┌──────────────────┐
          │ PAYMENT SERVICE  │                 │ NOTIFICATION     │
          │                  │                 │ SERVICE          │
          │ Payment Logic    │                 │ Notification     │
          └────────┬─────────┘                 │ Delivery         │
                   │                           └────────┬─────────┘
                   ▼                                    ▼
          ┌──────────────────┐                 ┌──────────────────┐
          │ PAYMENT PROVIDER │                 │ EMAIL / NOTIFY   │
          └──────────────────┘                 │ PROVIDER         │
                                               └──────────────────┘

                                 │
                                 ▼
                        ┌──────────────────┐
                        │     MongoDB      │
                        │ Application Data │
                        └────────┬─────────┘
                                 │
                              imageKey
                                 │
                                 ▼
                       ┌────────────────────┐
                       │ Azure Blob Storage │
                       │   Service Images   │
                       └────────────────────┘


              ┌──────────────────────┐
              │        ADMIN         │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │   ADMIN FRONTEND     │
              │        React         │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │    ADMIN BACKEND     │
              │ Auth / Permissions   │
              │ Management / Audit   │
              └──────────┬───────────┘
                         ▼
                    Application
                       Data





CI Pipeline :


                  ┌──────────────────────┐
                  │   app_Homeease       │
                  │ Application + CI/CD  │
                  └──────────┬───────────┘
                             │
                         Git Push
                             │
                             ▼
                 ┌────────────────────────┐
                 │ 1. STATIC              │
                 │ Gitleaks               │
                 │ Hadolint               │
                 │ Change Detection       │
                 └───────────┬────────────┘
                             ▼
                 ┌────────────────────────┐
                 │ 2. VALIDATE             │
                 │ npm ci                  │
                 │ ESLint                  │
                 │ Unit/API tests          │
                 │ npm audit               │
                 │ Trivy FS                │
                 │ SonarCloud              │
                 └───────────┬────────────┘
                             ▼
                 ┌────────────────────────┐
                 │ 3. PACKAGE              │
                 │ Docker Build            │
                 │ Trivy Image             │
                 │ SBOM / Syft             │
                 │ Push                    │
                 └───────────┬────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ Azure Container Registry     │
              │ acrhomeeasedev01.azurecr.io  │
              │                              │
              │ homeease/backend:<git-sha>   │
              │ homeease/frontend:<git-sha>  │
              │ ...                          │
              └──────────────┬───────────────┘
                             │
                             ▼
                 ┌────────────────────────┐
                 │ 4. PROMOTE             │
                 │ GitOps repo            │
                 │ image.tag = Git SHA    │
                 └───────────┬────────────┘
                             │
                             ▼
                  ┌─────────────────────┐
                  │ Gitops_Homeease     │
                  │ Helm values         │
                  └─────────┬───────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Argo CD   │
                     │ Auto Sync   │
                     │ Self Heal   │
                     └──────┬──────┘
                            ▼
                     ┌─────────────┐
                     │ AKS DEV     │
                     │ HomeEase    │
                     └──────┬──────┘
                            ▼
                    5. VERIFY DEV
                    health + smoke
                            │
                            ▼
                    6. CI METRICS
                      Pushgateway
                            │
                            ▼
                  Prometheus / Grafana


