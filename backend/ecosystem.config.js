module.exports = {
  apps: [
    {
      name: 'detector-api',
      script: './app.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8000
      },
      max_memory_restart: '1G',
      error_file: './logs/api-err.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      autorestart: true,
      watch: false
    },
    {
      name: 'inference-worker',
      script: './workers/frame-processor.worker.js',
      instances: 2, // Run 2 inference workers
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '2G',
      error_file: './logs/worker-err.log',
      out_file: './logs/worker-out.log',
      merge_logs: true,
      autorestart: true
    }
  ]
};
