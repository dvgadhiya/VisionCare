import pkg from 'pg';
const { Client } = pkg;

async function testConnection() {
  // Try Docker container IP
  const configs = [
    { host: 'localhost', port: 5432, password: 'postgres123' },
    { host: '127.0.0.1', port: 5432, password: 'postgres123' },
    { host: 'host.docker.internal', port: 5432, password: 'postgres123' },
  ];

  for (const config of configs) {
    const client = new Client({
      database: 'detector_db',
      user: 'postgres',
      ...config
    });

    try {
      console.log(`\nTrying ${config.host}:${config.port}...`);
      await client.connect();
      console.log(`✓ Connected to ${config.host}:${config.port}`);
      
      const result = await client.query('SELECT version()');
      console.log('✓ PostgreSQL version:', result.rows[0].version.substring(0, 50));
      
      await client.end();
      
      console.log('\n✓ Use this in your .env:');
      console.log(`DB_HOST=${config.host}`);
      console.log(`DB_PORT=${config.port}`);
      console.log(`DB_PASSWORD=postgres123`);
      return;
      
    } catch (error) {
      console.log(`✗ Failed: ${error.message}`);
      await client.end().catch(() => {});
    }
  }
  
  console.log('\n❌ All attempts failed');
}

testConnection();
