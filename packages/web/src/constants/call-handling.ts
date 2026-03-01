import { CallHandlingMode } from '@handycall/shared';

export const CALL_HANDLING_OPTIONS: Array<{
  value: CallHandlingMode;
  label: string;
  description: string;
}> = [
  {
    value: CallHandlingMode.ALWAYS,
    label: 'AI answers every call',
    description: 'Forward all calls to HandyCall. Your phone will not ring.',
  },
  {
    value: CallHandlingMode.MISSED,
    label: 'Ring first, then AI on missed calls',
    description: 'Your phone rings first. HandyCall answers if no one picks up.',
  },
  {
    value: CallHandlingMode.AFTER_HOURS,
    label: 'After-hours only',
    description: 'Forward calls to HandyCall outside your business hours.',
  },
];

export function formatCallHandlingLabel(mode?: CallHandlingMode | null): string {
  const match = CALL_HANDLING_OPTIONS.find((option) => option.value === mode);
  return match?.label || 'Not set';
}
