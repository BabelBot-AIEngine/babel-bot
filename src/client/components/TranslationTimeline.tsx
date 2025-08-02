import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import {
  HourglassEmpty as PendingIcon,
  Translate as TranslatingIcon,
  Psychology as VerificationIcon,
  Person as ReviewIcon,
  CheckCircle as DoneIcon,
  Error as FailedIcon,
} from '@mui/icons-material';
import { LanguageTaskStatus } from '../../types';

interface TranslationTimelineProps {
  currentStatus: LanguageTaskStatus;
  language: string;
}

const allStates: LanguageTaskStatus[] = [
  'pending',
  'translating', 
  'llm_verification',  
  'human_review',
  'done'
];

const stateConfig = {
  pending: {
    label: 'Pending',
    icon: PendingIcon,
    color: '#ef4444',
    bgColor: '#fef2f2',
    borderColor: '#fecaca'
  },
  translating: {
    label: 'Translating',
    icon: TranslatingIcon,
    color: '#f59e0b',
    bgColor: '#fffbeb',
    borderColor: '#fed7aa'
  },
  llm_verification: {
    label: 'LLM Check',
    icon: VerificationIcon,
    color: '#3b82f6',
    bgColor: '#eff6ff',
    borderColor: '#bfdbfe'
  },
  human_review: {
    label: 'Human Review',
    icon: ReviewIcon,
    color: '#8b5cf6',
    bgColor: '#faf5ff',
    borderColor: '#ddd6fe'
  },
  done: {
    label: 'Done',
    icon: DoneIcon,
    color: '#10b981',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0'
  },
  failed: {
    label: 'Failed',
    icon: FailedIcon,
    color: '#ef4444',
    bgColor: '#fef2f2',
    borderColor: '#fecaca'
  }
};

const TranslationTimeline: React.FC<TranslationTimelineProps> = ({ currentStatus, language }) => {
  const getCurrentStateIndex = () => {
    if (currentStatus === 'failed') {
      // For failed status, we don't know exactly where it failed, so show it as the final state
      return -1; // Special case for failed
    }
    return allStates.indexOf(currentStatus);
  };

  const currentIndex = getCurrentStateIndex();
  const isFailed = currentStatus === 'failed';

  return (
    <Box sx={{ my: 2 }}>
      <Typography variant="caption" sx={{ display: 'block', mb: 1, fontWeight: 600, color: '#64748b' }}>
        Translation Status for {language}
      </Typography>
      
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        p: 2,
        background: isFailed ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${isFailed ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: 2,
        overflow: 'auto'
      }}>
        {/* Show progression through normal states */}
        {allStates.map((state, index) => {
          const config = stateConfig[state];
          const IconComponent = config.icon;
          const isCompleted = !isFailed && index < currentIndex;
          const isCurrent = !isFailed && index === currentIndex;
          const isUpcoming = !isFailed && index > currentIndex;
          
          return (
            <React.Fragment key={state}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                {/* State Icon */}
                <Box sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isCompleted 
                    ? config.color 
                    : isCurrent 
                      ? config.color 
                      : isUpcoming 
                        ? '#e5e7eb' 
                        : '#e5e7eb',
                  border: `2px solid ${
                    isCompleted || isCurrent ? config.color : '#d1d5db'
                  }`,
                  transition: 'all 0.3s ease'
                }}>
                  <IconComponent sx={{ 
                    fontSize: 16, 
                    color: isCompleted || isCurrent ? 'white' : '#9ca3af'
                  }} />
                </Box>
                
                {/* State Label */}
                <Typography variant="caption" sx={{ 
                  fontSize: '0.7rem',
                  fontWeight: isCompleted || isCurrent ? 600 : 400,
                  color: isCompleted || isCurrent ? config.color : '#9ca3af',
                  textAlign: 'center',
                  minWidth: '60px'
                }}>
                  {config.label}
                </Typography>
              </Box>
              
              {/* Connector Line */}
              {index < allStates.length - 1 && (
                <Box sx={{
                  width: 24,
                  height: 2,
                  background: isCompleted 
                    ? config.color 
                    : '#e5e7eb',
                  borderRadius: 1,
                  transition: 'all 0.3s ease'
                }} />
              )}
            </React.Fragment>
          );
        })}
        
        {/* Show failed status if applicable */}
        {isFailed && (
          <>
            <Box sx={{
              width: 24,
              height: 2,
              background: '#ef4444',
              borderRadius: 1,
            }} />
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#ef4444',
                border: '2px solid #ef4444',
              }}>
                <FailedIcon sx={{ fontSize: 16, color: 'white' }} />
              </Box>
              <Typography variant="caption" sx={{ 
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#ef4444',
                textAlign: 'center',
                minWidth: '60px'
              }}>
                Failed
              </Typography>
            </Box>
          </>
        )}
      </Box>
      
      {/* Status chip for quick reference */}
      <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <Chip
          label={`Status: ${stateConfig[currentStatus].label}`}
          size="small"
          sx={{
            backgroundColor: stateConfig[currentStatus].color,
            color: 'white',
            fontWeight: 600,
            fontSize: '0.75rem'
          }}
        />
      </Box>
    </Box>
  );
};

export default TranslationTimeline;