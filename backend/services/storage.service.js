import { uploadToS3, getFile, getSignedUrlForFrame, cleanupOldFiles } from '../config/s3.js';
import { Frame } from '../models/database.models.js';
import sharp from 'sharp';

export class StorageService {
  static async initialize() {
    // Just log, don't fail
    console.log('[StorageService] Initialized with S3 Ninja');
    return true;
  }

  static async saveFrame(buffer, filename, sessionId = null) {
    try {
      // Optimize image
      const optimizedBuffer = await sharp(buffer)
        .resize(640, 480, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 75,
          progressive: true
        })
        .toBuffer();

      console.log(`[Storage] Compressed ${filename}: ${buffer.length} -> ${optimizedBuffer.length} bytes`);

      // Upload to S3 Ninja
      const storageInfo = await uploadToS3(optimizedBuffer, filename);

      // Save to database
      const result = await Frame.create({
        filename,
        s3_key: storageInfo.key,
        session_id: sessionId,
        file_size: storageInfo.size,
        storage_location: 's3'
      });

      return { 
        frameId: result.id, 
        s3Key: storageInfo.key,
        location: 's3',
        size: storageInfo.size
      };
    } catch (error) {
      console.error('[StorageService] Error saving frame:', error);
      throw error;
    }
  }

  static async getFrameUrl(frameId) {
    const frame = await Frame.findByPk(frameId);
    if (!frame) throw new Error('Frame not found');
    return await getSignedUrlForFrame(frame.s3_key);
  }

  static async getFrameBuffer(frameId) {
    const frame = await Frame.findByPk(frameId);
    if (!frame) throw new Error('Frame not found');
    return await getFile(frame.s3_key);
  }

  static async markFrameProcessed(frameId) {
    await Frame.update(
      { processed: true },
      { where: { id: frameId } }
    );
  }

  static async cleanupOldFrames(daysOld = 7) {
    const deleted = await cleanupOldFiles(daysOld);
    
    const { Op } = await import('sequelize');
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const dbDeleted = await Frame.destroy({
      where: {
        uploaded_at: { [Op.lt]: cutoffDate }
      }
    });
    
    console.log(`[Storage] Cleaned up ${deleted} S3 objects, ${dbDeleted} DB records`);
    return { s3: deleted, db: dbDeleted };
  }
}
