const mongoose = require("mongoose");
const {
  register,
  mongodbConnectionState
} = require("../metrics");
const metricsPlugin = require("../config/metricsPlugin");
const connectDB = require("../config/db");

describe("Task 7: Admin Backend Mongo Metrics", () => {
  describe("mongodbConnectionState Gauge", () => {
    test("sets gauge to 1 on 'connected' event", async () => {
      mongoose.connection.emit("connected");
      const metricStr = await register.getSingleMetricAsString("mongodb_connection_state");
      expect(metricStr).toContain("mongodb_connection_state 1");
    });

    test("sets gauge to 0 on 'disconnected' event", async () => {
      mongoose.connection.emit("disconnected");
      const metricStr = await register.getSingleMetricAsString("mongodb_connection_state");
      expect(metricStr).toContain("mongodb_connection_state 0");
    });

    test("sets gauge to 1 on 'reconnected' event", async () => {
      mongoose.connection.emit("reconnected");
      const metricStr = await register.getSingleMetricAsString("mongodb_connection_state");
      expect(metricStr).toContain("mongodb_connection_state 1");
    });

    test("sets gauge to 1 after successful connectDB()", async () => {
      const originalConnect = mongoose.connect;
      mongoose.connect = jest.fn().mockResolvedValue(true);

      mongodbConnectionState.set(0);
      await connectDB();

      const metricStr = await register.getSingleMetricAsString("mongodb_connection_state");
      expect(metricStr).toContain("mongodb_connection_state 1");

      mongoose.connect = originalConnect;
    });
  });

  describe("metricsPlugin query duration and error metrics", () => {
    let TestModel;

    beforeAll(() => {
      const testSchema = new mongoose.Schema({
        name: String,
        val: Number
      });
      metricsPlugin(testSchema);
      TestModel = mongoose.model("TestMetricsTarget", testSchema);
    });

    test("records query duration on find operation", async () => {
      const query = TestModel.find({ name: "Alice" });

      // Run pre hook
      await query.schema.s.hooks.execPre("find", query, []);
      // Run post hook with mock result
      await query.schema.s.hooks.execPost("find", query, [[{ name: "Alice", val: 1 }]]);

      const metricStr = await register.getSingleMetricAsString("mongodb_query_duration_seconds");
      expect(metricStr).toContain('collection="testmetricstargets"');
      expect(metricStr).toContain('op="find"');
      expect(metricStr).toContain("mongodb_query_duration_seconds_count");
    });

    test("records query error on failed operation", async () => {
      const query = TestModel.findOne({ name: "Bob" });

      // Run pre hook
      await query.schema.s.hooks.execPre("findOne", query, []);
      // Run error post hook
      const simulatedErr = new Error("Simulated query timeout");
      try {
        await query.schema.s.hooks.execPost("findOne", query, [null], { error: simulatedErr });
      } catch (err) {
        expect(err).toBe(simulatedErr);
      }

      const metricStr = await register.getSingleMetricAsString("mongodb_query_errors_total");
      expect(metricStr).toContain('collection="testmetricstargets"');
      expect(metricStr).toContain('op="findOne"');
      expect(metricStr).toContain("mongodb_query_errors_total");
    });
  });
});
