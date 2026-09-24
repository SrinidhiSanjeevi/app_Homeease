/**
 * Server-side booking price. The client's totalPrice is never trusted —
 * the amount a customer pays is always computed here from the service
 * catalogue (must match the breakdown shown in frontend BookingModal).
 */

const GST_RATE = 0.18;
// Base price of a "Custom Service Request" (frontend Dashboard.jsx).
const CUSTOM_REQUEST_PRICE = Number(process.env.CUSTOM_REQUEST_PRICE) || 999;

/**
 * @param {object|null} service   Service document (null for custom requests)
 * @param {object|null} selectedProduct  { name, brand } chosen by the customer
 * @returns {{ ok: true, subtotal, gst, total, product } | { ok: false, message }}
 */
function calculateBookingPrice(service, selectedProduct, isCustom) {
  let base;
  let product = null;

  if (isCustom) {
    base = CUSTOM_REQUEST_PRICE;
  } else {
    if (!service) return { ok: false, message: "Service not found" };
    base = Number(service.price) || 0;

    if (selectedProduct && selectedProduct.name) {
      const match = (service.products || []).find(
        (p) => p.name === selectedProduct.name && (!selectedProduct.brand || p.brand === selectedProduct.brand)
      );
      if (!match) {
        return { ok: false, message: "The selected option is no longer available for this service" };
      }
      product = { name: match.name, brand: match.brand, extraPrice: Number(match.extraPrice) || 0 };
    }
  }

  const subtotal = base + (product ? product.extraPrice : 0);
  const gst = Math.round(subtotal * GST_RATE);
  return { ok: true, subtotal, gst, total: subtotal + gst, product };
}

module.exports = { GST_RATE, CUSTOM_REQUEST_PRICE, calculateBookingPrice };
