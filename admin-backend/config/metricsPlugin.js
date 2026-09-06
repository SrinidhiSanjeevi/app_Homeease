const { mongodbQueryDurationSeconds, mongodbQueryErrorsTotal } = require("../metrics");

function metricsPlugin(schema) {
  schema.pre(/^find|update|delete|count/, function (next) {
    this._metricsStart = process.hrtime.bigint();
    if (typeof next === "function") {
      next();
    }
  });

  schema.post(/^find|update|delete|count/, function (result, next) {
    const durationSeconds = this._metricsStart
      ? Number(process.hrtime.bigint() - this._metricsStart) / 1e9
      : 0;
    const collectionName = this.model?.collection?.name || "unknown";
    const op = this.op || "unknown";
    mongodbQueryDurationSeconds.labels(collectionName, op).observe(durationSeconds);
    if (typeof next === "function") {
      next();
    }
  });

  schema.post(/^find|update|delete|count/, function (err, doc, next) {
    if (err) {
      const collectionName = this.model?.collection?.name || "unknown";
      const op = this.op || "unknown";
      mongodbQueryErrorsTotal.labels(collectionName, op).inc();
    }
    if (typeof next === "function") {
      next(err);
    }
  });
}

module.exports = metricsPlugin;
