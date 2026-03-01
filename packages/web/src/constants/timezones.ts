export type TimezoneOption = {
  value: string;
  label: string;
};

export const DEFAULT_TIMEZONE = 'America/New_York';

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

export function hasTimezoneOption(value?: string | null) {
  if (!value) return false;
  return TIMEZONE_OPTIONS.some((option) => option.value === value);
}
