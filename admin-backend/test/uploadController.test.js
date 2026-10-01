// Proves image upload accepts small images, rejects other files, and returns the stored key and URL (blob storage stubbed).
process.env.LOG_LEVEL = "silent";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

// Replace the Azure storage module before the controller loads it.
const blobPath = require.resolve("../services/blobStorage");
const uploads = [];
let failUpload = false;
require.cache[blobPath] = {
  id: blobPath,
  filename: blobPath,
  loaded: true,
  exports: {
    uploadBuffer: async (buffer, container, name, type) => {
      if (failUpload) throw new Error("azure down");
      uploads.push({ size: buffer.length, container, name, type });
    },
    generateImageUrl: async (key) => `https://cdn.test/${key}?sig=1`
  }
};
const { uploadImage } = require("../controllers/uploadController");

async function withServer(fn) {
  const app = express();
  app.post("/upload", (req, _res, next) => { req.user = { email: "a@x.com" }; next(); }, uploadImage);
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/upload`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const form = (bytes, type, field = "image") => {
  const body = new FormData();
  body.append(field, new Blob([bytes], { type }), "pic");
  return body;
};

test("uploads an image to the services container by default", async () => {
  uploads.length = 0;
  await withServer(async (url) => {
    const res = await fetch(url, { method: "POST", body: form("abc", "image/png") });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.match(json.imageKey, /^service-images\/[0-9a-f-]{36}\.png$/);
    assert.match(json.imageUrl, /^https:\/\/cdn\.test\//);
  });
  assert.deepEqual([uploads[0].container, uploads[0].type, uploads[0].size], ["service-images", "image/png", 3]);
});

test("uploads to the professionals container and ignores unknown folders", async () => {
  uploads.length = 0;
  await withServer(async (url) => {
    await fetch(`${url}?folder=professionals`, { method: "POST", body: form("a", "image/jpeg") });
    await fetch(`${url}?folder=../../etc`, { method: "POST", body: form("a", "image/webp") });
  });
  assert.deepEqual(uploads.map((u) => u.container), ["professional-images", "service-images"]);
});

test("rejects non-image files and requests without a file", async () => {
  await withServer(async (url) => {
    const text = await fetch(url, { method: "POST", body: form("hello", "text/plain") });
    assert.equal(text.status, 400);
    assert.match((await text.json()).error, /Only image files/);
    const none = await fetch(url, { method: "POST", body: form("a", "image/png", "other") });
    assert.equal(none.status, 400);
  });
});

test("rejects files over 5 MB with 413", async () => {
  await withServer(async (url) => {
    const res = await fetch(url, { method: "POST", body: form(Buffer.alloc(5 * 1024 * 1024 + 10), "image/png") });
    assert.equal(res.status, 413);
  });
});

test("passes storage failures to the error handler", async () => {
  failUpload = true;
  try {
    await withServer(async (url) => {
      const res = await fetch(url, { method: "POST", body: form("a", "image/png") });
      assert.equal(res.status, 500);
      assert.equal((await res.json()).error, "azure down");
    });
  } finally {
    failUpload = false;
  }
});
