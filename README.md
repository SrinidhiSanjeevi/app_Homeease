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