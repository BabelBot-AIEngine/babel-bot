import React, { useState } from 'react';
import { 
  Clock,
  Languages,
  Brain,
  User,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import TaskCard from './TaskCard';
import TaskDetailsModal from './TaskDetailsModal';
import { TranslationTask, hasMultipleLanguageStates, getLanguageStatesForTask, TaskCardDisplayInfo, getTaskDisplayInfoForStatus, LanguageTaskStatus } from '../../types';

interface KanbanBoardProps {
  tasks: TranslationTask[];
  loading: boolean;
}

const statusColumns = [
  { 
    status: 'pending', 
    title: 'Pending', 
    color: 'destructive',
    gradient: 'from-red-500 to-red-400',
    icon: Clock,
  },
  { 
    status: 'translating', 
    title: 'Translating', 
    color: 'orange',
    gradient: 'from-orange-500 to-amber-400',
    icon: Languages,
  },
  { 
    status: 'llm_verification', 
    title: 'LLM Verification', 
    color: 'primary',
    gradient: 'from-blue-500 to-blue-400',
    icon: Brain,
  },
  { 
    status: 'human_review', 
    title: 'Human Review', 
    color: 'secondary',
    gradient: 'from-purple-500 to-purple-400',
    icon: User,
  },
  { 
    status: 'done', 
    title: 'Done', 
    color: 'success',
    gradient: 'from-green-500 to-emerald-400',
    icon: CheckCircle,
  },
  { 
    status: 'failed', 
    title: 'Failed', 
    color: 'outline',
    gradient: 'from-gray-500 to-gray-400',
    icon: AlertCircle,
  },
];

const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, loading }) => {
  const [selectedTask, setSelectedTask] = useState<TranslationTask | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const getTaskDisplayInfosByStatus = (status: string): TaskCardDisplayInfo[] => {
    const displayInfos: TaskCardDisplayInfo[] = [];
    
    tasks.forEach(task => {
      const displayInfo = getTaskDisplayInfoForStatus(task, status as LanguageTaskStatus);
      if (displayInfo) {
        displayInfos.push(displayInfo);
      }
    });
    
    return displayInfos;
  };

  const getLanguageCountByStatus = (status: string) => {
    let count = 0;
    const displayInfos = getTaskDisplayInfosByStatus(status);
    displayInfos.forEach(info => {
      count += info.filteredLanguages.length;
    });
    return count;
  };
  
  const handleTaskClick = (task: TranslationTask) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  return (
    <div className="space-y-6">
      {loading && (
        <div className="mb-6">
          <Progress value={100} className="h-2 bg-background/20" />
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statusColumns.map((column, index) => {
          const columnDisplayInfos = getTaskDisplayInfosByStatus(column.status);
          const totalLanguageCount = getLanguageCountByStatus(column.status);
          const IconComponent = column.icon;
          
          return (
            <div key={column.status} className="min-h-[700px]">
              <Card className="h-full glass-card transition-all duration-500 hover:-translate-y-1">
                <CardContent className="p-4 h-full flex flex-col">
                  {/* Column Header */}
                  <div className="flex items-center mb-4 pb-3 border-b border-border/50">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br ${column.gradient} mr-3 shadow-md`}>
                      <IconComponent className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-foreground mb-1">
                        {column.title}
                      </h3>
                      <div className="flex gap-1">
                        <Badge variant={column.color as any} className="text-xs px-2">
                          {columnDisplayInfos.length} tasks
                        </Badge>
                        {totalLanguageCount > columnDisplayInfos.length && (
                          <Badge variant="secondary" className="text-xs px-2">
                            {totalLanguageCount} langs
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Column Content */}
                  <div className="flex-1 space-y-3">
                    {columnDisplayInfos.map((displayInfo, taskIndex) => (
                      <div
                        key={`${displayInfo.task.id}-${column.status}`}
                        className="animate-in fade-in duration-300"
                        style={{ animationDelay: `${taskIndex * 100}ms` }}
                      >
                        <TaskCard 
                          task={displayInfo.task} 
                          filteredLanguages={displayInfo.filteredLanguages}
                          isPartialDisplay={displayInfo.isPartialDisplay}
                          currentColumnStatus={column.status as LanguageTaskStatus}
                          onClick={() => handleTaskClick(displayInfo.task)} 
                        />
                      </div>
                    ))}
                    {columnDisplayInfos.length === 0 && (
                      <div className="flex items-center justify-center min-h-[120px] text-muted-foreground text-sm italic">
                        No tasks in this column
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
      
      <TaskDetailsModal
        task={selectedTask}
        open={isModalOpen}
        onClose={handleCloseModal}
      />
    </div>
  );
};

export default KanbanBoard;