import { VercelRequest, VercelResponse } from '@vercel/node';
import { TaskMigrationService } from '../src/services/taskMigrationService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Return migration report
    try {
      const migrationService = new TaskMigrationService();
      const report = await migrationService.createMigrationReport();

      res.status(200).json({
        success: true,
        report,
        message: 'Migration report generated successfully',
      });
    } catch (error) {
      console.error('Error generating migration report:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to generate migration report',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else if (req.method === 'POST') {
    // Execute migration
    const { dryRun = false } = req.body;

    if (dryRun) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Use GET method for dry-run migration reports',
      });
    }

    try {
      const migrationService = new TaskMigrationService();
      console.log('Starting task migration...');
      
      const result = await migrationService.migrateAllLegacyTasks();

      res.status(200).json({
        success: true,
        migration: result,
        message: `Migration completed: ${result.summary.successful} successful, ${result.summary.failed} failed`,
        recommendations: [
          'Monitor enhanced task processing via /api/tasks/enhanced',
          'Test webhook functionality with new tasks',
          'Verify Prolific integration for human review batching',
          'Consider cleanup of legacy tasks once migration is validated',
        ],
      });
    } catch (error) {
      console.error('Error during task migration:', error);
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to migrate tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET (report) and POST (migrate) methods are allowed',
    });
  }
}