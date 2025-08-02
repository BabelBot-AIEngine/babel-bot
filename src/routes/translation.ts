import { Router, Request, Response } from 'express';
import { TranslationService } from '../services/translationService';
import { TranslationRequest, TranslationResponse } from '../types';

const router = Router();
const translationService = new TranslationService();

router.post('/translate', async (req: Request, res: Response) => {
  try {
    const { mediaArticle, editorialGuidelines, destinationLanguages }: TranslationRequest = req.body;

    if (!mediaArticle || !mediaArticle.text) {
      return res.status(400).json({
        error: 'Media article with text is required'
      });
    }

    if (!destinationLanguages || destinationLanguages.length === 0) {
      return res.status(400).json({
        error: 'At least one destination language is required'
      });
    }

    const translations = await translationService.translateArticle(
      mediaArticle,
      editorialGuidelines || {},
      destinationLanguages
    );

    const response: TranslationResponse = {
      originalArticle: mediaArticle,
      translations,
      processedAt: new Date().toISOString()
    };

    res.json(response);
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      error: 'Internal server error during translation'
    });
  }
});

router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'translation-api',
    timestamp: new Date().toISOString()
  });
});

export default router;