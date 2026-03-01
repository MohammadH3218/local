'use client';

import { useMemo, useState } from 'react';
import { CallHandlingMode } from '@handycall/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type CallForwardingGuideProps = {
  forwardToNumber?: string | null;
  callHandlingMode?: CallHandlingMode | null;
  className?: string;
};

type CarrierKey = 'tmobile' | 'verizon' | 'att';
type GuideSection = {
  key: 'all' | 'missed' | 'after-hours' | 'off';
  title: string;
  description?: string;
  rows?: Array<{
    label: string;
    code?: string;
    offCode?: string;
  }>;
  note?: string;
};

const CARRIER_OPTIONS: Array<{ value: CarrierKey; label: string; description: string }> = [
  { value: 'tmobile', label: 'T-Mobile', description: 'Wireless (GSM)' },
  { value: 'verizon', label: 'Verizon', description: 'Wireless' },
  { value: 'att', label: 'AT&T', description: 'Wireless' },
];

const normalizeDigits = (input?: string | null) => String(input || '').replace(/\D/g, '');

const buildDialTargets = (input?: string | null) => {
  const raw = normalizeDigits(input);
  const ten = raw.length === 11 && raw.startsWith('1') ? raw.slice(1) : raw;
  const tenDigits = ten.length === 10 ? ten : '5551234567';
  const elevenDigits = tenDigits.length === 10 ? `1${tenDigits}` : `1${tenDigits}`;
  return {
    ten: input ? tenDigits : '<your-number>',
    eleven: input ? elevenDigits : '<your-number>',
    exampleTen: tenDigits,
    exampleEleven: elevenDigits,
  };
};

export function CallForwardingGuide({
  forwardToNumber,
  callHandlingMode,
  className,
}: CallForwardingGuideProps) {
  const [carrier, setCarrier] = useState<CarrierKey>('tmobile');
  const dialTargets = useMemo(() => buildDialTargets(forwardToNumber), [forwardToNumber]);
  const carrierMeta = CARRIER_OPTIONS.find((option) => option.value === carrier);

  const sections = useMemo<GuideSection[]>(() => {
    switch (carrier) {
      case 'verizon':
        return [
          {
            key: 'all',
            title: 'Forward all calls',
            rows: [
              { label: 'Turn on', code: `*72${dialTargets.ten}` },
              { label: 'Turn off', code: '*73' },
            ],
            description: 'All calls go directly to HandyCall.',
          },
          {
            key: 'missed',
            title: 'Forward busy or unanswered calls',
            rows: [
              { label: 'Turn on', code: `*71${dialTargets.ten}` },
              { label: 'Turn off', code: '*73' },
            ],
            description: 'Your phone rings first, then HandyCall answers.',
          },
          {
            key: 'after-hours',
            title: 'After-hours only',
            note: 'Use scheduled call forwarding in your phone or carrier tools to enable this after hours.',
          },
          {
            key: 'off',
            title: 'Turn off all forwarding',
            rows: [{ label: 'Disable', code: '*73' }],
          },
        ];
      case 'att':
        return [
          {
            key: 'all',
            title: 'Forward all calls',
            rows: [
              { label: 'Turn on', code: `*21*${dialTargets.ten}#` },
              { label: 'Turn off', code: '#21#' },
            ],
            description: 'All calls go directly to HandyCall.',
          },
          {
            key: 'missed',
            title: 'Forward missed calls',
            note: 'Use your phone settings for call forwarding (no answer/busy). Carrier codes vary by device.',
          },
          {
            key: 'after-hours',
            title: 'After-hours only',
            note: 'Schedule call forwarding in your phone settings if available.',
          },
          {
            key: 'off',
            title: 'Turn off all forwarding',
            rows: [{ label: 'Disable', code: '#21#' }],
          },
        ];
      case 'tmobile':
      default:
        return [
          {
            key: 'all',
            title: 'Forward all calls (unconditional)',
            note: 'Use the Call Forwarding settings on your phone to forward all calls to HandyCall.',
          },
          {
            key: 'missed',
            title: 'Forward missed calls (conditional)',
            note: 'Enable conditional forwarding (no answer, busy, unreachable) in your device settings.',
          },
          {
            key: 'after-hours',
            title: 'After-hours only',
            note: 'Toggle forwarding on after hours and off during open hours to match your schedule.',
          },
          {
            key: 'off',
            title: 'Turn off all forwarding',
            note: 'Disable Call Forwarding from your phone settings.',
          },
        ];
    }
  }, [carrier, dialTargets]);

  const highlightKey =
    callHandlingMode === CallHandlingMode.ALWAYS
      ? 'all'
      : callHandlingMode === CallHandlingMode.MISSED
        ? 'missed'
        : callHandlingMode === CallHandlingMode.AFTER_HOURS
          ? 'after-hours'
          : null;

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Call forwarding guide</CardTitle>
            <CardDescription>Dial these codes from your current business line to forward to HandyCall.</CardDescription>
          </div>
          <Select value={carrier} onValueChange={(value) => setCarrier(value as CarrierKey)}>
            <SelectTrigger className="w-full md:w-[220px]">
              <SelectValue placeholder="Select carrier" />
            </SelectTrigger>
            <SelectContent>
              {CARRIER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-700">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-emerald-900">
          Forwarding to: <span className="font-semibold">{forwardToNumber || 'Your HandyCall number'}</span>
        </div>
        {!forwardToNumber && (
          <div className="text-xs text-slate-500">
            Claim a HandyCall number to see the exact codes for your line. Replace
            <span className="font-mono"> &lt;your-number&gt; </span>
            with the number you want to forward to.
          </div>
        )}
        {carrierMeta && (
          <div className="text-xs text-slate-500">
            Selected carrier: <span className="font-semibold">{carrierMeta.label}</span> · {carrierMeta.description}
          </div>
        )}

        {sections.map((section) => {
          const isHighlighted = highlightKey === section.key;
          return (
            <div
              key={section.key}
              className={`rounded-xl border p-3 ${
                isHighlighted ? 'border-emerald-300 bg-emerald-50/70' : 'border-slate-200 bg-white/80'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{section.title}</span>
                {isHighlighted && <Badge className="bg-emerald-100 text-emerald-700">Matches your selection</Badge>}
              </div>
              {section.description && <div className="mt-1 text-xs text-slate-600">{section.description}</div>}
              {section.rows && (
                <div className="mt-2 space-y-2 text-xs text-slate-600">
                  {section.rows.map((row) => (
                    <div key={`${section.key}-${row.label}`} className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500">{row.label}:</span>
                      {row.code && <span className="font-mono">{row.code}</span>}
                      {row.offCode && <span className="text-slate-400">Off: {row.offCode}</span>}
                    </div>
                  ))}
                </div>
              )}
              {section.note && <div className="mt-2 text-xs text-slate-600">{section.note}</div>}
            </div>
          );
        })}

      </CardContent>
    </Card>
  );
}
