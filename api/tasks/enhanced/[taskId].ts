import { VercelRequest, VercelResponse } from '@vercel/node';
import { EnhancedTaskService } from '../../../src/services/enhancedTaskService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { taskId } = req.query;

  if (!taskId || typeof taskId !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'taskId is required and must be a string',
    });
  }

  if (req.method === 'GET') {
    try {
      const enhancedTaskService = new EnhancedTaskService();
      const task = await enhancedTaskService.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Enhanced task ${taskId} not found`,
        });
      }

      // Calculate summary statistics
      const languageStatuses = Object.entries(task.languageSubTasks).map(([lang, subTask]) => ({
        language: lang,
        status: subTask.status,
        currentIteration: subTask.currentIteration,
        iterationCount: subTask.iterations.length,
        lastScore: subTask.iterations.length > 0 
          ? subTask.iterations[subTask.iterations.length - 1].combinedScore || 
            subTask.iterations[subTask.iterations.length - 1].llmVerification.score
          : null,
      }));

      const completedLanguages = languageStatuses.filter(l => l.status === 'finalized').length;
      const failedLanguages = languageStatuses.filter(l => l.status === 'failed').length;
      const processingLanguages = languageStatuses.filter(l => 
        !['finalized', 'failed'].includes(l.status)
      ).length;

      res.status(200).json({
        success: true,
        task,
        summary: {
          totalLanguages: task.destinationLanguages.length,
          completedLanguages,
          failedLanguages,
          processingLanguages,
          overallProgress: Math.round((completedLanguages / task.destinationLanguages.length) * 100),
          languageStatuses,
          webhookAttempts: task.webhookDeliveryLog.length,
          prolificStudies: Object.keys(task.prolificStudyMappings).length,
        },
      });
    } catch (error) {
      console.error(`Error fetching enhanced task ${taskId}:`, error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: `Failed to fetch enhanced task ${taskId}`,
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }
}