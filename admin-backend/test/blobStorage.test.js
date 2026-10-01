// Proves blob helpers validate image keys and build read-only HTTPS SAS URLs without calling Azure.
process.env.LOG_LEVEL = "silent";
process.env.AZURE_STORAGE_ACCOUNT_NAME = "testaccount";
process.env.AZURE_STORAGE_ACCOUNT_KEY = Buffer.from("test-key").toString("base64");
const test = require("node:test");
const assert = require("node:assert/strict");
const blob = require("../services/blobStorage");

test("parseImageKey splits container and blob name", () => {
  assert.deepEqual(blob.parseImageKey("service-images/a.png"), { containerName: "service-images", blobName: "a.png" });
  assert.deepEqual(blob.parseImageKey(" c/dir/b.png "), { containerName: "c", blobName: "dir/b.png" });
});

test("parseImageKey rejects unsafe or malformed keys", () => {
  for (const bad of [null, 42, "", "  ", "/abs/x", "../x", "a/../b", "nocontainer", "/x", "container/"]) {
    assert.equal(blob.parseImageKey(bad), null, String(bad));
  }
});

test("generateImageUrl returns null for empty or invalid keys", async () => {
  assert.equal(await blob.generateImageUrl(""), null);
  assert.equal(await blob.generateImageUrl("../bad"), null);
});

test("generateImageUrl returns an https read-only SAS URL", async () => {
  blob._resetClient();
  const url = new URL(await blob.generateImageUrl("service-images/a.png", 5));
  assert.equal(url.origin, "https://testaccount.blob.core.windows.net");
  assert.equal(url.pathname, "/service-images/a.png");
  assert.equal(url.searchParams.get("sp"), "r");
  assert.equal(url.searchParams.get("spr"), "https");
  assert.ok(url.searchParams.get("sig"));
});

test("generateImageUrl returns null when the account name is not configured", async () => {
  const saved = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
  try {
    assert.equal(await blob.generateImageUrl("c/b.png"), null);
  } finally {
    process.env.AZURE_STORAGE_ACCOUNT_NAME = saved;
  }
});

test("generateImageUrl returns null instead of throwing when the Azure client fails", async () => {
  blob._resetClient();
  const { BlobServiceClient } = require("@azure/storage-blob");
  const original = BlobServiceClient.prototype.getContainerClient;
  try {
    for (const error of [
      Object.assign(new Error("denied"), { name: "AuthenticationError" }),
      Object.assign(new Error("missing"), { statusCode: 404 }),
      new Error("network down")
    ]) {
      BlobServiceClient.prototype.getContainerClient = () => { throw error; };
      assert.equal(await blob.generateImageUrl("c/b.png"), null);
    }
  } finally {
    BlobServiceClient.prototype.getContainerClient = original;
    blob._resetClient();
  }
});

test("attachImageUrls adds imageUrl for items with a key and null otherwise", async () => {
  assert.deepEqual(await blob.attachImageUrls(null), []);
  assert.deepEqual(await blob.attachImageUrls([]), []);
  const [withKey, withoutKey] = await blob.attachImageUrls([{ id: 1, imageKey: "c/a.png" }, { id: 2 }]);
  assert.match(withKey.imageUrl, /^https:\/\/testaccount\.blob\.core\.windows\.net\/c\/a\.png\?/);
  assert.equal(withoutKey.imageUrl, null);
});

test("uploadBuffer creates the container, uploads the data and returns the plain blob URL", async () => {
  blob._resetClient();
  const { BlobServiceClient } = require("@azure/storage-blob");
  const uploaded = [];
  const original = BlobServiceClient.prototype.getContainerClient;
  BlobServiceClient.prototype.getContainerClient = () => ({
    createIfNotExists: async () => {},
    getBlockBlobClient: (name) => ({
      url: `https://testaccount.blob.core.windows.net/c/${name}`,
      uploadData: async (buffer, options) => { uploaded.push([buffer.length, options.blobHTTPHeaders.blobContentType]); }
    })
  });
  try {
    const url = await blob.uploadBuffer(Buffer.from("abc"), "c", "x.png", "image/png");
    assert.equal(url, "https://testaccount.blob.core.windows.net/c/x.png");
    assert.deepEqual(uploaded, [[3, "image/png"]]);
  } finally {
    BlobServiceClient.prototype.getContainerClient = original;
    blob._resetClient();
  }
});
