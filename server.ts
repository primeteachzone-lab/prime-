import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import rateLimit from 'express-rate-limit';
import fs from 'fs';

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust proxy is required for express-rate-limit in this environment
  app.set('trust proxy', 1);

  app.use(express.json());

  // Rate limiting to prevent abuse
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

  app.use('/api/', limiter);

  // ElevenLabs API Configuration
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

  // Endpoint to list voices
  app.get('/api/voices', async (req, res) => {
    try {
      if (!ELEVENLABS_API_KEY) {
        return res.status(400).json({ error: 'ELEVENLABS_API_KEY is not configured in environment variables.' });
      }
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY }
      });
      res.json(response.data);
    } catch (error: any) {
      console.error('List voices error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to fetch voices' });
    }
  });

  // Endpoint to clone a voice
  app.post('/api/clone-voice', upload.single('audio'), async (req, res) => {
    try {
      if (!ELEVENLABS_API_KEY) {
        return res.status(400).json({ error: 'ELEVENLABS_API_KEY is not configured.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided.' });
      }

      const { name, description } = req.body;
      const formData = new FormData();
      formData.append('name', name || 'Cloned Voice');
      formData.append('description', description || 'Self-cloned voice');
      formData.append('files', req.file.buffer, {
        filename: req.file.originalname || 'voice_sample.wav',
        contentType: req.file.mimetype
      });

      const response = await axios.post('https://api.elevenlabs.io/v1/voices/add', formData, {
        headers: {
          ...formData.getHeaders(),
          'xi-api-key': ELEVENLABS_API_KEY
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error('Clone voice error:', error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.detail || 'Failed to clone voice' });
    }
  });

  // Endpoint to synthesize speech
  app.post('/api/synthesize', async (req, res) => {
    try {
      if (!ELEVENLABS_API_KEY) {
        return res.status(400).json({ error: 'ELEVENLABS_API_KEY is not configured.' });
      }
      const { voice_id, text } = req.body;

      if (!voice_id || !text) {
        return res.status(400).json({ error: 'voice_id and text are required.' });
      }

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
        {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      res.set('Content-Type', 'audio/mpeg');
      res.send(response.data);
    } catch (error: any) {
      console.error('Synthesis error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to synthesize speech' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasApiKey: !!ELEVENLABS_API_KEY });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
