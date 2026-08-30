'use client';

import Link from 'next/link';
import type { LocalCase } from '@/lib/LocalDataService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FileText, Presentation, BrainCircuit, Trash2, MessageSquare, Layers, Network } from 'lucide-react';
import { LocalDataService } from '@/lib/LocalDataService';
import { useToast } from '@/hooks/use-toast';

interface HistoryCardProps {
  caseItem: LocalCase;
  onDelete?: () => void;
}

export function HistoryCard({ caseItem, onDelete }: HistoryCardProps) {
  const date = new Date(caseItem.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  
  let linkPath = '/ai-diagnosis';
  if (caseItem.type === 'content-generator') linkPath = '/content-generator';
  else if (caseItem.type === 'knowledge-map') linkPath = '/knowledge-map';

  const { toast } = useToast();

  const isDiagnosis = caseItem.type === 'diagnosis';
  const isKnowledgeMap = caseItem.type === 'knowledge-map';
  const slideCount = caseItem.outputData?.slides?.length || 0;
  const diagCount = caseItem.outputData?.diagnoses?.length || 0;
  const followUpCount = caseItem.outputData?.followUpThreads?.length || 0;
  const nodeCount = caseItem.outputData?.totalNodesCount || caseItem.outputData?.knowledgeMap?.tree?.length || 0;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await LocalDataService.deleteCase(caseItem.id);
      toast({ title: 'Record Deleted', description: 'Removed from archives.' });
      if (onDelete) onDelete();
    } catch (err) {
      console.error('Failed to delete case:', err);
    }
  };

  return (
    <Card className="border shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/30">
      <CardHeader className="p-4 sm:p-5 pb-2">
        <div className="flex justify-between items-start gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {isDiagnosis ? (
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10"
                >
                  <span className="flex items-center gap-1">
                    <BrainCircuit className="h-3 w-3" /> Diagnosis Case
                  </span>
                </Badge>
              ) : isKnowledgeMap ? (
                <Badge
                  variant="outline"
                  className="text-[10px] font-semibold border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                >
                  <span className="flex items-center gap-1">
                    <Network className="h-3 w-3" /> Knowledge Map
                  </span>
                </Badge>
              ) : (
                <Badge
                  variant="default"
                  className="text-[10px] font-semibold bg-primary text-primary-foreground"
                >
                  <span className="flex items-center gap-1">
                    <Presentation className="h-3 w-3" /> Presentation Deck
                  </span>
                </Badge>
              )}

              {nodeCount > 0 && isKnowledgeMap && (
                <Badge variant="secondary" className="text-[10px] font-mono gap-1">
                  <Network className="h-3 w-3 text-amber-500" /> {nodeCount} Topics
                </Badge>
              )}

              {slideCount > 0 && (
                <Badge variant="secondary" className="text-[10px] font-mono gap-1">
                  <Layers className="h-3 w-3" /> {slideCount} Slides
                </Badge>
              )}
              {diagCount > 0 && (
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {diagCount} Differentials
                </Badge>
              )}
              {followUpCount > 0 && (
                <Badge variant="secondary" className="text-[10px] font-mono gap-1">
                  <MessageSquare className="h-3 w-3" /> {followUpCount} Follow-ups
                </Badge>
              )}
            </div>
            <CardTitle className="text-sm sm:text-base font-bold text-foreground truncate pt-1">
              {caseItem.title || 'Untitled Case'}
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">{date}</CardDescription>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="h-7 w-7 text-muted-foreground hover:text-red-500 shrink-0"
            title="Delete case"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Link href={`${linkPath}?caseId=${caseItem.id}`}>
              <FileText className="h-3.5 w-3.5 text-primary" />
              Open Record
            </Link>
          </Button>

          {isDiagnosis && (
            <Button asChild size="sm" className="h-8 text-xs gap-1.5 bg-primary/90 hover:bg-primary font-medium">
              <Link href={`/content-generator?fromCaseId=${caseItem.id}`}>
                <Presentation className="h-3.5 w-3.5" />
                Build Slides Deck
              </Link>
            </Button>
          )}

          {isKnowledgeMap && (
            <Button asChild size="sm" className="h-8 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium">
              <Link href={`/knowledge-map?caseId=${caseItem.id}`}>
                <Network className="h-3.5 w-3.5" />
                Study Knowledge Tree
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
