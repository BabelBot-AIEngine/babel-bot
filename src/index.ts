import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import translationRoutes from './routes/translation';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', translationRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Babel Bot Translation API',
    version: '1.0.0',
    endpoints: {
      translate: 'POST /api/translate',
      health: 'GET /api/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API documentation available at http://localhost:${PORT}`);
});