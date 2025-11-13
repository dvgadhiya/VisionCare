import { uploadToS3, getFile, listObjects, getSignedUrlForFrame, getS3Status } from './config/s3.js';
import fs from 'fs/promises';

async function testS3Ninja() {
  console.log('Testing S3 Ninja connection...\n');

  // 1. Check status
  const status = await getS3Status();
  console.log('Status:', status);

  // 2. Upload test file
  const testBuffer = Buffer.from('Hello S3 Ninja!', 'utf-8');
  const uploadResult = await uploadToS3(testBuffer, 'test.txt');
  console.log('Upload result:', uploadResult);

  // 3. List objects
  const objects = await listObjects();
  console.log('Objects in bucket:', objects.length);

  // 4. Get signed URL
  const url = await getSignedUrlForFrame('frames/test.txt');
  console.log('Signed URL:', url);

  // 5. Download file
  const downloaded = await getFile('frames/test.txt');
  console.log('Downloaded content:', downloaded.toString());
}

testS3Ninja().catch(console.error);
