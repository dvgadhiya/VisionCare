import fetch from 'node-fetch';
import { pool } from '../config/database.js';
import { getSignedUrlForFrame } from '../config/s3.js';

export class InferenceService {
  static ROBOFLOW_API_URL = 'https://serverless.roboflow.com';
  static ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;

  static async runInference(s3Key, modelId) {
    try {
      const signedUrl = await getSignedUrlForFrame(s3Key);
      
      const response = await fetch(`${this.ROBOFLOW_API_URL}/${modelId}?api_key=${this.ROBOFLOW_API_KEY}&image=${encodeURIComponent(signedUrl)}`, {
        method: 'POST'
      });

      return await response.json();
    } catch (error) {
      console.error(`[InferenceService] Error for model ${modelId}:`, error);
      return { error: error.message };
    }
  }

  static async processFrame(frameId, s3Key) {
    try {
      // Run both models in parallel
      const [emotionResult, rednessResult] = await Promise.all([
        this.runInference(s3Key, 'emotion-esmd2/2'),
        this.runInference(s3Key, 'redness-of-eyes-aju4x/1')
      ]);

      let emotionLabel = 'Unknown', emotionConf = null;
      if (emotionResult.predictions && emotionResult.predictions.length > 0) {
        const pred = emotionResult.predictions[0];
        emotionLabel = pred.label || pred.class || 'Unknown';
        emotionConf = pred.confidence || pred.score || null;
      }

      let rednessLabel = 'Unknown', rednessConf = null;
      if (rednessResult.predictions && rednessResult.predictions.length > 0) {
        const pred = rednessResult.predictions[0];
        rednessLabel = pred.label || pred.class || 'Unknown';
        rednessConf = pred.confidence || pred.score || null;
      }

      // Save results
      await pool.query(
        `INSERT INTO inference_results (frame_id, emotion_label, emotion_confidence, redness_label, redness_confidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [frameId, emotionLabel, emotionConf, rednessLabel, rednessConf]
      );

      return { emotionLabel, emotionConf, rednessLabel, rednessConf };
    } catch (error) {
      console.error('[InferenceService] Processing error:', error);
      throw error;
    }
  }
}
