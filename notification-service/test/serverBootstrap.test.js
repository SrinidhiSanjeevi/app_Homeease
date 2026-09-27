// The startup-time paths in server.js are all gated behind
// `process.env.NODE_ENV !== "test"` (env validation, connectDB, app.listen,
// scheduler, graceful shutdown) — deliberately skipped by every other test
// file so the app can be imported and exercised over HTTP without a real
// database. That means they need a real process, not an in-process require,
// to cover honestly. This file spawns `node server.js` as a child process
// with a clean env to exercise the one startup path that's both
// deterministic and side-effect-free to assert on: failing fast with a
// clear fatal log when required environment variables are missing (never
// reaches connectDB/app.listen, so nothing needs a real Mongo or a free
// port). The listen/connectDB/scheduler/shutdown path itself is exercised
// for real by the pipeline's separate "Verify DEV rollout + health" stage
// against the actual deployed service, not re-created here with mocks.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("server.js exits fatally with a clear message when required env vars are missing", () => {
  const result = spawnSync(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production"
      // MONGO_URI and BOOKING_SERVICE_URL intentionally absent.
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FATAL/);
  assert.match(result.stdout, /Missing required environment variables/);
  assert.match(result.stdout, /MONGO_URI/);
  assert.match(result.stdout, /BOOKING_SERVICE_URL/);
});
