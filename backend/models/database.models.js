import { Sequelize, DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';

// Initialize Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME || 'detector_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres123',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    }
  }
);

// Frame Model
export const Frame = sequelize.define('frames', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  s3_key: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  session_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    index: true
  },
  processed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    index: true
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  uploaded_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['session_id'] },
    { fields: ['processed'] },
    { fields: ['uploaded_at'] }
  ]
});

// Inference Result Model
export const InferenceResult = sequelize.define('inference_results', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  frame_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'frames',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  emotion_label: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  emotion_confidence: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    }
  },
  redness_label: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  redness_confidence: {
    type: DataTypes.FLOAT,
    allowNull: true,
    validate: {
      min: 0,
      max: 1
    }
  },
  processing_time_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  processed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  indexes: [
    { fields: ['frame_id'] },
    { fields: ['emotion_label'] },
    { fields: ['processed_at'] }
  ]
});

// Blink Statistics Model
export const BlinkStat = sequelize.define('blink_stats', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  session_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true
  },
  total_blinks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  avg_bpm: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  recent_bpm: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  ear_value: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  rate_status: {
    type: DataTypes.ENUM('Low', 'Normal', 'High', 'Unknown'),
    defaultValue: 'Unknown'
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true
  }
}, {
  indexes: [
    { fields: ['session_id', 'timestamp'] },
    { fields: ['timestamp'] }
  ]
});

// Sensor Reading Model
export const SensorReading = sequelize.define('sensor_readings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  temp: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: -50,
      max: 150
    }
  },
  hum: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  ldr: {
    type: DataTypes.FLOAT,
    allowNull: false,
    validate: {
      min: 0,
      max: 1024
    }
  },
  session_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    index: true
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true
  }
}, {
  indexes: [
    { fields: ['session_id'] },
    { fields: ['timestamp'] }
  ]
});

// Session Model - Track user sessions
export const Session = sequelize.define('sessions', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  session_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    index: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  started_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  ended_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  total_frames: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_blinks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    index: true
  }
}, {
  indexes: [
    { fields: ['session_id'] },
    { fields: ['user_id'] },
    { fields: ['is_active'] },
    { fields: ['started_at'] }
  ]
});

// User Model - Authentication and user management
export const User = sequelize.define('users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    },
    index: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user'
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verification_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  reset_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  reset_token_expires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  },
  indexes: [
    { fields: ['email'] },
    { fields: ['is_active'] },
    { fields: ['created_at'] }
  ]
});

// User instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  delete values.verification_token;
  delete values.reset_token;
  delete values.reset_token_expires;
  return values;
};

// Define associations
Frame.hasMany(InferenceResult, { foreignKey: 'frame_id', as: 'inferences' });
InferenceResult.belongsTo(Frame, { foreignKey: 'frame_id', as: 'frame' });

User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Initialize database
export const initializeDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('[Database] Connection established successfully');

    // Sync models (use { force: true } to drop and recreate tables in development)
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('[Database] Models synchronized');

    return true;
  } catch (error) {
    console.error('[Database] Unable to connect:', error);
    throw error;
  }
};

// Helper functions for common queries
export const DatabaseHelpers = {
  // Get session statistics
  async getSessionStats(sessionId) {
    const [blinkStats, frames, session] = await Promise.all([
      BlinkStat.findAll({
        where: { session_id: sessionId },
        order: [['timestamp', 'DESC']],
        limit: 100
      }),
      Frame.count({ where: { session_id: sessionId } }),
      Session.findOne({ where: { session_id: sessionId } })
    ]);

    return {
      session,
      totalFrames: frames,
      blinkHistory: blinkStats,
      latestBlink: blinkStats[0] || null
    };
  },

  // Get recent inference results
  async getRecentInferences(limit = 10, sessionId = null) {
    const whereClause = sessionId ? { '$frame.session_id$': sessionId } : {};

    return await InferenceResult.findAll({
      where: whereClause,
      include: [{
        model: Frame,
        as: 'frame',
        attributes: ['filename', 's3_key', 'session_id', 'uploaded_at']
      }],
      order: [['processed_at', 'DESC']],
      limit
    });
  },

  // Get sensor data aggregated
  async getSensorAggregates(sessionId, timeWindow = 300000) { // 5 minutes default
    const since = new Date(Date.now() - timeWindow);

    const readings = await SensorReading.findAll({
      where: {
        session_id: sessionId,
        timestamp: { [Sequelize.Op.gte]: since }
      },
      order: [['timestamp', 'ASC']]
    });

    if (readings.length === 0) return null;

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
      avgTemp: avg(readings.map(r => r.temp)),
      avgHum: avg(readings.map(r => r.hum)),
      avgLdr: avg(readings.map(r => r.ldr)),
      count: readings.length,
      timeWindow: timeWindow / 1000
    };
  },

  // Update session on disconnect
  async endSession(sessionId) {
    const session = await Session.findOne({ where: { session_id: sessionId } });
    if (session) {
      await session.update({
        ended_at: new Date(),
        is_active: false
      });
    }
  }
};

export { sequelize };
export default {
  Frame,
  InferenceResult,
  BlinkStat,
  SensorReading,
  Session,
  User,
  sequelize,
  initializeDatabase,
  DatabaseHelpers
};
