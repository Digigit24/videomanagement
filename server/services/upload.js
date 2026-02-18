import { Upload } from "@aws-sdk/lib-storage";
import { getS3Client, resolveBucket } from "./storage.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

/**
 * Retry wrapper with exponential backoff.
 * Retries the given async function up to maxRetries times.
 */
async function withRetry(fn, { maxRetries = MAX_RETRIES, label = "operation" } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt <= maxRetries) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `[Retry] ${label} failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delay}ms: ${error.message}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function uploadToS3(bucketName, key, body, contentType) {
  return withRetry(
    async () => {
      const { bucket, prefix } = resolveBucket(bucketName);
      const finalKey = prefix ? `${prefix}${key}` : key;

      const upload = new Upload({
        client: getS3Client(),
        params: {
          Bucket: bucket,
          Key: finalKey,
          Body: body,
          ContentType: contentType,
        },
      });

      upload.on("httpUploadProgress", (progress) => {
        console.log(`Upload progress [${key}]: ${progress.loaded}/${progress.total}`);
      });

      const result = await upload.done();
      return result;
    },
    { label: `S3 upload ${key}` }
  );
}
