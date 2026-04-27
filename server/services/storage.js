import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import https from "https";
import fs from "fs";
import { pipeline } from "stream/promises";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

export const MAIN_BUCKET = process.env.ZATA_BUCKETS
  ? process.env.ZATA_BUCKETS.split(",")[0].trim()
  : "";

export function resolveBucket(bucketName) {
  if (!bucketName) return { bucket: MAIN_BUCKET, prefix: "" };

  const envBuckets = process.env.ZATA_BUCKETS
    ? process.env.ZATA_BUCKETS.split(",").map((b) => b.trim())
    : [];

  if (envBuckets.includes(bucketName)) {
    return { bucket: bucketName, prefix: "" };
  }

  return { bucket: MAIN_BUCKET, prefix: `workspaces/${bucketName}/` };
}

let s3Client;

function getS3Client() {
  if (!s3Client) {
    const agent = new https.Agent({
      maxSockets: 100,
      keepAlive: true,
      keepAliveMsecs: 10000,
    });
    s3Client = new S3Client({
      region: "us-east-1",
      endpoint: process.env.ZATA_ENDPOINT,
      credentials: {
        accessKeyId: process.env.ZATA_ACCESS_KEY?.trim(),
        secretAccessKey: process.env.ZATA_SECRET_KEY?.trim(),
      },
      forcePathStyle: true,
      tls: true,
      maxAttempts: 5,
      requestHandler: new NodeHttpHandler({
        httpsAgent: agent,
        connectionTimeout: 15000,
        socketTimeout: 60000,
      }),
    });
  }
  return s3Client;
}

function isVideoFile(key) {
  const ext = key.toLowerCase().slice(key.lastIndexOf("."));
  return VIDEO_EXTENSIONS.includes(ext);
}

export async function listVideos(bucketName) {
  try {
    const { bucket, prefix } = resolveBucket(bucketName);
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix || undefined,
    });

    const response = await getS3Client().send(command);

    if (!response.Contents) {
      return [];
    }

    return response.Contents.filter((obj) => isVideoFile(obj.Key)).map(
      (obj) => ({
        object_key: obj.Key,
        filename: obj.Key.split("/").pop(),
        size: obj.Size,
        last_modified: obj.LastModified,
      }),
    );
  } catch (error) {
    console.error("Error listing videos:", error);
    throw new Error("Failed to list videos from storage");
  }
}

export async function getVideoStream(
  bucketName,
  objectKey,
  start = null,
  end = null,
) {
  try {
    const { bucket } = resolveBucket(bucketName);
    const commandParams = {
      Bucket: bucket,
      Key: objectKey,
    };

    if (start !== null && end !== null) {
      commandParams.Range = `bytes=${start}-${end}`;
    }

    const command = new GetObjectCommand(commandParams);
    const response = await getS3Client().send(command);
    return response.Body;
  } catch (error) {
    if (error.Code === "NoSuchKey") {
      console.warn(`Video not found in S3: ${objectKey}`);
    } else {
      console.error("Error getting video stream:", error);
    }
    throw new Error("Failed to get video stream");
  }
}

export async function getVideoStreamWithMeta(bucketName, objectKey, rangeHeader = null) {
  try {
    const { bucket } = resolveBucket(bucketName);
    const commandParams = { Bucket: bucket, Key: objectKey };
    if (rangeHeader) {
      commandParams.Range = rangeHeader;
    }
    const command = new GetObjectCommand(commandParams);
    const response = await getS3Client().send(command);
    return {
      stream: response.Body,
      contentLength: response.ContentLength,
      contentType: response.ContentType,
      contentRange: response.ContentRange,
    };
  } catch (error) {
    if (error.Code === "NoSuchKey") {
      console.warn(`Video not found in S3: ${objectKey}`);
    } else {
      console.error("Error getting video stream with meta:", error);
    }
    throw new Error("Failed to get video stream");
  }
}

export async function getObjectStream(bucketName, objectKey) {
  try {
    const { bucket } = resolveBucket(bucketName);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const response = await getS3Client().send(command);
    return response.Body;
  } catch (error) {
    if (error.Code === "NoSuchKey") {
      console.warn(`Object not found in S3: ${objectKey}`);
    } else {
      console.error("Error getting object stream:", error);
    }
    throw new Error("Failed to get object stream");
  }
}

export async function getVideoMetadata(bucketName, objectKey) {
  try {
    const { bucket } = resolveBucket(bucketName);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const response = await getS3Client().send(command);
    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
    };
  } catch (error) {
    if (error.Code === "NoSuchKey") {
      console.warn(`Metadata not found in S3: ${objectKey}`);
    } else {
      console.error("Error getting video metadata:", error);
    }
    throw new Error("Failed to get video metadata");
  }
}

export async function s3ObjectExists(bucketName, objectKey) {
  const { bucket } = resolveBucket(bucketName);
  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    await getS3Client().send(command);
    return true;
  } catch (error) {
    return false;
  }
}

export async function downloadFromS3ToFile(bucketName, objectKey, destPath) {
  const { bucket } = resolveBucket(bucketName);
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });
    const response = await getS3Client().send(command);
    await pipeline(response.Body, fs.createWriteStream(destPath));
  } catch (error) {
    console.error(
      `[S3] downloadFromS3ToFile FAILED: Bucket=${bucket}, Key=${objectKey}, Dest=${destPath}`,
    );
    console.error(
      `[S3]   Error code: ${error.Code || error.name}, Message: ${error.message}`,
    );
    throw error;
  }
}

export async function deleteFromS3(bucketName, objectKey) {
  const { bucket } = resolveBucket(bucketName);
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });
  await getS3Client().send(command);
}

export async function copyS3Object(srcBucket, srcKey, destBucket, destKey) {
  const command = new CopyObjectCommand({
    Bucket: destBucket,
    CopySource: `${srcBucket}/${srcKey}`,
    Key: destKey,
  });
  await getS3Client().send(command);
}

export async function deleteS3Object(bucket, key) {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });
  await getS3Client().send(command);
}

export async function deleteS3Prefix(bucket, prefix) {
  if (!prefix) return;

  let continuationToken;
  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await getS3Client().send(listCommand);

    if (response.Contents && response.Contents.length > 0) {
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: response.Contents.map((obj) => ({ Key: obj.Key })),
          Quiet: true,
        },
      });
      await getS3Client().send(deleteCommand);
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

export async function generatePresignedUploadUrl(bucketName, objectKey, contentType, expiresIn = 3600) {
  const { bucket, prefix } = resolveBucket(bucketName);
  const finalKey = prefix ? `${prefix}${objectKey}` : objectKey;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: finalKey,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getS3Client(), command, { expiresIn });

  return { url, bucket, key: finalKey };
}

export { getS3Client };