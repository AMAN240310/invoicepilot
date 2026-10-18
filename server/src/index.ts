import { createApp } from './app.js';
import { config } from './config/index.js';
import { getDatabase } from './db/index.js';
import { OllamaService } from './services/ollama.service.js';

async function bootstrap() {
  console.log('--------------------------------------------------');
  console.log('🚀 Starting InvoicePilot Backend Server...');
  console.log(`📂 Environment: ${config.nodeEnv}`);
  console.log(`📁 Data Directory: ${config.dataDir}`);
  console.log(`📁 Database Path: ${config.dbPath}`);

  // 1. Initialize SQLite Database
  try {
    getDatabase();
    console.log('✅ SQLite Database connected and schema initialized.');
  } catch (err) {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  }

  // 2. Check Ollama Status
  console.log(`🤖 Checking Ollama AI status at ${config.ollama.baseUrl}...`);
  const ollamaHealth = await OllamaService.checkHealth();
  if (ollamaHealth.isAvailable) {
    console.log(`✅ Ollama is ONLINE. Available models: [${ollamaHealth.availableModels.join(', ')}]`);
    console.log(`🎯 Active extraction model: '${config.ollama.model}'`);
  } else {
    console.warn(`⚠️ Ollama is OFFLINE: ${ollamaHealth.error}`);
    console.warn(`⚠️ InvoicePilot will remain usable; AI processing can be retried once Ollama starts.`);
  }

  // 3. Start Express Web Server
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`🌐 Server listening at http://${config.host}:${config.port}`);
    console.log('--------------------------------------------------');
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Shutting down InvoicePilot server...');
    server.close(() => {
      console.log('👋 Server stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
