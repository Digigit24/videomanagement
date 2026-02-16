import dotenv from 'dotenv';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

dotenv.config({ path: '../.env' });

console.log('Testing Zata S3 Connection...\n');
console.log('Access Key:', process.env.ZATA_ACCESS_KEY?.substring(0, 10) + '...');
console.log('Secret Key:', process.env.ZATA_SECRET_KEY?.substring(0, 10) + '...');
console.log('Endpoint:', process.env.ZATA_ENDPOINT);
console.log('Bucket:', process.env.ZATA_BUCKETS);
console.log();

const s3Client = new S3Client({
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

async function testConnection() {
  try {
    console.log('Attempting to list objects...');
    const command = new ListObjectsV2Command({
      Bucket: process.env.ZATA_BUCKETS.split(',')[0].trim()
    });

    const response = await s3Client.send(command);
    console.log('\n✓ SUCCESS! Connected to Zata S3');
    console.log('Found', response.Contents?.length || 0, 'objects');

    if (response.Contents) {
      console.log('\nFiles:');
      response.Contents.forEach(obj => {
        console.log(' -', obj.Key, `(${obj.Size} bytes)`);
      });
    }
  } catch (error) {
    console.error('\n✗ ERROR:', error.message);
    console.error('\nFull error:', error);
  }
}

testConnection();
