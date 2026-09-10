const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol
} = require("@azure/storage-blob");
const logger = require("../utils/logger");

let blobServiceClient = null;
let cachedUserDelegationKey = null;
let cachedDelegationKeyExpiresAt = 0;

/**
 * Validates and extracts containerName and blobName from imageKey.
 * Expected format: "<containerName>/<blobName>"
 * Rejects path traversal and empty names.
 */
function parseImageKey(imageKey) {
  if (!imageKey || typeof imageKey !== "string") {
    return null;
  }
  const trimmed = imageKey.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("..")) {
    return null;
  }
  const separatorIndex = trimmed.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }
  const containerName = trimmed.substring(0, separatorIndex);
  const blobName = trimmed.substring(separatorIndex + 1);
  return { containerName, blobName };
}

/**
 * Returns a singleton BlobServiceClient instance.
 * Prefers DefaultAzureCredential for Entra ID auth.
 */
function getBlobServiceClient() {
  if (blobServiceClient) {
    return blobServiceClient;
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    throw new Error("AZURE_STORAGE_ACCOUNT_NAME is not configured");
  }

  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;

  if (accountKey) {
    const credential = new StorageSharedKeyCredential(accountName, accountKey);
    blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      credential
    );
  } else {
    const { DefaultAzureCredential } = require("@azure/identity");
    blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
  }

  return blobServiceClient;
}

/**
 * In-memory cached retrieval of User Delegation Key for Entra ID.
 * Avoids repeated network round-trips for every image.
 */
async function getUserDelegationKeyCached(client, _accountName) {
  const now = Date.now();
  // Reuse key if at least 5 minutes remaining
  if (cachedUserDelegationKey && cachedDelegationKeyExpiresAt - now > 5 * 60 * 1000) {
    return cachedUserDelegationKey;
  }

  const startsOn = new Date(now - 5 * 60 * 1000); // 5-minute clock-skew buffer
  const expiresOn = new Date(now + 60 * 60 * 1000); // 1-hour delegation key validity

  const delegationKey = await client.getUserDelegationKey(startsOn, expiresOn);
  cachedUserDelegationKey = delegationKey;
  cachedDelegationKeyExpiresAt = expiresOn.getTime();
  return delegationKey;
}

/**
 * Generates a short-lived, read-only HTTPS SAS URL for an imageKey.
 * Never logs the full SAS URL or any credentials.
 * Returns null if generation fails or imageKey is invalid.
 */
async function generateImageUrl(imageKey, expiresInMinutes = 15) {
  if (!imageKey) {
    return null;
  }

  const parsed = parseImageKey(imageKey);
  if (!parsed) {
    logger.warn({ imageKey }, "Invalid Azure Blob imageKey format");
    return null;
  }

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (!accountName) {
    logger.error("AZURE_STORAGE_ACCOUNT_NAME is not configured in environment");
    return null;
  }

  const { containerName, blobName } = parsed;

  try {
    const client = getBlobServiceClient();
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + expiresInMinutes * 60 * 1000);
    const permissions = BlobSASPermissions.parse("r");
    const protocol = SASProtocol.Https;

    const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    let sasToken;

    if (accountKey) {
      sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions,
          startsOn,
          expiresOn,
          protocol
        },
        new StorageSharedKeyCredential(accountName, accountKey)
      ).toString();
    } else {
      const userDelegationKey = await getUserDelegationKeyCached(client, accountName);
      sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          blobName,
          permissions,
          startsOn,
          expiresOn,
          protocol
        },
        userDelegationKey,
        accountName
      ).toString();
    }

    const containerClient = client.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    return `${blobClient.url}?${sasToken}`;
  } catch (error) {
    const isAuthError =
      error.name === "AuthenticationError" ||
      error.name === "ClientAuthenticationError" ||
      (error.message && error.message.includes("Credential"));
    const isNotFound = error.statusCode === 404;

    if (isAuthError) {
      logger.error(
        { containerName, blobName, errorCode: error.code || "AUTH_FAILED" },
        "Azure Entra ID authentication failed while generating SAS token"
      );
    } else if (isNotFound) {
      logger.warn(
        { containerName, blobName },
        "Azure Blob storage resource not found"
      );
    } else {
      logger.error(
        { containerName, blobName, errorCode: error.code, message: error.message },
        "Azure Blob SAS generation failed due to service/network error"
      );
    }

    return null;
  }
}

/**
 * Enriches a list of items with their imageUrl.
 * Preserves the original record fields while adding imageUrl.
 */
async function attachImageUrls(items, expiresInMinutes = 15) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return Promise.all(
    items.map(async (item) => {
      const imageUrl = item.imageKey
        ? await generateImageUrl(item.imageKey, expiresInMinutes)
        : null;
      return {
        ...item,
        imageUrl
      };
    })
  );
}

// For testing / dependency injection
function _resetClient() {
  blobServiceClient = null;
  cachedUserDelegationKey = null;
  cachedDelegationKeyExpiresAt = 0;
}

module.exports = {
  parseImageKey,
  generateImageUrl,
  attachImageUrls,
  _resetClient
};
