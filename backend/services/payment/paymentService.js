/**
 * Customer Core Payment Service Adapter
 *
 * In Phase B, payment domain operations are extracted into the standalone Payment Service.
 * Customer API communicates with Payment Service exclusively via paymentClient over HTTP.
 * This adapter re-exports paymentClient to preserve backward compatibility across all callers.
 */

module.exports = require("./paymentClient");
