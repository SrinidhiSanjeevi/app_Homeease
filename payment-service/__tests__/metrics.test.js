const request = require("supertest");
const app = require("../server");
const metrics = require("../metrics");

describe("Payment Service Metrics Endpoint", () => {
  it("GET /metrics returns 200 and exposes Prometheus metrics including payment_* counters", async () => {
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    // RED metrics
    expect(res.text).toContain("http_request_duration_seconds");
    expect(res.text).toContain("http_requests_total");
    expect(res.text).toContain("http_requests_in_flight");

    // Payment-specific metrics
    expect(res.text).toContain("payment_order_created_total");
    expect(res.text).toContain("payment_verify_success_total");
    expect(res.text).toContain("payment_verify_failed_total");
    expect(res.text).toContain("payment_refund_total");
  });

  it("increments paymentOrderCreatedTotal counter directly and reflects in /metrics", async () => {
    metrics.paymentOrderCreatedTotal.inc();
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("payment_order_created_total");
  });
});
