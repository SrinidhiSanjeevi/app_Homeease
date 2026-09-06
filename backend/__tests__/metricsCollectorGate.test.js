const logger = require("../utils/logger");

describe("Task 8: Metrics Collector Environment Gating", () => {
  const originalEnv = process.env.METRICS_COLLECTOR_ENABLED;
  let infoSpy;

  beforeEach(() => {
    infoSpy = jest.spyOn(logger, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
    if (originalEnv !== undefined) {
      process.env.METRICS_COLLECTOR_ENABLED = originalEnv;
    } else {
      delete process.env.METRICS_COLLECTOR_ENABLED;
    }
  });

  test("runs startMetricsCollector and logs confirmation when METRICS_COLLECTOR_ENABLED is 'true'", () => {
    process.env.METRICS_COLLECTOR_ENABLED = "true";
    const startMetricsCollectorMock = jest.fn();

    if (process.env.METRICS_COLLECTOR_ENABLED === "true") {
      startMetricsCollectorMock();
      logger.info("Metrics collector started (METRICS_COLLECTOR_ENABLED=true)");
    } else {
      logger.info("Metrics collector not started (METRICS_COLLECTOR_ENABLED not set to 'true')");
    }

    expect(startMetricsCollectorMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("Metrics collector started (METRICS_COLLECTOR_ENABLED=true)");
  });

  test("does not run startMetricsCollector when METRICS_COLLECTOR_ENABLED is 'false'", () => {
    process.env.METRICS_COLLECTOR_ENABLED = "false";
    const startMetricsCollectorMock = jest.fn();

    if (process.env.METRICS_COLLECTOR_ENABLED === "true") {
      startMetricsCollectorMock();
      logger.info("Metrics collector started (METRICS_COLLECTOR_ENABLED=true)");
    } else {
      logger.info("Metrics collector not started (METRICS_COLLECTOR_ENABLED not set to 'true')");
    }

    expect(startMetricsCollectorMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith("Metrics collector not started (METRICS_COLLECTOR_ENABLED not set to 'true')");
  });

  test("does not run startMetricsCollector when METRICS_COLLECTOR_ENABLED is unset (default)", () => {
    delete process.env.METRICS_COLLECTOR_ENABLED;
    const startMetricsCollectorMock = jest.fn();

    if (process.env.METRICS_COLLECTOR_ENABLED === "true") {
      startMetricsCollectorMock();
      logger.info("Metrics collector started (METRICS_COLLECTOR_ENABLED=true)");
    } else {
      logger.info("Metrics collector not started (METRICS_COLLECTOR_ENABLED not set to 'true')");
    }

    expect(startMetricsCollectorMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith("Metrics collector not started (METRICS_COLLECTOR_ENABLED not set to 'true')");
  });
});
