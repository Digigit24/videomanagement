import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getS3Client, resolveBucket } from "./storage.js";

export async function uploadToS3(bucketName, key, fileStream, contentType) {
  try {
    const { bucket, prefix } = resolveBucket(bucketName);
    const finalKey = prefix ? `${prefix}${key}` : key;

    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: bucket,
        Key: finalKey,
        Body: fileStream,
        ContentType: contentType,
      },
    });

    upload.on("httpUploadProgress", (progress) => {
      console.log(`Upload progress: ${progress.loaded}/${progress.total}`);
    });

    const result = await upload.done();
    return result;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error("Failed to upload file");
  }
}
