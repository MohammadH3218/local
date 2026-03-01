'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sparkles, RefreshCw, Send, Wand2 } from 'lucide-react';

type ChatRole = 'user' | 'assistant';

type AssistantMessage = {
  role: ChatRole;
  content: string;
};

type Props = {
  onImported?: () => Promise<void> | void;
  title?: string;
  description?: string;
};

const STARTER_PROMPTS = [
  'We do one-time and subscription services.',
  'Our pricing depends on property size and urgency.',
  'We serve specific zip codes and cities.',
];

export function KnowledgeSetupAssistant({
  onImported,
  title = 'AI setup assistant',
  description = 'Answer a few focused questions. We will generate and save structured knowledge entries for you.',
}: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState('');
  const [loadingReply, setLoadingReply] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [done, setDone] = useState(false);
  const [missingTopics, setMissingTopics] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<{ created_count: number; updated_count: number } | null>(null);

  const canSend = input.trim().length > 0 && !loadingReply;
  const canGenerate = messages.some((item) => item.role === 'user') && !savingKnowledge;

  const placeholder = useMemo(() => {
    if (messages.length === 0) return 'Loading first question...';
    return 'Type your answer...';
  }, [messages.length]);

  useEffect(() => {
    void fetchAssistantReply([], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAssistantReply = async (history: AssistantMessage[], replaceHistory: boolean = false) => {
    setLoadingReply(true);
    try {
      const response = await apiClient.knowledgeAssistantRespond(history);
      const assistantMessage = String(response?.assistant_message || '').trim();
      if (assistantMessage) {
        setMessages((prev) => {
          const base = replaceHistory ? history : history.length ? history : prev;
          return [...base, { role: 'assistant', content: assistantMessage }];
        });
      }
      setDone(response?.done === true);
      setMissingTopics(Array.isArray(response?.missing_topics) ? response.missing_topics : []);
    } catch (error: any) {
      toast({
        title: 'Assistant unavailable',
        description: error?.message || 'Could not load assistant response.',
        variant: 'destructive',
      });
    } finally {
      setLoadingReply(false);
    }
  };

  const sendMessage = async () => {
    const userMessage = input.trim();
    if (!userMessage) return;
    const nextHistory = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(nextHistory);
    setInput('');
    await fetchAssistantReply(nextHistory);
  };

  const resetConversation = async () => {
    setMessages([]);
    setDone(false);
    setMissingTopics([]);
    setLastResult(null);
    await fetchAssistantReply([], true);
  };

  const generateKnowledge = async () => {
    if (!canGenerate) return;
    setSavingKnowledge(true);
    try {
      const response = await apiClient.knowledgeAssistantGenerate(messages, true);
      const createdCount = Number(response?.created_count || 0);
      const updatedCount = Number(response?.updated_count || 0);
      setLastResult({ created_count: createdCount, updated_count: updatedCount });

      toast({
        title: 'Knowledge saved',
        description: `${createdCount} created, ${updatedCount} updated.`,
      });
      if (onImported) await onImported();
    } catch (error: any) {
      toast({
        title: 'Generation failed',
        description: error?.message || 'Could not generate knowledge items.',
        variant: 'destructive',
      });
    } finally {
      setSavingKnowledge(false);
    }
  };

  return (
    <Card className="border-emerald-100 bg-emerald-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-emerald-100 bg-white p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">Preparing your interview...</p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-lg px-3 py-2 text-sm ${
                  message.role === 'assistant'
                    ? 'border border-emerald-100 bg-emerald-50 text-emerald-900'
                    : 'border border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                  {message.role === 'assistant' ? 'Assistant' : 'You'}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ))
          )}
          {loadingReply && (
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
              Thinking...
            </div>
          )}
        </div>

        {missingTopics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {missingTopics.map((topic) => (
              <Badge key={topic} variant="outline">
                Missing: {topic}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingReply}
              onClick={() => setInput(prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={placeholder}
            disabled={loadingReply}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSend) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <Button type="button" onClick={() => void sendMessage()} disabled={!canSend}>
            <Send className="mr-2 h-4 w-4" />
            Send
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void resetConversation()} disabled={loadingReply}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Restart
          </Button>
          <Button type="button" onClick={() => void generateKnowledge()} disabled={!canGenerate}>
            <Wand2 className="mr-2 h-4 w-4" />
            {savingKnowledge ? 'Generating...' : done ? 'Generate knowledge now' : 'Generate with current answers'}
          </Button>
          {lastResult && (
            <p className="text-xs text-slate-600">
              Last run: {lastResult.created_count} created, {lastResult.updated_count} updated.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
