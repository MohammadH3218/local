'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/portal/page-header';
import { AlertCircle, CheckCircle, CheckCircle2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface FlaggedQuestion {
  flagged_id: string;
  call_id: string;
  question: string;
  context?: string;
  ai_attempted_answer?: string;
  confidence_score?: number;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  answer?: string;
  created_at: number;
}

export default function FlaggedQuestionsPage() {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<FlaggedQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<FlaggedQuestion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [answer, setAnswer] = useState('');
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ALL'>('OPEN');
  const [dismissTarget, setDismissTarget] = useState<FlaggedQuestion | null>(null);
  const [isDismissOpen, setIsDismissOpen] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  useEffect(() => { loadQuestions(); }, [filter]);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const status = filter === 'ALL' ? undefined : filter;
      const data = await apiClient.getFlaggedQuestions(status);
      setQuestions(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load questions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = (question: FlaggedQuestion) => {
    setSelectedQuestion(question);
    setAnswer(question.ai_attempted_answer || '');
    setIsDialogOpen(true);
  };

  const handleSaveAnswer = async () => {
    if (!selectedQuestion || !answer) return;
    try {
      await apiClient.resolveFlaggedQuestion(selectedQuestion.flagged_id, {
        answer,
        create_knowledge: true,
        knowledge_type: 'FAQ',
      });
      setIsDialogOpen(false);
      setAnswer('');
      loadQuestions();
    } catch (err: any) {
      toast({ title: 'Resolve failed', description: err.message || 'Failed to resolve question', variant: 'destructive' });
    }
  };

  const handleDismissClick = (question: FlaggedQuestion) => {
    setDismissTarget(question);
    setIsDismissOpen(true);
  };

  const confirmDismiss = async () => {
    if (!dismissTarget) return;
    setIsDismissing(true);
    try {
      await apiClient.dismissFlaggedQuestion(dismissTarget.flagged_id);
      setIsDismissOpen(false);
      setDismissTarget(null);
      loadQuestions();
      toast({ title: 'Dismissed', description: 'The question has been dismissed.' });
    } catch (err: any) {
      toast({ title: 'Dismiss failed', description: err.message || 'Failed to dismiss question', variant: 'destructive' });
    } finally {
      setIsDismissing(false);
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusPill = (status: string) => {
    if (status === 'OPEN') return 'bg-amber-50 text-amber-800 border-amber-200';
    if (status === 'RESOLVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-slate-50 text-slate-600 border-slate-200';
  };

  if (error) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Review" title="Flagged questions" />
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}{' '}
          <button onClick={loadQuestions} className="font-semibold underline">Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Review"
        title="Flagged questions"
        subtitle="Review and answer questions your AI was uncertain about."
      />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm w-fit">
        {(['ALL', 'OPEN', 'RESOLVED', 'DISMISSED'] as const).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setFilter(status)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              filter === status
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Count */}
      {!isLoading && (
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{questions.length}</span> question{questions.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="mb-2 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : questions.length > 0 ? (
        <div className="space-y-3">
          {questions.map((q) => (
            <div key={q.flagged_id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Question */}
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-sm font-semibold text-slate-900">{q.question}</p>
                  </div>

                  {/* Context */}
                  {q.context && (
                    <p className="mb-3 text-xs text-slate-500">
                      <span className="font-semibold">Context:</span> {q.context}
                    </p>
                  )}

                  {/* AI attempt */}
                  {q.ai_attempted_answer && (
                    <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-700 mb-1">AI's attempt</p>
                      <p className="text-xs text-slate-700">{q.ai_attempted_answer}</p>
                      {q.confidence_score !== undefined && (
                        <p className="mt-1.5 text-[10px] text-slate-400">
                          Confidence: {Math.round(q.confidence_score * 100)}%
                        </p>
                      )}
                    </div>
                  )}

                  {/* Resolved answer */}
                  {q.answer && (
                    <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                      <p className="text-xs font-semibold text-emerald-700 mb-1">Your answer</p>
                      <p className="text-xs text-slate-700">{q.answer}</p>
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{formatDate(q.created_at)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusPill(q.status)}`}>
                      {q.status.charAt(0) + q.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {q.status === 'OPEN' && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleResolve(q)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Resolve
                    </button>
                    <button
                      onClick={() => handleDismissClick(q)}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-700">
            {filter === 'OPEN' ? 'No pending questions' : 'No questions found'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {filter === 'OPEN'
              ? 'Your AI is handling all questions confidently.'
              : 'Try changing the filter to see more questions.'}
          </p>
        </div>
      )}

      {/* Resolve dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolve question</DialogTitle>
          </DialogHeader>
          {selectedQuestion && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 mb-1">Question</p>
                <p className="text-sm text-slate-900">{selectedQuestion.question}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="answer" className="text-xs font-semibold text-slate-700">Your answer</Label>
                <Textarea
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={5}
                  placeholder="Provide a clear, accurate answer…"
                  className="resize-none"
                />
                <p className="text-xs text-slate-400">This answer will be saved to your knowledge base as an FAQ.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSaveAnswer} disabled={!answer}>Save & Resolve</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dismiss dialog */}
      <Dialog open={isDismissOpen} onOpenChange={setIsDismissOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dismiss question</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">This question will be dismissed and removed from the active queue.</p>
            {dismissTarget && (
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-sm text-slate-700">
                {dismissTarget.question}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDismissOpen(false)} disabled={isDismissing}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDismiss} disabled={isDismissing}>
                {isDismissing ? 'Dismissing…' : 'Dismiss'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
