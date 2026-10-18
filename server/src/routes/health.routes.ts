import { Router } from 'express';
import { HealthController } from '../controllers/health.controller.js';

const router = Router();

// GET /api/health - System health check
router.get('/', HealthController.getHealth);

// GET /api/health/ollama - Ollama model and connection status
router.get('/ollama', HealthController.getOllamaHealth);

export default router;
