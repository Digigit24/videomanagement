import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

let s3Client;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.ZATA_ENDPOINT,
      credentials: {
        accessKeyId: process.env.ZATA_ACCESS_KEY?.trim(),
        secretAccessKey: process.env.ZATA_SECRET_KEY?.trim()
      },
      forcePathStyle: true,
      tls: true,
      signatureVersion: 'v4'
    });
  }
  return s3Client;
}

function isVideoFile(key) {
  const ext = key.toLowerCase().slice(key.lastIndexOf('.'));
  return VIDEO_EXTENSIONS.includes(ext);
}

export async function listVideos(bucket) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket
    });

    const response = await getS3Client().send(command);

    if (!response.Contents) {
      return [];
    }

    return response.Contents
      .filter(obj => isVideoFile(obj.Key))
      .map(obj => ({
        object_key: obj.Key,
        filename: obj.Key.split('/').pop(),
        size: obj.Size,
        last_modified: obj.LastModified
      }));
  } catch (error) {
    console.error('Error listing videos:', error);
    throw new Error('Failed to list videos from storage');
  }
}

export async function getVideoStream(bucket, objectKey, start = null, end = null) {
  try {
    const commandParams = {
      Bucket: bucket,
      Key: objectKey
    };

    // Add range if specified for partial content
    if (start !== null && end !== null) {
      commandParams.Range = `bytes=${start}-${end}`;
    }

    const command = new GetObjectCommand(commandParams);
    const response = await getS3Client().send(command);
    return response.Body;
  } catch (error) {
    console.error('Error getting video stream:', error);
    throw new Error('Failed to get video stream');
  }
}

export async function getVideoMetadata(bucket, objectKey) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey
    });

    const response = await getS3Client().send(command);
    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength
    };
  } catch (error) {
    console.error('Error getting video metadata:', error);
    throw new Error('Failed to get video metadata');
  }
}

export { getS3Client };
