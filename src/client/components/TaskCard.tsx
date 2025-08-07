import React from 'react';
import { Languages, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TranslationTask, getLanguageStatesForTask, hasMultipleLanguageStates, LanguageTaskStatus } from '../../types';
import { getLanguageDisplayName } from '../../utils/languageUtils';

interface TaskCardProps {
  task: TranslationTask;
  onClick: () => void;
  filteredLanguages?: string[];
  isPartialDisplay?: boolean;
  currentColumnStatus?: LanguageTaskStatus;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, filteredLanguages, isPartialDisplay = false, currentColumnStatus }) => {

  const displayStatus = currentColumnStatus || task.status;

  const getStatusIcon = () => {
    switch (displayStatus) {
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-white" />;
      case 'translating':
      case 'llm_verification':
      case 'human_review':
        return <Clock className="h-4 w-4 text-white" />;
      default:
        return <Languages className="h-4 w-4 text-white" />;
    }
  };

  const getLanguageStatusVariant = (status: LanguageTaskStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'done':
        return 'default'; // This will be green via CSS variables
      case 'failed':
        return 'destructive';
      case 'human_review':
        return 'secondary';
      case 'llm_verification':
        return 'default';
      case 'translating':
        return 'secondary';
      case 'pending':
      default:
        return 'outline';
    }
  };

  const languageStates = getLanguageStatesForTask(task);
  const hasSplitStates = hasMultipleLanguageStates(task);
  const displayLanguages = filteredLanguages || task.destinationLanguages;

  const getStatusGradientClass = () => {
    switch (displayStatus) {
      case 'pending':
        return 'from-red-500 to-red-400';
      case 'translating':
        return 'from-orange-500 to-amber-400';
      case 'llm_verification':
        return 'from-blue-500 to-blue-400';
      case 'human_review':
        return 'from-purple-500 to-purple-400';
      case 'done':
        return 'from-green-500 to-emerald-400';
      case 'failed':
        return 'from-red-500 to-red-400';
      default:
        return 'from-gray-500 to-gray-400';
    }
  };

  return (
    <Card 
      className="glass-card cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] relative overflow-hidden group"
      onClick={onClick}
    >
      {/* Status indicator bar at top */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${getStatusGradientClass()}`} />
      <CardContent className="p-4">
        {/* Header section */}
        <div className="flex items-center mb-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br ${getStatusGradientClass()} mr-3 shadow-sm`}>
            {getStatusIcon()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                {task.id.split('_')[1]}
              </span>
              {isPartialDisplay && (
                <Badge variant="destructive" className="text-xs px-1 h-5">
                  PARTIAL
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Click for details
            </p>
          </div>
        </div>

        {/* Content preview */}
        <p className="text-sm text-foreground/80 mb-3 overflow-hidden line-clamp-2 leading-relaxed font-medium">
          {task.mediaArticle.title || task.mediaArticle.text.substring(0, 60) + '...'}
        </p>
        {/* Detailed language status for partial display */}
        {task.result && isPartialDisplay && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground mb-2">
              <strong>Languages in {displayStatus}:</strong> {displayLanguages.length}
            </p>
            <div className="space-y-2">
              {task.result.translations
                .filter(translation => displayLanguages.includes(translation.language))
                .map((translation, index) => (
                  <div key={index} className="p-2 bg-muted/50 rounded-md">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{getLanguageDisplayName(translation.language)}</span>
                      <Badge 
                        variant={getLanguageStatusVariant(translation.status || displayStatus)} 
                        className="text-xs px-1 h-4"
                      >
                        {translation.status || displayStatus}
                      </Badge>
                    </div>
                    {translation.complianceScore && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Score: {translation.complianceScore}%
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Simple translation count for full display */}
        {task.result && !isPartialDisplay && (
          <div className="mb-3">
            <p className="text-xs text-muted-foreground">
              <strong>Translations:</strong> {task.result.translations.length}
            </p>
          </div>
        )}
        {/* Language chips */}
        <div className="flex flex-wrap gap-1 mb-3">
          {displayLanguages.slice(0, 3).map(lang => {
            const langStatus = languageStates.get(lang) || displayStatus;
            return (
              <Badge
                key={lang}
                variant={isPartialDisplay ? getLanguageStatusVariant(langStatus) : "outline"}
                className="text-xs px-2 h-5"
              >
                {getLanguageDisplayName(lang)}
              </Badge>
            );
          })}
          {displayLanguages.length > 3 && (
            <Badge className={`text-xs px-2 h-5 bg-gradient-to-r ${getStatusGradientClass()} text-white border-0`}>
              +{displayLanguages.length - 3}
            </Badge>
          )}
        </div>

        {/* Progress bar for active statuses */}
        {(displayStatus === 'translating' || displayStatus === 'llm_verification' || displayStatus === 'human_review') && (
          <div className="mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-muted-foreground font-semibold">Progress</span>
              <span className="text-xs text-foreground font-bold">{task.progress || 0}%</span>
            </div>
            <Progress 
              value={task.progress || 0} 
              className="h-1.5"
            />
          </div>
        )}

        {/* Error state */}
        {task.error && (
          <div className="p-3 bg-gradient-to-r from-destructive/10 to-destructive/5 border border-destructive/20 rounded-lg">
            <div className="flex items-center text-destructive text-xs font-semibold">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Error occurred
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TaskCard;