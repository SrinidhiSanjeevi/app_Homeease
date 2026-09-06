# Payment Service Security Architecture & Network Trust Notes

## 1. Current State & Trust Boundary Architecture

The `payment-service` microservice exposes several HTTP endpoints under `/api/payments`:
- `POST /api/payments/order`
- `POST /api/payments/verify`
- `POST /api/payments/refund`
- `GET /api/payments/status`
- `POST /api/payments/webhook`

### Internal Endpoints (`/order`, `/verify`, `/refund`, `/status`)
None of the core payment processing endpoints enforce transport- or application-level authentication (such as JWT verification or API keys) within `payment-service` itself. 

Instead, the main Customer API service (`backend/`) acts as the **trusted intermediary**:
1. Incoming customer requests from the frontend pass through `backend/middleware/authMiddleware.js`, which verifies the JWT signature and expiration.
2. The customer's identity (`userId`) is extracted directly from the verified token (`req.user._id`) and forwarded to `payment-service` via `backend/services/payment/paymentClient.js`.
3. End users accessing the platform via the browser/frontend are protected because they cannot bypass `backend`'s JWT validation layer.

**Core Vulnerability / Threat Model:**
While customer-facing requests are authenticated at the edge, `payment-service` itself does not verify the caller's identity. Any client or workload capable of sending network traffic to port 5002 can invoke payment endpoints directly with arbitrary `userId` and `bookingId` parameters.

---

## 2. Mandatory Kubernetes Requirements Before Deployment

Prior to deploying `payment-service` to any shared or production Kubernetes cluster, the following network safeguards are mandatory:

### a. No Ingress Exposure (Strictly ClusterIP)
`payment-service` must never be exposed via a Kubernetes `Ingress` resource or public cloud `LoadBalancer`. Its Kubernetes `Service` must be configured strictly as `type: ClusterIP`, keeping the service invisible from outside the cluster virtual network.

### b. NetworkPolicy Ingress Whitelisting
A Kubernetes `NetworkPolicy` must be enforced on the `payment-service` namespace to deny all ingress traffic by default and allow inbound connections on port 5002 exclusively from pods matching the Customer API (`backend`) pod selector:

- **Customer API (`backend`)**: Must be allowed to communicate with `payment-service`.
- **Admin Backend (`admin-backend`)**: An audit of `admin-backend/` confirms **zero** references to `PAYMENT_SERVICE_URL`, `paymentClient`, or payment-service endpoints. Because `admin-backend` does not communicate with `payment-service`, **the NetworkPolicy must NOT include `admin-backend` in the allowed pod selector**. Unnecessary inter-service access violates the principle of least privilege and must be blocked.
- **Other Pods & Namespaces**: Must be blocked by default.

### c. Known Limitation & Defense-in-Depth (Deferred)
Relying solely on Kubernetes NetworkPolicies leaves the service vulnerable to network misconfigurations or lateral movement if another pod in the same selector is compromised. 

A defense-in-depth mechanism—such as:
- A shared pre-shared key / HMAC authentication header (e.g., `X-Internal-Service-Key`), or
- Mutual TLS (mTLS via Istio / Linkerd / service mesh)

would ensure application-level authentication regardless of network posture. This is a known limitation and is intentionally deferred to be designed alongside the Kubernetes infrastructure and NetworkPolicy deployment.

---

## 3. Webhook Authentication Model (`/api/payments/webhook`)

The `/api/payments/webhook` route operates on a distinct security boundary from the rest of the service:
- It does **not** rely on JWTs or internal service tokens.
- Authentication is handled cryptographically via an **HMAC-SHA256 signature** provided in the `x-razorpay-signature` header, verified against the raw request body buffer using `RAZORPAY_WEBHOOK_SECRET` inside `processWebhook()`.
- Because Razorpay's external servers must deliver webhook event notifications (e.g., `payment.captured`), this is the **only route** in `payment-service` that legitimately requires external network accessibility.
- If external routing is configured in Kubernetes for webhooks, it must selectively expose *only* the `/api/payments/webhook` path (e.g., via ingress path-based routing or a reverse-proxy forwarding specifically to the webhook endpoint), keeping all customer endpoints (`/order`, `/verify`, etc.) strictly internal.
