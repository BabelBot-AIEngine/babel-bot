import sqlite3 from 'sqlite3';
import path from 'path';

export interface TranslationTask {
  id: string;
  status: 'pending' | 'translating' | 'llm_verification' | 'human_review' | 'done' | 'failed';
  mediaArticle: {
    text: string;
    title?: string;
    metadata?: Record<string, any>;
  };
  editorialGuidelines: Record<string, any>;
  destinationLanguages: string[];
  result?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
}

export class DatabaseService {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor() {
    this.dbPath = path.join(process.cwd(), 'translation_tasks.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    const createTasksTable = `
      CREATE TABLE IF NOT EXISTS translation_tasks (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        media_article TEXT NOT NULL,
        editorial_guidelines TEXT NOT NULL,
        destination_languages TEXT NOT NULL,
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        progress INTEGER DEFAULT 0
      )
    `;

    this.db.run(createTasksTable, (err) => {
      if (err) {
        console.error('Error creating translation_tasks table:', err);
      } else {
        console.log('Database initialized successfully');
      }
    });
  }

  async createTask(task: Omit<TranslationTask, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = new Date().toISOString();
      
      const insertTask = `
        INSERT INTO translation_tasks (
          id, status, media_article, editorial_guidelines, 
          destination_languages, result, error, created_at, updated_at, progress
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        insertTask,
        [
          id,
          task.status,
          JSON.stringify(task.mediaArticle),
          JSON.stringify(task.editorialGuidelines),
          JSON.stringify(task.destinationLanguages),
          task.result ? JSON.stringify(task.result) : null,
          task.error || null,
          now,
          now,
          task.progress || 0
        ],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(id);
          }
        }
      );
    });
  }

  async updateTask(id: string, updates: Partial<TranslationTask>): Promise<void> {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const fields = [];
      const values = [];

      if (updates.status) {
        fields.push('status = ?');
        values.push(updates.status);
      }
      if (updates.result !== undefined) {
        fields.push('result = ?');
        values.push(JSON.stringify(updates.result));
      }
      if (updates.error !== undefined) {
        fields.push('error = ?');
        values.push(updates.error);
      }
      if (updates.progress !== undefined) {
        fields.push('progress = ?');
        values.push(updates.progress);
      }

      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      const updateQuery = `UPDATE translation_tasks SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(updateQuery, values, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getTask(id: string): Promise<TranslationTask | null> {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM translation_tasks WHERE id = ?';
      
      this.db.get(query, [id], (err, row: any) => {
        if (err) {
          reject(err);
        } else if (!row) {
          resolve(null);
        } else {
          resolve(this.mapRowToTask(row));
        }
      });
    });
  }

  async getAllTasks(): Promise<TranslationTask[]> {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM translation_tasks ORDER BY created_at DESC';
      
      this.db.all(query, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => this.mapRowToTask(row)));
        }
      });
    });
  }

  async getTasksByStatus(status: TranslationTask['status']): Promise<TranslationTask[]> {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM translation_tasks WHERE status = ? ORDER BY created_at DESC';
      
      this.db.all(query, [status], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => this.mapRowToTask(row)));
        }
      });
    });
  }

  private mapRowToTask(row: any): TranslationTask {
    return {
      id: row.id,
      status: row.status,
      mediaArticle: JSON.parse(row.media_article),
      editorialGuidelines: JSON.parse(row.editorial_guidelines),
      destinationLanguages: JSON.parse(row.destination_languages),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      progress: row.progress || 0
    };
  }

  close(): void {
    this.db.close();
  }
}