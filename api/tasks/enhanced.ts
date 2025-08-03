import { VercelRequest, VercelResponse } from '@vercel/node';
import { EnhancedTaskService } from '../../src/services/enhancedTaskService';
import { MediaArticle, EditorialGuidelines, GuideType } from '../../src/types';

interface CreateEnhancedTaskRequest {
  mediaArticle: MediaArticle;
  editorialGuidelines: EditorialGuidelines;
  destinationLanguages: string[];
  guide?: GuideType;
  useFullMarkdown?: boolean;
  maxReviewIterations?: number;
  confidenceThreshold?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    try {
      const {
        mediaArticle,
        editorialGuidelines,
        destinationLanguages,
        guide,
        useFullMarkdown,
        maxReviewIterations = 3,
        confidenceThreshold = 4.5,
      }: CreateEnhancedTaskRequest = req.body;

      // Validate required fields
      if (!mediaArticle || !editorialGuidelines || !destinationLanguages || destinationLanguages.length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'mediaArticle, editorialGuidelines, and destinationLanguages are required',
        });
      }

      // Validate confidence threshold
      if (confidenceThreshold < 1 || confidenceThreshold > 5) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'confidenceThreshold must be between 1 and 5',
        });
      }

      // Validate max iterations
      if (maxReviewIterations < 1 || maxReviewIterations > 5) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'maxReviewIterations must be between 1 and 5',
        });
      }

      const enhancedTaskService = new EnhancedTaskService();
      
      const taskId = await enhancedTaskService.createTranslationTask(
        mediaArticle,
        editorialGuidelines,
        destinationLanguages,
        guide,
        useFullMarkdown,
        maxReviewIterations,
        confidenceThreshold
      );

      res.status(201).json({
        success: true,
        taskId,
        message: 'Enhanced translation task created successfully',
        webhookUrl: process.env.VERCEL_URL 
          ? `https://${process.env.VERCEL_URL}/api/webhooks` 
          : `${process.env.BASE_URL || 'http://localhost:3000'}/api/webhooks`,
        settings: {
          maxReviewIterations,
          confidenceThreshold,
          destinationLanguages,
        },
      });
    } catch (error) {
      console.error('Error creating enhanced task:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create enhanced translation task',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else if (req.method === 'GET') {
    try {
      const enhancedTaskService = new EnhancedTaskService();
      
      const { status } = req.query;
      
      let tasks;
      if (status && typeof status === 'string') {
        tasks = await enhancedTaskService.getTasksByStatus(status as any);
      } else {
        tasks = await enhancedTaskService.getAllTasks();
      }

      res.status(200).json({
        success: true,
        tasks,
        count: tasks.length,
      });
    } catch (error) {
      console.error('Error fetching enhanced tasks:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch enhanced tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST and GET methods are allowed',
    });
  }
}