'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/portal/page-header';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { ArrowLeft, Clock, MessageCircle, Sparkles } from 'lucide-react';

type MessageItem = {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  body: string;
  created_at: number;
  status?: string;
  ai_handled?: boolean;
};

type MessageThread = {
  id: string;
  contact_name: string;
  contact_phone: string;
  last_message: string;
  last_at: number;
  lead_status?: string;
};

const leadBadge = (status?: string) => {
  if (status === 'CONVERTED') {
    return { label: 'Scheduled', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (status === 'QUALIFIED' || status === 'CONTACTED') {
    return { label: 'Lead', className: 'bg-amber-50 text-amber-800 border-amber-200' };
  }
  return { label: 'No Lead', className: 'bg-gray-50 text-gray-700 border-gray-200' };
};

const formatDateTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function MessageThreadPage() {
  const params = useParams();
  const router = useRouter();
  const basePath = usePortalBasePath();
  const threadId = String(params?.id || '');

  const [thread, setThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    const loadThread = async () => {
      try {
        const result = await apiClient.getMessageThread(threadId);
        if (!isActive) return;
        setThread(result?.thread ?? null);
        setMessages(Array.isArray(result?.messages) ? result.messages : []);
        setError(null);
      } catch (err) {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : 'Failed to load messages');
        setThread(null);
        setMessages([]);
      } finally {
        if (!isActive) return;
        setLoading(false);
      }
    };
    if (threadId) {
      loadThread();
    }
    return () => {
      isActive = false;
    };
  }, [threadId]);

  if (!thread) {
    return (
      <div className="space-y-6 animate-fade-up">
        <PageHeader
          eyebrow="Messages"
          title={loading ? 'Loading conversation…' : 'Conversation not found'}
          subtitle={loading ? 'Please wait a moment.' : 'Try another thread from Messages.'}
        />
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        <Button onClick={() => router.push(`${basePath}/messages`)}>Back to Messages</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        eyebrow="Messages"
        title={thread.contact_name}
        subtitle={thread.contact_phone}
        actions={
          <Button variant="outline" onClick={() => router.push(`${basePath}/messages`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Messages
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              <span>Conversation</span>
              <span className="text-slate-300">-</span>
              <Clock className="h-4 w-4" />
              <span>{formatDateTime(thread.last_at)}</span>
            </div>
            <Badge variant="outline" className={leadBadge(thread.lead_status).className}>
              {leadBadge(thread.lead_status).label}
            </Badge>
          </div>

          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.direction === 'OUTBOUND'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <p>{msg.body}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs opacity-80">
                    <span>{formatDateTime(msg.created_at)}</span>
                    {msg.ai_handled ? (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> AI
                      </span>
                    ) : null}
                    {msg.status ? <span> - {msg.status}</span> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
