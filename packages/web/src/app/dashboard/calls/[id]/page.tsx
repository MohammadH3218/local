'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { usePortalBasePath } from '@/lib/portal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AudioPlayer } from '@/components/audio-player';
import { PageHeader } from '@/components/portal/page-header';
import { ArrowLeft, User, Calendar, ExternalLink, AlertCircle, Mic, FileText } from 'lucide-react';

interface Call {
  call_id: string;
  company_id: string;
  contact_id?: string;
  caller_phone: string;
  caller_name?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  created_at: string;
  duration?: number;
  status: string;
  summary?: string;
  transcript?: string;
  recording_url?: string;
  sentiment?: string;
  lead_captured?: boolean;
  appointment_created?: boolean;
  appointment_id?: string;
  outcome?: string;
  lead_quality?: string;
  collected_info?: any;
}

export default function CallDetailsPage() {
  const router = useRouter();
  const basePath = usePortalBasePath();
  const params = useParams();
  const callId = params?.id as string;

  const [call, setCall] = useState<Call | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (callId) {
      loadCallDetails();
    }
  }, [callId]);

  useEffect(() => {
    if (!callId || !call) return;
    const status = (call.status || '').toUpperCase();
    if (status !== 'COMPLETED') return;
    if (call.recording_url && call.transcript) return;

    const interval = window.setInterval(() => {
      void loadCallDetails(true);
    }, 10_000);
    const timeout = window.setTimeout(() => window.clearInterval(interval), 120_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [callId, call?.status, call?.recording_url, call?.transcript]);

  async function loadCallDetails(silent?: boolean) {
    try {
      if (!silent) setIsLoading(true);
      setError(null);
      const callData = await apiClient.getCallById(callId);
      setCall(callData);
    } catch (err: any) {
      console.error('Error loading call details:', err);
      setError(err?.message || 'Failed to load call details');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOutcome = (call: Call): { label: string; className: string } => {
    const outcome = (call.outcome || '').toUpperCase();
    if (outcome === 'APPOINTMENT_BOOKED' || call.appointment_created || call.appointment_id) {
      return { label: 'Booked', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    }
    if (outcome === 'LEAD' || call.lead_captured) {
      return { label: 'Lead', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
    return { label: 'No Lead', className: 'bg-slate-50 text-slate-600 border-slate-200' };
  };

  const getStatusBadge = (status?: string): { label: string; className: string } => {
    const s = (status || '').toUpperCase();
    if (s === 'COMPLETED') return { label: 'Completed', className: 'bg-slate-50 text-slate-600 border-slate-200' };
    if (s === 'IN_PROGRESS' || s === 'RINGING')
      return { label: s.replace('_', ' '), className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    if (s === 'FAILED' || s === 'NO_ANSWER' || s === 'BUSY')
      return { label: s.replace('_', ' '), className: 'bg-red-50 text-red-700 border-red-200' };
    return { label: (status || 'Unknown').replace('_', ' '), className: 'bg-slate-50 text-slate-600 border-slate-200' };
  };

  const extractAddressLine = (info?: any): string => {
    if (!info) return '';
    const raw = info.address ?? info.service_address ?? info.location_address;
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object') {
      const parts = [raw.street, raw.city, raw.state, raw.zip].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    const fallbackParts = [info.street, info.city, info.state, info.zip].filter(Boolean);
    return fallbackParts.length ? fallbackParts.join(', ') : '';
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div>
          <button
            onClick={() => router.push(`${basePath}/calls`)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Calls
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="mt-4 text-sm text-slate-500">Loading call details…</p>
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="space-y-5">
        <div>
          <button
            onClick={() => router.push(`${basePath}/calls`)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Calls
          </button>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-red-800 mb-1">Failed to load call</h3>
          <p className="text-sm text-red-600 mb-4">{error || 'Call not found'}</p>
          <Button onClick={() => void loadCallDetails()} variant="outline" size="sm">Try again</Button>
        </div>
      </div>
    );
  }

  const outcome = getOutcome(call);
  const statusBadge = getStatusBadge(call.status);
  const addressLine = extractAddressLine(call.collected_info);
  const mapQuery = addressLine ? encodeURIComponent(addressLine) : '';
  const mapEmbedUrl = mapQuery ? `https://maps.google.com/maps?output=embed&q=${mapQuery}` : '';
  const mapLink = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${mapQuery}` : '';

  // Parse transcript lines into structured messages
  const transcriptMessages = call.transcript
    ? call.transcript.split('\n').filter(Boolean).map((line, idx) => {
        const isCaller = line.startsWith('Caller:');
        const isAssistant = line.startsWith('Assistant:');
        const role = isCaller ? 'caller' : isAssistant ? 'assistant' : 'other';
        const text = line.replace(/^Caller:\s*|^Assistant:\s*/, '');
        return { idx, role, text, raw: line };
      })
    : [];

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <div>
        <button
          onClick={() => router.push(`${basePath}/calls`)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Calls
        </button>
      </div>

      <PageHeader
        eyebrow="Call details"
        title={call.caller_name ? `${call.caller_name} · ${call.caller_phone}` : call.caller_phone}
        subtitle={`${formatDate(call.created_at)} · ${formatDuration(call.duration)}`}
        meta={
          <>
            <Badge variant="outline" className={outcome.className}>{outcome.label}</Badge>
            <Badge variant="outline" className={statusBadge.className}>{statusBadge.label}</Badge>
          </>
        }
      />

      {/* Associations */}
      {(call.contact_id || call.appointment_id) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {call.contact_id && (
            <button
              type="button"
              onClick={() => router.push(`${basePath}/customers?contact=${call.contact_id}`)}
              className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-100 hover:shadow-md"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
                <User className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">Associated Contact</p>
                <p className="text-xs text-slate-500">View customer profile</p>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </button>
          )}
          {call.appointment_id && (
            <button
              type="button"
              onClick={() => router.push(`${basePath}/appointments?appointment=${call.appointment_id}`)}
              className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-100 hover:shadow-md"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
                <Calendar className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">Booked Appointment</p>
                <p className="text-xs text-slate-500">View appointment details</p>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
            </button>
          )}
        </div>
      )}

      {/* Captured Info + Location */}
      <div className={`grid gap-5 ${addressLine ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Captured Information</h2>
          </div>
          <div className="px-5 py-4">
            {call.collected_info && Object.keys(call.collected_info).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(call.collected_info).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start gap-4 pb-3 border-b border-slate-50 last:border-b-0 last:pb-0">
                    <span className="text-sm text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                    {key.toLowerCase().includes('address') && mapLink ? (
                      <a
                        className="text-sm font-semibold text-emerald-700 text-right hover:underline"
                        href={mapLink}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {String(value)}
                      </a>
                    ) : (
                      <span className="text-sm font-semibold text-slate-900 text-right">{String(value)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No structured information captured during this call.</p>
            )}
          </div>
        </div>

        {addressLine && (
          <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">Location</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <iframe title="Service location" src={mapEmbedUrl} className="h-44 w-full" loading="lazy" />
              </div>
              <p className="text-sm text-slate-600">{addressLine}</p>
              <button
                onClick={() => window.open(mapLink, '_blank')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-600 transition-colors"
              >
                Open in Maps <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Call Recording */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50">
            <Mic className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Call Recording</h2>
            <p className="text-xs text-slate-500">
              {call.recording_url ? 'Listen to the complete call.' : 'Recording not yet available.'}
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          {call.recording_url ? (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
              <AudioPlayer
                src={call.recording_url}
                title={`Call with ${call.caller_name || call.caller_phone}`}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
              <Mic className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Recording will appear shortly after the call ends.</p>
            </div>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50">
            <FileText className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Full Transcript</h2>
            <p className="text-xs text-slate-500">Complete conversation from this call.</p>
          </div>
          {transcriptMessages.length > 0 && (
            <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {transcriptMessages.filter(m => m.role !== 'other').length} turns
            </span>
          )}
        </div>

        <div className="px-5 py-5">
          {transcriptMessages.length > 0 ? (
            /* macOS-style chrome wrapper */
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
              {/* Chrome bar */}
              <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-800/80 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="ml-1.5 text-xs text-slate-500">Transcript</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-xs text-emerald-400">Recorded</span>
                </div>
              </div>

              {/* Messages */}
              <div className="max-h-[560px] overflow-y-auto px-4 py-4 space-y-4">
                {transcriptMessages.map((msg) => {
                  if (msg.role === 'other') {
                    return (
                      <p key={msg.idx} className="text-xs text-slate-500 italic px-1">{msg.text}</p>
                    );
                  }
                  const isAI = msg.role === 'assistant';
                  return (
                    <div key={msg.idx} className="flex items-start gap-3">
                      {/* Avatar */}
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          isAI
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-600 text-slate-200'
                        }`}
                      >
                        {isAI ? 'H' : 'C'}
                      </div>
                      {/* Bubble */}
                      <div className="flex-1 min-w-0">
                        <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${isAI ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {isAI ? 'HandyCall AI' : 'Caller'}
                        </p>
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
              <FileText className="h-8 w-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">Transcript will be generated after the call ends.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
