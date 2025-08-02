import React, { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  LinearProgress,
  IconButton,
  Collapse,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Language as LanguageIcon,
  Schedule as ScheduleIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { TranslationTask } from '../../types';

interface TaskCardProps {
  task: TranslationTask;
}

const TaskCard: React.FC<TaskCardProps> = ({ task }) => {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = () => {
    switch (task.status) {
      case 'failed':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'translating':
      case 'llm_verification':
      case 'human_review':
        return <ScheduleIcon color="primary" fontSize="small" />;
      default:
        return <LanguageIcon color="primary" fontSize="small" />;
    }
  };

  return (
    <Card
      elevation={1}
      sx={{
        transition: 'all 0.2s',
        '&:hover': {
          elevation: 3,
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
          {getStatusIcon()}
          <Typography
            variant="body2"
            sx={{ ml: 1, fontWeight: 'bold', flexGrow: 1 }}
          >
            {task.id.split('_')[1]}
          </Typography>
          <IconButton
            size="small"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Box>

        <Typography
          variant="body2"
          sx={{
            mb: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {task.mediaArticle.title || task.mediaArticle.text.substring(0, 50) + '...'}
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {task.destinationLanguages.map(lang => (
            <Chip
              key={lang}
              label={lang}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          ))}
        </Box>

        {(task.status === 'translating' || task.status === 'llm_verification' || task.status === 'human_review') && (
          <Box sx={{ mb: 1 }}>
            <LinearProgress
              variant="determinate"
              value={task.progress || 0}
              sx={{ height: 4, borderRadius: 2 }}
            />
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
              {task.progress || 0}%
            </Typography>
          </Box>
        )}

        {task.error && (
          <Typography
            variant="caption"
            color="error"
            sx={{ display: 'block', mb: 1 }}
          >
            Error: {task.error}
          </Typography>
        )}

        <Collapse in={expanded}>
          <Divider sx={{ my: 1 }} />
          
          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Created:</strong> {formatDate(task.createdAt)}
          </Typography>
          
          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Updated:</strong> {formatDate(task.updatedAt)}
          </Typography>

          <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>
            <strong>Article Text:</strong>
          </Typography>
          <Typography
            variant="body2"
            sx={{
              p: 1,
              backgroundColor: '#f5f5f5',
              borderRadius: 1,
              fontSize: '0.75rem',
              maxHeight: 100,
              overflow: 'auto',
            }}
          >
            {task.mediaArticle.text}
          </Typography>

          {task.result && task.status === 'done' && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="caption">
                <strong>Translations completed:</strong> {task.result.translations.length}
              </Typography>
            </Box>
          )}
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default TaskCard;