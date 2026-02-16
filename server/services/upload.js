import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getS3Client } from './storage.js';

export async function uploadToS3(bucket, key, fileStream, contentType) {
  try {
    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType
      }
    });

    upload.on('httpUploadProgress', (progress) => {
      console.log(`Upload progress: ${progress.loaded}/${progress.total}`);
    });

    const result = await upload.done();
    return result;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw new Error('Failed to upload file');
  }
}
