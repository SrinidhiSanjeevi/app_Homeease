// Proves calculateBookingPrice adds product extras and 18% GST, and rejects unknown services/products.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateBookingPrice, CUSTOM_REQUEST_PRICE } = require("../services/pricing");

const service = { price: 500, products: [{ name: "Oil", brand: "A", extraPrice: 100 }] };

test("plain service: subtotal is the price, GST is 18%", () => {
  const price = calculateBookingPrice(service, null, false);
  assert.deepEqual(price, { ok: true, subtotal: 500, gst: 90, total: 590, product: null });
});

test("selected product adds its extra price", () => {
  const price = calculateBookingPrice(service, { name: "Oil", brand: "A" }, false);
  assert.equal(price.subtotal, 600);
  assert.equal(price.total, 600 + 108);
  assert.equal(price.product.name, "Oil");
});

test("unknown product is rejected", () => {
  const price = calculateBookingPrice(service, { name: "Nope" }, false);
  assert.equal(price.ok, false);
});

test("missing service is rejected, custom requests use the flat price", () => {
  assert.equal(calculateBookingPrice(null, null, false).ok, false);
  assert.equal(calculateBookingPrice(null, null, true).subtotal, CUSTOM_REQUEST_PRICE);
});
