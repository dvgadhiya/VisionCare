import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'detector_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Create tables
const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS frames (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        s3_key VARCHAR(500) NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed BOOLEAN DEFAULT FALSE
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS inference_results (
        id SERIAL PRIMARY KEY,
        frame_id INTEGER REFERENCES frames(id),
        emotion_label VARCHAR(50),
        emotion_confidence FLOAT,
        redness_label VARCHAR(50),
        redness_confidence FLOAT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blink_stats (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) NOT NULL,
        total_blinks INTEGER DEFAULT 0,
        avg_bpm FLOAT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sensor_readings (
        id SERIAL PRIMARY KEY,
        temp FLOAT,
        hum FLOAT,
        ldr FLOAT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('[DB] Tables initialized successfully');
  } finally {
    client.release();
  }
};

initDB().catch(console.error);

export { pool };
