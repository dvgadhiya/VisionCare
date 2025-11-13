import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'http';

const ENDPOINT = 'http://localhost:9444';
const BUCKET = 'blink-detector-frames';

// Custom HTTP handler for S3 Ninja
const httpHandler = new NodeHttpHandler({
  httpAgent: new Agent({ keepAlive: true }),
  requestTimeout: 10000,
  connectionTimeout: 5000
});

// S3 Client configured for S3 Ninja with minimal signature
export const s3Client = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
  },
  requestHandler: httpHandler,
  // Disable retries to avoid signature issues
  maxAttempts: 1,
  // Use v2 signature for S3 Ninja compatibility
  signatureVersion: 'v2'
});

console.log('[S3] Configured for S3 Ninja at', ENDPOINT);

// Simple upload - no bucket check
export const uploadToS3 = async (buffer, filename) => {
  try {
    const key = `frames/${filename}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg'
    });
    
    await s3Client.send(command);
    console.log(`[S3] ✓ Uploaded: ${filename} (${(buffer.length / 1024).toFixed(2)} KB)`);
    
    return {
      location: 's3',
      key: key,
      size: buffer.length,
      bucket: BUCKET
    };
  } catch (error) {
    console.error('[S3] Upload error:', error.message);
    throw error;
  }
};

// Get file
export const getFile = async (key) => {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const response = await s3Client.send(command);
    
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('[S3] Get file error:', error.message);
    throw error;
  }
};

// Get URL
export const getSignedUrlForFrame = async (key) => {
  return `${ENDPOINT}/${BUCKET}/${key}`;
};

// List objects
export const listObjects = async (prefix = 'frames/') => {
  try {
    const command = new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix });
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('[S3] List error:', error.message);
    return [];
  }
};

// Delete
export const deleteObject = async (key) => {
  try {
    const command = new DeleteObjectCommand({ Bucket: BUCKET, Key: key });
    await s3Client.send(command);
    console.log(`[S3] ✓ Deleted: ${key}`);
    return true;
  } catch (error) {
    console.error('[S3] Delete error:', error.message);
    return false;
  }
};

// Cleanup
export const cleanupOldFiles = async (daysOld = 7) => {
  const objects = await listObjects();
  const now = Date.now();
  const maxAge = daysOld * 24 * 60 * 60 * 1000;
  
  let deleted = 0;
  for (const obj of objects) {
    const age = now - new Date(obj.LastModified).getTime();
    if (age > maxAge) {
      await deleteObject(obj.Key);
      deleted++;
    }
  }
  
  if (deleted > 0) console.log(`[S3] Cleaned up ${deleted} old files`);
  return deleted;
};

// Status
export const getS3Status = async () => {
  try {
    const command = new ListBucketsCommand({});
    const response = await s3Client.send(command);
    
    return {
      connected: true,
      endpoint: ENDPOINT,
      buckets: response.Buckets?.map(b => b.Name) || [],
      mode: 's3-ninja'
    };
  } catch (error) {
    return {
      connected: false,
      endpoint: ENDPOINT,
      error: error.message,
      mode: 's3-ninja'
    };
  }
};

// Dummy initialize function
export const ensureBucket = async () => {
  console.log(`[S3] Using bucket: ${BUCKET}`);
  return true;
};

export default s3Client;
