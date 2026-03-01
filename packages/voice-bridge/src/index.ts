import http from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import twilio from 'twilio';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { toolsSchema } from './toolsSchema';

function env(name: string): string | undefined {
  return process.env[name];
}

function envFirst(names: string[]): string | undefined {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return undefined;
}

function requireEnvFirst(names: string[]): string {
  const value = envFirst(names);
  if (!value) throw new Error(`Missing required env var (one of): ${names.join(', ')}`);
  return value;
}

const awsRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const ssm = new SSMClient({ region: awsRegion });

type SecretName = 'OPENAI_API_KEY' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_ACCOUNT_SID';

const ssmParamDefaults: Record<SecretName, string> = {
  OPENAI_API_KEY: '/handycall/prod/openai_api_key',
  TWILIO_AUTH_TOKEN: '/handycall/prod/twilio_auth_token',
  TWILIO_ACCOUNT_SID: '/handycall/prod/twilio_account_sid',
};

const secretCache = new Map<SecretName, string>();

function isPlaceholderSecret(value: string) {
  const v = value.trim().toLowerCase();
  return v === 'changeme' || v === 'replace_me' || v === 'replace-me' || v === 'todo';
}

async function getSecret(name: SecretName): Promise<string> {
  const cached = secretCache.get(name);
  if (cached) return cached;

  const direct = env(name);
  if (direct && !isPlaceholderSecret(direct)) {
    secretCache.set(name, direct);
    return direct;
  }

  const overrideParam = env(`SSM_PARAM_${name}`);
  const paramName = overrideParam || ssmParamDefaults[name];
  const result = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter missing/empty for ${name}: ${paramName}`);
  secretCache.set(name, value);
  return value;
}

function json(res: http.ServerResponse, status: number, body: any) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  });
  res.end(data);
}

function xml(res: http.ServerResponse, status: number, body: string) {
  const data = Buffer.from(body);
  res.writeHead(status, {
    'Content-Type': 'text/xml',
    'Content-Length': data.length,
  });
  res.end(data);
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function parseFormUrlEncoded(raw: Buffer): Record<string, string> {
  const params = new URLSearchParams(raw.toString('utf8'));
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

type DaySchedule = {
  open?: string;
  close?: string;
  closed?: boolean;
  segments?: Array<{ open: string; close: string }>;
};

type BusinessHours = Record<string, DaySchedule | undefined>;

function parseTimeToMinutes(value?: string): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function getLocalParts(date: Date, timeZone: string): { weekday: string; minutes: number } | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const weekday = parts.find((p) => p.type === 'weekday')?.value.toLowerCase();
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { weekday, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

function resolveScheduleForDay(hours: BusinessHours | undefined, weekday: string): DaySchedule | null {
  if (!hours || typeof hours !== 'object') return null;
  const direct = hours[weekday];
  if (direct) return direct;
  const shortMap: Record<string, string> = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
  };
  const shortKey = shortMap[weekday];
  return shortKey ? hours[shortKey] ?? null : null;
}

function normalizeTimeZone(input: string | undefined, fallback: string): string {
  const candidate = String(input || '').trim();
  const safeFallback = String(fallback || 'UTC').trim() || 'UTC';
  if (!candidate) return safeFallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return safeFallback;
  }
}

function isWithinBusinessHours(
  hours: BusinessHours | undefined,
  timeZone: string | undefined,
  now: Date = new Date()
): boolean | null {
  if (!hours) return null;
  const tz = normalizeTimeZone(timeZone || '', 'UTC');
  const parts = getLocalParts(now, tz);
  if (!parts) return null;
  const schedule = resolveScheduleForDay(hours, parts.weekday);
  if (!schedule) return null;
  if (schedule.closed) return false;

  const segments = Array.isArray(schedule.segments) && schedule.segments.length
    ? schedule.segments
    : schedule.open && schedule.close
      ? [{ open: schedule.open, close: schedule.close }]
      : [];

  let hasValidSegment = false;
  for (const segment of segments) {
    const open = parseTimeToMinutes(segment.open);
    const close = parseTimeToMinutes(segment.close);
    if (open === null || close === null) continue;
    hasValidSegment = true;
    if (open <= close) {
      if (parts.minutes >= open && parts.minutes < close) return true;
    } else {
      if (parts.minutes >= open || parts.minutes < close) return true;
    }
  }

  if (!hasValidSegment) return null;
  return false;
}

function isLowSignalTranscript(input: string): boolean {
  const text = (input || '').trim();
  if (!text) return true;
  if (text.length < 4) return true;
  if (/^[\W_]+$/.test(text)) return true;
  const nonLatin = (text.match(/[^\u0000-\u024F\s]/g) || []).length;
  if (nonLatin / Math.max(1, text.length) > 0.25) return true;
  return false;
}

function isMeaningfulGreetingReply(text: string): boolean {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 1 && !/\d/.test(trimmed)) return false;
  return true;
}

function toWsBaseUrl(publicBaseUrl: string) {
  if (publicBaseUrl.startsWith('https://')) return `wss://${publicBaseUrl.slice('https://'.length)}`;
  if (publicBaseUrl.startsWith('http://')) return `ws://${publicBaseUrl.slice('http://'.length)}`;
  return publicBaseUrl;
}

function extractEmail(input: string): string | null {
  const match = input.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function extractPhone(input: string): string | null {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function spellEmailForConfirmation(input: string): string {
  const email = String(input || '').trim().toLowerCase();
  if (!email) return '';
  const tokens: string[] = [];
  for (const ch of email) {
    if (/[a-z0-9]/.test(ch)) {
      tokens.push(ch);
      continue;
    }
    if (ch === '@') {
      tokens.push('at');
    } else if (ch === '.') {
      tokens.push('dot');
    } else if (ch === '-') {
      tokens.push('dash');
    } else if (ch === '_') {
      tokens.push('underscore');
    } else if (ch === '+') {
      tokens.push('plus');
    }
  }
  return tokens.join(' ');
}

function normalizeNameCandidate(input: string): string | null {
  const cleaned = input.replace(/[^A-Za-z\\s'-]/g, ' ').replace(/\\s+/g, ' ').trim();
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (['yes', 'yeah', 'yep', 'no', 'nope', 'nah', 'ok', 'okay'].includes(lower)) return null;
  const bannedPhrases = [
    'my focus',
    'my issue',
    'my problem',
    'my question',
    'my address',
    'my zip',
    'my number',
    'my time',
    'my date',
    'booking',
    'appointment',
    'schedule',
    'pest',
    'bug',
    'service',
  ];
  if (bannedPhrases.some((p) => lower.includes(p))) return null;
  if (cleaned.length > 60) return null;
  const wordCount = cleaned.split(/\\s+/).filter(Boolean).length;
  if (wordCount > 4) return null;
  return cleaned;
}

function looksLikeAddress(input: string): boolean {
  const text = input.trim().toLowerCase();
  if (!text) return false;
  const hasNumber = /\\d/.test(text);
  const hasLetter = /[a-z]/i.test(text);
  if (!hasNumber || !hasLetter) return false;
  const keywords = [
    ' street',
    ' st',
    ' road',
    ' rd',
    ' drive',
    ' dr',
    ' avenue',
    ' ave',
    ' lane',
    ' ln',
    ' boulevard',
    ' blvd',
    ' court',
    ' ct',
    ' circle',
    ' cir',
    ' way',
    ' parkway',
    ' pkwy',
    ' place',
    ' pl',
    ' trail',
    ' trl',
  ];
  return keywords.some((k) => text.includes(k));
}

function extractInlineIntake(lastPrompt: string, userText: string): Record<string, any> {
  const prompt = (lastPrompt || '').toLowerCase();
  const text = userText.trim();
  const out: Record<string, any> = {};

  if (!text) return out;

  if (prompt.includes('name')) {
    const match = text.match(/(?:my name is|my full name is|this is)\\s+([A-Za-z][A-Za-z\\s'-]{1,60})/i);
    const name = normalizeNameCandidate(match?.[1] || text);
    if (name) out.name = name;
  } else if (prompt.includes('zip')) {
    const zipMatch = text.match(/\\b\\d{5}\\b/);
    if (zipMatch) out.zip = zipMatch[0];
    else if (looksLikeAddress(text)) out.address = text;
  } else if (prompt.includes('phone') || prompt.includes('number')) {
    const phone = extractPhone(text);
    if (phone) out.phone = phone;
  } else if (prompt.includes('email')) {
    const email = extractEmail(text);
    if (email) out.email = email;
  } else if (prompt.includes('address')) {
    out.address = text;
  } else if (prompt.includes('time') || prompt.includes('date') || prompt.includes('appointment')) {
    out.preferred_time = text;
  } else if (prompt.includes('issue') || prompt.includes('problem') || prompt.includes('pest')) {
    out.issue = text;
  }

  return out;
}

function titleizeField(input: string): string {
  return String(input || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizeFieldKey(input: string): string {
  return String(input || '').trim().toLowerCase();
}

function isNameField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return k === 'full_name' || k === 'name' || k === 'customer_name';
}

function isZipField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return k === 'zip' || k === 'zipcode' || k === 'postal_code';
}

function isEmailField(key: string): boolean {
  return normalizeFieldKey(key) === 'email';
}

function isPhoneField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return k === 'phone' || k === 'phone_number' || k === 'phone_number_verification';
}

function isAddressField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return [
    'address',
    'service_address',
    'location_address',
    'pickup_location',
    'dropoff_location',
  ].includes(k);
}

const serviceFieldPriority = [
  'service_request_type',
  'service_type',
  'service_list',
  'issue_summary',
  'issue_type',
  'pest_type_or_symptoms',
  'visit_reason',
  'reason_for_visit',
  'treatment_interest',
  'symptoms',
  'problem_description',
];

function isServiceField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return serviceFieldPriority.includes(k);
}

function isPreferredTimeField(key: string): boolean {
  const k = normalizeFieldKey(key);
  return k === 'preferred_time' || k === 'preferred_datetime';
}

function formatServiceTypeLabel(serviceType?: string): string {
  const upper = String(serviceType || '').toUpperCase();
  const map: Record<string, string> = {
    PEST_CONTROL: 'Pest Control',
    ELECTRICIAN: 'Electrical',
    PLUMBING: 'Plumbing',
    HVAC: 'HVAC',
    LANDSCAPING: 'Landscaping',
    LAWN_CARE: 'Lawn Care',
    CLEANING: 'Cleaning',
    CARPET_CLEANING: 'Carpet Cleaning',
    WINDOW_CLEANING: 'Window Cleaning',
    PRESSURE_WASHING: 'Pressure Washing',
    POOL_SERVICE: 'Pool Service',
    TREE_SERVICE: 'Tree Service',
    ROOFING: 'Roofing',
    GARAGE_DOOR: 'Garage Door',
    APPLIANCE_REPAIR: 'Appliance Repair',
    AUTO_MECHANIC: 'Auto Repair',
    LOCKSMITH: 'Locksmith',
    MOVING: 'Moving',
    JUNK_REMOVAL: 'Junk Removal',
    IRRIGATION: 'Irrigation',
    SNOW_REMOVAL: 'Snow Removal',
    FENCING: 'Fencing',
    CONCRETE: 'Concrete',
    SOLAR: 'Solar',
    SECURITY: 'Security Systems',
    PAINTING: 'Painting',
    FLOORING: 'Flooring',
    REMODELING: 'Remodeling',
    HANDYMAN: 'Handyman',
    OTHER: 'Service',
  };
  if (map[upper]) return map[upper];
  return titleizeField(serviceType || 'Service');
}

function buildIntakeFieldOrder(template: any, requireZipCheck: boolean): string[] {
  const required: string[] = Array.isArray(template?.intake_schema?.required)
    ? template.intake_schema.required
        .map((f: any) => String(f || '').trim())
        .filter((f: string) => Boolean(f))
    : [];
  const fallback: string[] = [
    'full_name',
    ...(requireZipCheck ? ['zip'] : []),
    'issue_summary',
    'service_address',
    'preferred_time',
  ];
  const source = required.length ? required : fallback;
  const unique: string[] = Array.from(new Set(source));
  const base = unique.filter((f) => !isPreferredTimeField(f));
  const preferred = unique.find((f) => isPreferredTimeField(f)) ? ['preferred_time'] : ['preferred_time'];
  const filtered = base.filter((f) => !isPhoneField(f));

  const zipFields = filtered.filter((f) => isZipField(f));
  const serviceFields = filtered.filter((f) => isServiceField(f));
  const otherFields = filtered.filter(
    (f) => !isZipField(f) && !isServiceField(f) && !isEmailField(f)
  );

  if (requireZipCheck && !zipFields.length) {
    zipFields.unshift('zip');
  }
  if (!serviceFields.length) {
    serviceFields.push('service_request_type');
  }

  const ordered: string[] = [];
  if (requireZipCheck && zipFields.length) ordered.push(...zipFields);
  ordered.push(...serviceFields);
  ordered.push(...otherFields);
  // Collect email only after booking is created (ASK_EMAIL), so do not include in pre-booking intake order.
  ordered.push(...preferred);

  return Array.from(new Set(ordered.filter((f) => Boolean(f))));
}

function fieldPrompt(key: string, serviceLabel: string, serviceType?: string): string {
  const k = normalizeFieldKey(key);
  const type = String(serviceType || '').toUpperCase();
  if (k === 'service_request_type' || k === 'service_type' || k === 'service_list') {
    switch (type) {
      case 'PEST_CONTROL':
        return 'Are you dealing with a specific pest, or looking for general pest protection?';
      case 'PLUMBING':
        return 'What plumbing issue are you having? (leak, clog, install, etc.)';
      case 'HVAC':
        return 'Is this for heating or cooling, and what’s the issue?';
      case 'ELECTRICIAN':
        return 'What electrical issue are you having? (outlet, breaker, lighting, etc.)';
      case 'LANDSCAPING':
      case 'LAWN_CARE':
        return 'What type of service do you need—mowing, cleanup, or landscaping work?';
      case 'CLEANING':
      case 'CARPET_CLEANING':
      case 'WINDOW_CLEANING':
      case 'PRESSURE_WASHING':
      case 'POOL_SERVICE':
        return 'What kind of cleaning service are you looking for?';
      case 'AUTO_MECHANIC':
        return 'What’s going on with the vehicle?';
      case 'LOCKSMITH':
        return 'Are you locked out, or do you need a lock change or rekey?';
      case 'ROOFING':
        return 'Is this a leak repair, inspection, or replacement?';
      case 'GARAGE_DOOR':
        return 'Is the garage door not opening, stuck, or needing a repair?';
      case 'APPLIANCE_REPAIR':
        return 'Which appliance needs repair and what’s the issue?';
      default:
        return `What service do you need from our ${serviceLabel.toLowerCase()} team?`;
    }
  }
  const prompts: Record<string, string> = {
    full_name: "What's your full name?",
    name: "What's your full name?",
    issue_summary: "Briefly, what's the issue?",
    issue_type: "What issue are you having?",
    pest_type_or_symptoms: 'What pest are you seeing, or is it general pest prevention?',
    where_seen: "Where have you seen it?",
    severity: 'How severe is it? Low, medium, or high?',
    service_address: "What's the service address?",
    address: "What's the service address?",
    location_address: "What's the service address?",
    pickup_location: 'Where are you located for pickup?',
    dropoff_location: 'Where should we drop it off?',
    urgency: 'How urgent is it? (emergency, soon, or routine)',
    system_type: 'What type of system is it?',
    symptoms: 'What symptoms are you noticing?',
    vehicle_make: 'What make is the vehicle?',
    vehicle_model: 'What model is it?',
    vehicle_year: 'What year is it?',
    service_type: 'What type of service do you need?',
    lot_approx_size: 'About how big is the property or lot?',
    home_size_sqft: 'About how large is the home (square feet)?',
    num_beds: 'How many bedrooms?',
    num_baths: 'How many bathrooms?',
    treatment_interest: 'Which treatment are you interested in?',
    visit_reason: 'What are you coming in for?',
    case_type: 'What type of case is this about?',
    brief_summary: 'Can you give a brief summary?',
    reason_for_visit: 'What is the reason for your visit?',
    stylist_pref: 'Do you have a stylist preference?',
    service_list: 'What service are you looking for?',
    roof_age_approx: 'About how old is the roof?',
    is_new_patient: 'Are you a new patient? (yes or no)',
    is_new_client: 'Are you a new client? (yes or no)',
    is_emergency: 'Is this an emergency? (yes or no)',
    is_safe: 'Are you in a safe location right now? (yes or no)',
    situation: 'Can you briefly describe the situation?',
    insurance_type: 'What type of insurance do you have (PPO, HMO, or cash)?',
    preferred_time: 'What day and time would you prefer?',
    email: 'What email should I send your confirmation link to?',
    zip: "What's your 5-digit zip code?",
  };
  return prompts[k] || `Please share your ${titleizeField(key)}.`;
}


function normalizeForEcho(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fillerTokens = new Set([
  'uh',
  'um',
  'uhh',
  'umm',
  'okay',
  'ok',
  'yeah',
  'yep',
  'right',
  'hmm',
  'mm',
]);

function isFillerUtterance(text: string): boolean {
  const normalized = normalizeForEcho(text);
  if (!normalized) return true;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount <= 2 && fillerTokens.has(normalized);
}

function resolveTransferTarget(queue?: string): string | null {
  const raw = typeof queue === 'string' ? queue.trim() : '';
  const key = raw ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '_') : '';
  const candidates = [
    key ? `TRANSFER_${key}_NUMBER` : null,
    key ? `TRANSFER_${key}` : null,
    key ? `TRANSFER_QUEUE_${key}` : null,
    raw ? `TRANSFER_${raw}` : null,
    'TRANSFER_DEFAULT_NUMBER',
    'TRANSFER_NUMBER',
  ].filter(Boolean) as string[];
  return envFirst(candidates) || null;
}

function isExplicitBargeIn(text: string): boolean {
  const t = normalizeForEcho(text);
  if (!t) return false;
  return [
    'stop',
    'hold on',
    'wait',
    'one second',
    'give me a second',
    'pause',
    'cancel',
    'actually',
  ].some((phrase) => t === phrase || t.startsWith(`${phrase} `) || t.includes(phrase));
}

function isLikelyEcho(userText: string, assistantText: string): boolean {
  const user = normalizeForEcho(userText);
  const assistant = normalizeForEcho(assistantText);
  if (!user || !assistant) return false;
  if (user.length < 6) return false;
  if (assistant.includes(user) || user.includes(assistant)) return true;
  const userTokens = user.split(' ').filter(Boolean);
  if (userTokens.length < 4) {
    return assistant.includes(user) && user.length >= 5;
  }
  const assistantTokens = new Set(assistant.split(' ').filter(Boolean));
  const overlap = userTokens.filter((t) => assistantTokens.has(t)).length;
  return overlap / userTokens.length >= 0.75;
}

function looksLikeServiceRequest(text: string): boolean {
  const t = normalizeForEcho(text);
  if (!t) return false;
  if (hasBookingIntent(t) || looksLikeTimeRequest(t)) return true;
  if (/\b(service|appointment|estimate|quote|visit|inspection|schedule|booking|book)\b/.test(t)) return true;
  if (/\b(need|help|issue|problem|repair|fix|install|replace|maintenance)\b/.test(t)) return true;
  if (/\b(pest|bug|bugs|roach|roaches|ant|ants|termite|termites|rat|rats|mouse|mice)\b/.test(t)) return true;
  if (/\b(plumb|electric|hvac|heating|cooling|clean|landscape|roof|garage|appliance)\b/.test(t)) return true;
  return false;
}

function formatSlotForPrompt(slotIso: string, timeZone: string): string {
  const d = new Date(slotIso);
  if (!Number.isFinite(d.getTime())) return slotIso;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return fmt.format(d);
  } catch {
    return slotIso;
  }
}

function formatSlotChoices(slots: BookingSlotOption[], limit = 3): string[] {
  if (!slots.length) return [];
  const subset = slots.slice(0, Math.max(1, limit));
  return subset.map((slot) => slot.label);
}

type BookingStep =
  | 'idle'
  | 'ask_name'
  | 'confirm_name'
  | 'ask_zip'
  | 'confirm_zip'
  | 'ask_time'
  | 'confirm_time'
  | 'offer_slots'
  | 'done';

type BookingSlotOption = {
  iso: string;
  label: string;
  timeLabel: string;
  hold_id?: string;
};

type ConversationState =
  | 'GREETING'
  | 'ASK_NAME'
  | 'CONFIRM_NAME'
  | 'ASK_ZIP'
  | 'CONFIRM_ZIP'
  | 'COLLECTING'
  | 'ASK_PLAN'
  | 'ASK_TIME'
  | 'ASK_EMAIL'
  | 'CONFIRM_EMAIL'
  | 'OFFER_SLOTS'
  | 'CONFIRM_BOOKING'
  | 'ANSWERING'
  | 'FOLLOW_UP'
  | 'CLOSING';

type SessionContext = {
  state: ConversationState;
  intent?: 'booking' | 'question' | 'unknown';
  customerName?: string;
  zipCode?: string;
  proposedTime?: string;
  serviceNeed?: string;
};

function hasBookingIntent(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (
    /\b(book|booking|schedule|appointment|appt|reschedule|availability|available|time\s+slot|time\s+slots|timeslot|visit)\b/.test(
      t
    )
  ) {
    return true;
  }
  return /\b(set\s+up|set-up|come\s+out|come\s+by|send\s+someone|send\s+somebody)\b/.test(t);
}

function looksLikeQuestion(text: string): boolean {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  return /^(what|why|how|when|where|who|can you|do you|is it|are you|does it|could you|would you)\b/.test(t);
}

function extractNameValue(text: string): string | null {
  const match = text.match(
    /(?:my name is|my full name is|this is|it's|it is|i am|i'm|im)\s+([A-Za-z][A-Za-z\s'-]{1,60})/i
  );
  const candidate = match?.[1] || text;
  return normalizeNameCandidate(candidate);
}

function extractZipValue(text: string): string | null {
  const match = text.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

type ParsedTimeNeedle = {
  hour: number;
  minute: string;
  meridiem: 'am' | 'pm';
};

function extractTimeNeedle(text: string): ParsedTimeNeedle | null {
  const raw = normalizeTimeLabel(text).replace(/\./g, '');
  if (!raw) return null;
  const normalized = raw.replace(/\b(a\s*m|p\s*m)\b/g, (match) => match.replace(/\s+/g, ''));
  if (normalized.includes('noon')) {
    return { hour: 12, minute: '00', meridiem: 'pm' };
  }
  if (normalized.includes('midnight')) {
    return { hour: 12, minute: '00', meridiem: 'am' };
  }
  let meridiem: 'am' | 'pm' | null = null;
  if (normalized.includes('am') || normalized.includes('morning')) meridiem = 'am';
  if (normalized.includes('pm') || normalized.includes('afternoon') || normalized.includes('evening') || normalized.includes('night')) {
    meridiem = meridiem ?? 'pm';
  }
  if (!meridiem) return null;
  const match = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 1 || hour > 12) return null;
  const minute = match[2] ? match[2].padStart(2, '0') : '00';
  return { hour, minute, meridiem };
}

function looksLikeTimeRequest(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(t)) {
    return true;
  }
  if (/\b(today|tomorrow|next|this|week|weekend|morning|afternoon|evening|night)\b/.test(t)) return true;
  if (extractTimeNeedle(t)) return true;
  if (/\b(at|around|about|for)\s+\d{1,2}(?::\d{2})?\b/.test(t)) return true;
  return false;
}

function formatSlotTimeOnly(slotIso: string, timeZone: string): string {
  const d = new Date(slotIso);
  if (!Number.isFinite(d.getTime())) return slotIso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return slotIso;
  }
}

function normalizeTimeLabel(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTimeFromText(text: string): string {
  return String(text || '')
    .replace(/\b(?:at|around|about|for)\s+\d{1,2}(?::\d{2})?\b/gi, ' ')
    .replace(/\b(at|around|about|for)\b/gi, ' ')
    .replace(/\b(noon|midnight)\b/gi, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(a\s*\.?\s*m\.?|p\s*\.?\s*m\.?)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*o'?clock\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasDayReference(text: string): boolean {
  return /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|next|this)\b/i.test(
    text
  );
}

function pickSlotFromResponse(text: string, slots: BookingSlotOption[]): BookingSlotOption | null {
  if (!slots.length) return null;
  const t = normalizeTimeLabel(text);
  if (!t) return null;
  if (t.includes('first')) return slots[0] || null;
  if (t.includes('second')) return slots[1] || null;
  if (t.includes('third')) return slots[2] || null;
  if (t.includes('fourth')) return slots[3] || null;
  if (t.includes('earliest') || t.includes('first available') || t.includes('next available')) {
    return slots[0] || null;
  }
  if (t.includes('latest')) return slots[slots.length - 1] || null;

  const timeNeedle = extractTimeNeedle(text);
  if (timeNeedle) {
    const needle = normalizeTimeLabel(`${timeNeedle.hour}:${timeNeedle.minute} ${timeNeedle.meridiem}`);
    const matched = slots.find((slot) => slot.timeLabel === needle);
    if (matched) return matched;
  }
  if (!/\b\d{5}\b/.test(t)) {
    const hourOnly = t.match(/\b(\d{1,2})\b/);
    if (hourOnly) {
      const hour = Number(hourOnly[1]);
      if (Number.isFinite(hour) && hour >= 1 && hour <= 12) {
        const matches = slots.filter((slot) => slot.timeLabel.startsWith(`${hour}:`));
        if (matches.length === 1) return matches[0];
      }
    }
  }

  return null;
}

function zipToSpoken(zip: string): string {
  return zip.split('').join('-');
}

function isAffirmative(text: string): boolean {
  const t = normalizeForEcho(text);
  if (!t) return false;
  const phrases = [
    'yes',
    'yeah',
    'yep',
    'yup',
    'correct',
    'right',
    'that is right',
    'thats right',
    'that is correct',
    'sounds good',
    'ok',
    'okay',
    'sure',
  ];
  return phrases.some((phrase) => t === phrase || new RegExp(`\\b${phrase}\\b`).test(t));
}

function isNegative(text: string): boolean {
  const t = normalizeForEcho(text);
  if (!t) return false;
  const phrases = [
    'no',
    'nope',
    'nah',
    'incorrect',
    'wrong',
    'not',
    'not correct',
    'thats wrong',
    'that is wrong',
  ];
  return phrases.some((phrase) => t === phrase || new RegExp(`\\b${phrase}\\b`).test(t));
}

function isYesNoPrompt(prompt: string): boolean {
  const t = normalizeForEcho(prompt);
  if (!t) return false;
  if (t.includes('yes or no')) return true;
  if (t.includes('is there anything else')) return true;
  if (t.includes('want me to book') || t.includes('should i book')) return true;
  if (t.startsWith('is ') || t.startsWith('are ') || t.startsWith('was ') || t.startsWith('were ')) return true;
  if (t.startsWith('do ') || t.startsWith('does ') || t.startsWith('did ')) return true;
  if (t.startsWith('can ') || t.startsWith('could ') || t.startsWith('would ') || t.startsWith('should ') || t.startsWith('will ')) {
    return true;
  }
  return false;
}

// function isLikelyNonAnswer(lastPrompt: string, userText: string): boolean {
function isLikelyNonAnswer(): boolean {
  // Completely disable this heuristic for now to prevent dropping valid short answers.
  // The LLM is smart enough to handle "ok" or "hi" if it's contextually relevant.
  return false;
}

async function postJson(url: string, headers: Record<string, string>, body: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : {};
}

type CallContext = {
  callSid: string;
  streamSid: string;
  from: string;
  to: string;
  company_id: string;
  startedAt: number;
  transfer_enabled?: boolean;
  transfer_number?: string;
};

type ActiveCallMeta = {
  company_id: string;
  from: string;
  to: string;
  startedAt: number;
  service_area_zipcodes?: string[];
};

const activeCalls = new Map<string, ActiveCallMeta>();


function buildInstructions(input: {
  company_name: string;
  service_type?: string;
  timezone?: string;
  service_template?: any;
  extra?: string;
}) {
  const { company_name, service_type, timezone, service_template, extra } = input;
  const serviceLabel = formatServiceTypeLabel(service_type);
  const requireZipCheck = service_template?.tool_policy?.require_zip_check === true;

  const businessRules: string[] = [];
  if (requireZipCheck) {
    businessRules.push('Service area check required: ask for ZIP and call check_service_area(zip) before booking.');
  }
  if (service_template?.intake_schema?.required?.length) {
    businessRules.push(`Required intake fields: ${service_template.intake_schema.required.join(', ')}.`);
  }
  if (service_template?.intake_schema?.optional?.length) {
    businessRules.push(`Optional intake fields: ${service_template.intake_schema.optional.join(', ')}.`);
  }
  if (timezone) {
    businessRules.push(`Timezone: ${timezone}.`);
  }
  if (extra) {
    businessRules.push(extra);
  }

  const lines = [
    `[IDENTITY]`,
    `You are a real, warm, natural-sounding phone receptionist for ${company_name} (${serviceLabel}).`,
    `You help callers: (a) book/reschedule/cancel, (b) answer business questions, or (c) take a message for a callback.`,
    ``,
    `[VOICE & STYLE]`,
    `- Sound human: contractions, short phrases, light fillers ("Got it...", "Okay - sure.").`,
    `- Keep it brief: max 1-2 short sentences, then ONE question.`,
    `- No monologues. No lists longer than 3 items.`,
    `- Do not repeat the same sentence structure two turns in a row.`,
    `- Never "think out loud".`,
    ``,
    ...(service_template?.base_system_prompt
      ? [`[BUSINESS CONTEXT]`, String(service_template.base_system_prompt), ``]
      : []),
    `[HARD CONVERSATION RULES]`,
    `- ONE question per turn, then STOP and wait. (Do not ask follow-ups until the caller answers.) <wait>`,
    `- Do not assume you heard correctly. If the caller is unclear, ask ONE clarifying question.`,
    `- Never pretend the caller said something they did not say. Only use info explicitly provided by the caller or returned by tools.`,
    `- Never invent availability, pricing, policies, or services. Use knowledge_search or say you will have the team follow up.`,
    ``,
    `[PRIMARY GOAL]`,
    `Resolve the call quickly and correctly:`,
    `1) Identify intent: book/reschedule/cancel vs question vs message.`,
    `2) If booking-related, collect the minimum required fields efficiently.`,
    `3) Use tools at the correct times (below).`,
    `4) Confirm once (single summary confirmation) right before booking.`,
    `5) Close the call politely and end.`,
    ``,
    `[FLOW - STATE MACHINE]`,
    `You always operate in ONE of these states:`,
    `A) GREETING -> B) INTENT -> C) INTAKE -> D) AVAILABILITY -> E) CONFIRM_SUMMARY -> F) BOOKED -> G) WRAP_UP`,
    ``,
    `State rules:`,
    `- GREETING: greet + ask what they need. <wait>`,
    `- INTENT: classify into (booking / reschedule / cancel / question / message). Ask ONE question to route. <wait>`,
    `- INTAKE: collect required fields (name, zip/address if required, service, preferred time window, email if needed for link). Keep it moving.`,
    `- AVAILABILITY: call get_availability based on what they requested. Offer 3 options max if needed.`,
    `- CONFIRM_SUMMARY: do ONE summary confirmation ONLY:`,
    `"Okay, I have {Name}, {Service}, at {Address/Zip if needed}, for {Date/Time}. Is that right?" <wait>`,
    `- BOOKED: only after "yes" AND create_booking returns success, acknowledge booking and send link (send_booking_link).`,
    `- WRAP_UP: "Anything else I can help with?" If no -> goodbye + save_call + end_call.`,
    ``,
    `[CONFIRMATION POLICY]`,
    `- Do NOT confirm each field one-by-one.`,
    `- Only do a single summary confirmation in CONFIRM_SUMMARY.`,
    `- If caller corrects something, update and re-summarize once.`,
    ``,
    `[TOOLS - WHEN TO CALL WHAT]`,
    `- create_lead: call early once you have intent + any basic contact detail (caller phone is known).`,
    `- check_service_area(zip): if required, call as soon as you get zip; if out of area, apologize and take a message.`,
    `- knowledge_search(query): for business questions (services, policies, pricing if documented). If not found, do not guess.`,
    `- get_availability(start_time, end_time): before booking. Never invent times.`,
    `- create_booking(confirmed=true, ...): ONLY after caller confirmed the summary.`,
    `- send_booking_link(email): ONLY after booking succeeds.`,
    `- save_call(summary, collected_info): near the end, concise.`,
    `- transfer_call / end_call: if needed.`,
    `IMPORTANT: If transferring, do NOT speak - silently call the transfer tool.`,
    ``,
    `[FALLBACKS / EDGE CASES]`,
    `- If caller is unclear 2 times in a row: apologize and offer a callback message or transfer.`,
    `- If tools fail: apologize once, ask for an alternative time/day, retry once.`,
    `- If caller asks for unrelated topics: politely steer back to booking or message.`,
    ``,
    businessRules.length ? `[BUSINESS RULES]\n${businessRules.join('\n')}` : null,
  ].filter(Boolean) as string[];

  return lines.join('\n');
}

async function resolveTenant(toNumber: string) {
  const toolsBase = requireEnvFirst(['TOOLS_API_BASE_URL', 'HANDYCALL_BACKEND_BASE_URL']).replace(
    /\/$/,
    ''
  );
  const toolsKey = requireEnvFirst(['TOOLS_API_KEY', 'HANDYCALL_TOOLS_API_KEY']);
  return postJson(
    `${toolsBase}/tenant/resolve`,
    { 'x-handycall-tools-key': toolsKey },
    { to_number: toNumber }
  );
}

async function invokeTool(ctx: CallContext, name: string, args: any) {
  const toolsBase = requireEnvFirst(['TOOLS_API_BASE_URL', 'HANDYCALL_BACKEND_BASE_URL']).replace(
    /\/$/,
    ''
  );
  const toolsKey = requireEnvFirst(['TOOLS_API_KEY', 'HANDYCALL_TOOLS_API_KEY']);
  console.log(`[invokeTool] calling ${name} for ${ctx.callSid}`, { args });

  if (name === 'create_lead') {
    return postJson(
      `${toolsBase}/tools/create_lead`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        from_number: ctx.from,
        to_number: ctx.to,
        collected_info: args?.collected_info ?? args ?? {},
      }
    );
  }

  if (name === 'save_call') {
    return postJson(
      `${toolsBase}/tools/save_call`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        summary: args?.summary,
        transcript: args?.transcript,
        duration_seconds: args?.duration_seconds,
        collected_info: args?.collected_info,
      }
    );
  }

  if (name === 'save_recording') {
    return postJson(
      `${toolsBase}/tools/save_recording`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        recording_sid: args?.recording_sid,
        duration_seconds: args?.duration_seconds,
      }
    );
  }

  if (name === 'request_callback') {
    return postJson(
      `${toolsBase}/tools/create_lead`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        from_number: ctx.from,
        to_number: ctx.to,
        collected_info: {
          callback_request: {
            name: args?.name,
            callback_number: args?.callback_number,
            reason: args?.reason,
            preferred_time: args?.preferred_time,
          },
        },
      }
    );
  }

  if (name === 'transfer_call') {
    if (!ctx.transfer_enabled) {
      return { ok: false, error: 'Transfer is disabled for this account.' };
    }
    const queue = typeof args?.queue === 'string' ? args.queue : '';
    const configuredNumber = typeof ctx.transfer_number === 'string' ? ctx.transfer_number.trim() : '';
    const target = configuredNumber || resolveTransferTarget(queue);
    if (!target) {
      return { ok: false, error: 'No transfer target configured for this queue.' };
    }
    const accountSid = await getSecret('TWILIO_ACCOUNT_SID');
    const authToken = await getSecret('TWILIO_AUTH_TOKEN');
    const client = twilio(accountSid, authToken);
    const twiml = `<Response><Dial>${escapeXml(target)}</Dial></Response>`;
    await client.calls(ctx.callSid).update({ twiml });
    return { ok: true, target };
  }

  if (name === 'check_service_area') {
    return postJson(
      `${toolsBase}/tools/check_service_area`,
      { 'x-handycall-tools-key': toolsKey },
      { company_id: ctx.company_id, zip: args.zip }
    );
  }

  if (name === 'knowledge_search') {
    return postJson(
      `${toolsBase}/tools/knowledge_search`,
      { 'x-handycall-tools-key': toolsKey },
      { company_id: ctx.company_id, query: args?.query ?? '', top_k: args?.top_k }
    );
  }

  if (name === 'get_availability') {
    return postJson(
      `${toolsBase}/tools/get_availability`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        start_time: args.preferred_time || args.start_time || args.window_start,
        end_time: args.window_end || args.end_time || '',
        timezone: args.timezone || '',
      }
    );
  }

  if (name === 'hold_slot') {
    return postJson(
      `${toolsBase}/tools/hold_slot`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        slot: args.slot || args.start_time,
        timezone: args.timezone || '',
        hold_minutes: args.hold_minutes,
      }
    );
  }

  if (name === 'create_booking') {
    // Basic gate: ensure model is sending confirmed=true
    if (args.confirmed !== true) {
      return { error: 'You must confirm with the user before booking.' };
    }
    return postJson(
      `${toolsBase}/tools/create_booking`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        call_id: ctx.callSid,
        from_phone: ctx.from,
        customer_name: args.customer_name || args.full_name,
        customer_email: args.customer_email,
        service_type: args.service_type || 'General',
        details: args.details || {},
        notes: args.notes,
        start_time: args.start_time,
        end_time: args.end_time,
        timezone: args.timezone,
        confirmed: true,
      }
    );
  }

  if (name === 'list_appointments_by_phone') {
    return postJson(
      `${toolsBase}/tools/list_appointments_by_phone`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        phone: ctx.from,
        range_days: args.range_days || 90,
      }
    );
  }

  if (name === 'cancel_appointment') {
    return postJson(
      `${toolsBase}/tools/cancel_appointment`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        appointment_id: args.appointment_id,
        reason: args.reason || '',
      }
    );
  }

  if (name === 'reschedule_appointment') {
    return postJson(
      `${toolsBase}/tools/reschedule_appointment`,
      { 'x-handycall-tools-key': toolsKey },
      {
        company_id: ctx.company_id,
        appointment_id: args.appointment_id,
        new_start_time: args.new_start_time,
        timezone: args.timezone,
      }
    );
  }

  if (name === 'update_intake') {
    // Handled locally in the WS loop because it is per-call state.
    return { ok: true };
  }

  if (name === 'check_service_availability') {
    const zip = String(args.zip_code || '').trim();
    if (!zip) return { serviced: false, message: 'Zip code is required' };

    const call = activeCalls.get(ctx.callSid);
    const allowed = call?.service_area_zipcodes;

    // If no restricted areas defined, assume open.
    if (!allowed || !allowed.length) {
      return { serviced: true, message: 'Service available (open territory).' };
    }

    const serviced = allowed.includes(zip);
    if (!serviced) {
      return { serviced: false, message: 'Sorry, we do not service this zip code area.' };
    }
    return { serviced: true, message: 'Great! We service that area.' };
  }

  if (name === 'end_call') {
    const accountSid =
      envFirst(['TWILIO_ACCOUNT_SID', 'TWILIO_SID']) || (await getSecret('TWILIO_ACCOUNT_SID'));
    const authToken = await getSecret('TWILIO_AUTH_TOKEN');
    const client = twilio(accountSid, authToken);
    await client.calls(ctx.callSid).update({ status: 'completed' });
    return { ok: true };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function sendToTwilio(ws: WebSocket, msg: any) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function sendToOpenAI(ws: WebSocket, msg: any) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function responseCreate(
  modalities: Array<'audio' | 'text'> = ['audio', 'text'],
  instructions?: string,
  options?: { temperature?: number; max_output_tokens?: number; tool_choice?: 'none' | 'auto' }
) {
  return {
    type: 'response.create',
    ...(instructions
      ? { response: { modalities, instructions, ...(options ?? {}) } }
      : { response: { modalities } }),
  };
}

const port = Number(process.env.PORT || 8082);

const server = http.createServer(async (req, res) => {
  try {
    // EB/ALB health checks often default to `/` unless configured otherwise.
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && req.url?.startsWith('/twilio/recording-status')) {
      const raw = await readBody(req);
      const params = parseFormUrlEncoded(raw);

      const callSid = (params.CallSid || params.callSid || '').trim();
      const recordingSid = (params.RecordingSid || params.recordingSid || '').trim();
      const recordingStatus = (params.RecordingStatus || params.recordingStatus || '').trim().toLowerCase();
      const to = (params.To || params.to || '').trim();
      const from = (params.From || params.from || '').trim();
      const durationSeconds = Number.parseInt(params.RecordingDuration || params.recordingDuration || '', 10);

      // Best-effort validate Twilio signature if we can (don't block recording save on mismatch).
      try {
        const signature = req.headers['x-twilio-signature'];
        const authToken = await getSecret('TWILIO_AUTH_TOKEN');
        const publicBaseUrl = requireEnvFirst(['PUBLIC_BASE_URL', 'VOICE_BRIDGE_PUBLIC_BASE_URL']).replace(/\/$/, '');
        const url = `${publicBaseUrl}${req.url?.split('?')[0] || ''}`;
        if (typeof signature === 'string') {
          const ok = twilio.validateRequest(authToken, signature, url, params);
          if (!ok) {
            console.warn('[twilio] recording-status signature validation failed', { callSid, recordingSid });
          }
        }
      } catch (e: any) {
        console.warn('[twilio] recording-status signature check skipped/failed', e?.message ?? String(e));
      }

      if (callSid && recordingSid && recordingStatus === 'completed') {
        // Resolve company_id using in-memory map first, then fall back to tenant resolve via To number.
        let meta = activeCalls.get(callSid);
        if (!meta && to) {
          try {
            const tenant: any = await resolveTenant(to);
            meta = { company_id: tenant.company_id, from: from || '', to, startedAt: Date.now() };
          } catch (e: any) {
            console.warn('[twilio] resolveTenant failed for recording callback', e?.message ?? String(e));
          }
        }

        if (meta?.company_id) {
          const ctx: CallContext = {
            callSid,
            streamSid: 'recording_callback',
            from: meta.from || from,
            to: meta.to || to,
            company_id: meta.company_id,
            startedAt: meta.startedAt || Date.now(),
          };

          // Fire-and-forget: persist recording to S3 via backend tools API.
          invokeTool(ctx, 'save_recording', {
            recording_sid: recordingSid,
            duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
          }).catch((e: any) => console.error('[twilio] save_recording failed', e?.message ?? String(e)));
        }

        activeCalls.delete(callSid);
      }

      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && req.url?.startsWith('/twilio/stream-status')) {
      const raw = await readBody(req);
      const form = parseFormUrlEncoded(raw);
      console.log('[twilio] stream status', form);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && req.url?.startsWith('/twilio/voice')) {
      const publicBaseUrl = requireEnvFirst(['PUBLIC_BASE_URL', 'VOICE_BRIDGE_PUBLIC_BASE_URL']).replace(
        /\/$/,
        ''
      );
      const raw = await readBody(req);
      const form = parseFormUrlEncoded(raw);

      const validate = (process.env.TWILIO_VALIDATE_SIGNATURE ?? 'true') === 'true';
      if (validate) {
        const authToken = await getSecret('TWILIO_AUTH_TOKEN');
        const signature = (req.headers['x-twilio-signature'] as string | undefined) ?? '';
        const url = `${publicBaseUrl}/twilio/voice`;
        const ok = twilio.validateRequest(authToken, signature, url, form);
        if (!ok) {
          return json(res, 401, { ok: false, error: 'Invalid Twilio signature' });
        }
      }

      const to = form.To || '';
      const from = form.From || '';
      const callSid = form.CallSid || '';

      const wsBase = toWsBaseUrl(publicBaseUrl);
      const mediaWsUrl = `${wsBase}/twilio/media`;
      const streamStatusUrl = `${publicBaseUrl}/twilio/stream-status`;
      const streamTrack = envFirst(['TWILIO_STREAM_TRACK']);
      const mediaToken = process.env.TWILIO_MEDIA_STREAM_TOKEN || '';
      const trackAttr = streamTrack ? ` track="${escapeXml(streamTrack)}"` : '';

      console.log('[twilio] voice webhook', { callSid, from, to, mediaWsUrl, streamTrack: streamTrack || 'default' });

      let tenant: any = null;
      if (to) {
        try {
          tenant = await resolveTenant(to);
        } catch (err: any) {
          console.warn('[twilio] resolveTenant failed for call handling check', err?.message ?? String(err));
        }
      }
      const aiTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(mediaWsUrl)}"${trackAttr} statusCallback="${escapeXml(streamStatusUrl)}" statusCallbackEvent="start end">
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
      <Parameter name="to" value="${escapeXml(to)}" />
      <Parameter name="from" value="${escapeXml(from)}" />
      <Parameter name="token" value="${escapeXml(mediaToken)}" />
    </Stream>
  </Connect>
</Response>`;

      const configuredTransfer = typeof tenant?.transfer_number === 'string' ? tenant.transfer_number.trim() : '';
      const businessNumber = typeof tenant?.phone_number === 'string' ? tenant.phone_number.trim() : '';
      const fallbackTransfer = resolveTransferTarget() || '';
      const routingTarget = configuredTransfer || businessNumber || fallbackTransfer;
      const mode = String(tenant?.call_handling_mode || 'ALWAYS').toUpperCase();

      if (tenant?.calls_enabled === false) {
        if (routingTarget) {
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${escapeXml(routingTarget)}</Dial>
</Response>`;
          return xml(res, 200, twiml);
        }
        const blockedTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, this service is temporarily unavailable. Please try again later.</Say>
  <Hangup/>
</Response>`;
        return xml(res, 200, blockedTwiml);
      }

      if (mode === 'AFTER_HOURS') {
        const isOpen = isWithinBusinessHours(tenant?.business_hours, tenant?.timezone, new Date());
        if (isOpen === true && routingTarget) {
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>${escapeXml(routingTarget)}</Dial>
</Response>`;
          return xml(res, 200, twiml);
        }
      }

      if (mode === 'MISSED' && routingTarget) {
        const timeoutSeconds = Number(process.env.MISSED_MODE_RING_SECONDS || 18);
        const safeTimeout = Number.isFinite(timeoutSeconds) ? Math.min(Math.max(Math.round(timeoutSeconds), 8), 45) : 18;
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${safeTimeout}">${escapeXml(routingTarget)}</Dial>
  <Connect>
    <Stream url="${escapeXml(mediaWsUrl)}"${trackAttr} statusCallback="${escapeXml(streamStatusUrl)}" statusCallbackEvent="start end">
      <Parameter name="callSid" value="${escapeXml(callSid)}" />
      <Parameter name="to" value="${escapeXml(to)}" />
      <Parameter name="from" value="${escapeXml(from)}" />
      <Parameter name="token" value="${escapeXml(mediaToken)}" />
    </Stream>
  </Connect>
</Response>`;
        return xml(res, 200, twiml);
      }

      return xml(res, 200, aiTwiml);
    }

    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  try {
    const url = req.url || '';
    if (!url.startsWith('/twilio/media')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } catch {
    socket.destroy();
  }
});

wss.on('connection', (twilioWs: WebSocket) => {
  let openaiWs: WebSocket | null = null;
  let ctx: CallContext | null = null;
  let conversation: Array<{ role: 'caller' | 'assistant'; text: string }> = [];
  let pendingAssistantText = '';
  let pendingAssistantHeuristicText = '';
  let assistantTranscriptSource: 'audio' | 'output_audio' | null = null;
  let callSaved = false;
  let intake: Record<string, any> = {};
  let lastAssistantAskedAnythingElseAt: number | null = null;
  let pendingAutoHangup = false;
  let pendingHangupMarkName: string | null = null;
  let pendingHangupTimer: NodeJS.Timeout | null = null;
  let forcedHangupTimer: NodeJS.Timeout | null = null;
  let assistantAudioActiveUntil = 0;
  let noResponseTimer: NodeJS.Timeout | null = null;
  let noResponseStage: 0 | 1 = 0;
  let recordingStartAttempted = false;
  let pendingResponseTimer: NodeJS.Timeout | null = null;
  let lastUserTranscriptAt = 0;
  let userSpeechActive = false;
  let pendingUserTranscript = '';
  let pendingResponseAfterSpeech = false;
  let openaiOutputAudioFormat: string = 'g711_ulaw';
  let audioDeltaDebugCount = 0;
  let lastAssistantText = '';
    let lastAssistantAt = 0;
    let lastResponseId: string | null = null;
    let tenant: any = null;
    let lastCallerText = '';
    let lastCallerAt = 0;
  let lastAssistantQuestionAt = 0;
  let lastUserSpeechStartedAt = 0;
  let lastUserSpeechStoppedAt = 0;
  let lastUserSpeechDurationMs = 0;
  let isProcessingTool = false;
  const fsmEnabled = true;
  let sessionContext: SessionContext = { state: 'GREETING', intent: 'unknown' };
  let lastFsmPrompt: string | null = null;
  let pendingAnswerFollowUp = false;
  let bookingStep: BookingStep = 'idle';
  let bookingSlots: BookingSlotOption[] = [];
  let pendingName: string | null = null;
  let pendingZip: string | null = null;
  let pendingSlot: BookingSlotOption | null = null;
    let pendingEmail: string | null = null;
    let pendingEmailPurpose: 'intake' | 'link' | null = null;
    let appointmentCreated = false;
    let pendingPlanOffer: string | null = null;
    let planInquiryComplete = false;
    let lastPlanQueryKey: string | null = null;
    let intakeFieldOrder: string[] = [];
  let activeIntakeField: string | null = null;
  let lastBookingPrompt: string | null = null;
  // let lastBookingPromptAt = 0; // Unused
  let bookingPromptActive = false;
    let lastAvailabilitySlots: string[] = [];
    let lastAvailabilityTimezone: string | null = null;
    let initialGreetingSent = false;
    let openaiSessionReady = false;
    let twilioStreamReady = false;
    let allowModelResponse = false;
  let outboundAudioQueue: string[] = [];
  let outboundAudioTimer: NodeJS.Timeout | null = null;
  let outboundNextSendAt = 0;
  let lowSignalCount = 0;

  function log(msg: string, extra?: any) {
    const prefix = ctx ? `[callSid=${ctx.callSid} streamSid=${ctx.streamSid}]` : '[twilio]';
    if (extra !== undefined) console.log(prefix, msg, extra);
    else console.log(prefix, msg);
  }

  function enqueueTwilioAudio(payloadBase64: string) {
    if (twilioWs.readyState !== twilioWs.OPEN) return;
    let buf: Buffer;
    try {
      buf = Buffer.from(payloadBase64, 'base64');
    } catch {
      return;
    }
    const frameSize = 160; // 20ms of G.711 u-law at 8kHz
    const padByte = 0xff; // u-law silence
    for (let offset = 0; offset < buf.length; offset += frameSize) {
      let chunk = buf.subarray(offset, offset + frameSize);
      if (chunk.length < frameSize) {
        const padded = Buffer.alloc(frameSize, padByte);
        chunk.copy(padded, 0, 0, chunk.length);
        chunk = padded;
      }
      outboundAudioQueue.push(chunk.toString('base64'));
    }
    if (!outboundNextSendAt) outboundNextSendAt = Date.now();
    if (!outboundAudioTimer) scheduleTwilioAudioDrain();
  }

  function scheduleTwilioAudioDrain() {
    if (outboundAudioTimer) return;
    const delay = Math.max(0, outboundNextSendAt - Date.now());
    outboundAudioTimer = setTimeout(drainTwilioAudio, delay);
  }

  function drainTwilioAudio() {
    outboundAudioTimer = null;
    if (twilioWs.readyState !== twilioWs.OPEN) {
      outboundAudioQueue = [];
      outboundNextSendAt = 0;
      return;
    }
    const payload = outboundAudioQueue.shift();
    if (!payload) {
      outboundNextSendAt = 0;
      return;
    }
    sendToTwilio(twilioWs, {
      event: 'media',
      streamSid: ctx?.streamSid,
      media: { payload },
    });
    outboundNextSendAt = Math.max(outboundNextSendAt + 20, Date.now() + 20);
    if (outboundAudioQueue.length > 0) scheduleTwilioAudioDrain();
  }

  function linearPcm16ToMuLawSample(sample: number): number {
    // G.711 mu-law encode (8-bit) from 16-bit linear PCM with volume boost
    const BIAS = 0x84; // 132
    const VOLUME_BOOST = 1.5; // Boost volume by 50%

    let sign = 0;
    let pcm = Math.round(sample * VOLUME_BOOST);

    if (pcm < 0) {
      sign = 0x80;
      pcm = -pcm;
    }

    // Clamp to prevent clipping
    if (pcm > 32635) pcm = 32635;

    pcm = pcm + BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    const mantissa = (pcm >> (exponent + 3)) & 0x0f;
    const ulawByte = ~(sign | (exponent << 4) | mantissa) & 0xff;
    if (ulawByte === 0) return 0x02;
    if (ulawByte === 0xff) return 0x7f;
    return ulawByte;
  }

  function calculateRmsFromBase64(b64: string): number {
    try {
      const buf = Buffer.from(b64, 'base64');
      if (buf.length === 0) return 0;
      let sumSq = 0;
      // Mu-law to linear expansion approximation or just treating as raw 8-bit for rough energy check
      // Mu-law roughly: s = sign(m) * (1/255) * ((1+255)^|m| - 1)
      // For a simple noise gate, raw byte variance is often enough, but let's do a quick lookup-based expansion if needed.
      // Actually, simple sum of squares of bytes is a rough proxy for energy in mu-law but very non-linear.
      // Better: expand mu-law to linear 14-bit.
      for (const byte of buf) {
        // Simple mu-law expansion
        const sign = (byte & 0x80) ? -1 : 1;
        const exponent = (byte >> 4) & 0x07;
        const mantissa = byte & 0x0F;
        const sample = sign * ((((mantissa << 3) + 0x84) << exponent) - 0x84);
        sumSq += sample * sample;
      }
      return Math.sqrt(sumSq / buf.length);
    } catch {
      return 0;
    }
  }

  function pcm16BytesToG711UlawBytesAdaptive(pcmBytes: Buffer): Buffer {
    const sampleCount = Math.floor(pcmBytes.length / 2);
    if (sampleCount <= 0) return Buffer.alloc(0);

    // Downsample from 24kHz (OpenAI) to 8kHz (Twilio) using 3:1 ratio
    // Use averaging to preserve quality during sample rate conversion
    const downsampleFactor = 3;
    const outSamples = Math.floor(sampleCount / downsampleFactor);
    if (outSamples <= 0) return Buffer.alloc(0);

    const out = Buffer.allocUnsafe(outSamples);
    for (let i = 0; i < outSamples; i++) {
      const base = i * downsampleFactor;
      let sum = 0;
      for (let k = 0; k < downsampleFactor; k++) {
        const idx = (base + k) * 2;
        if (idx + 1 < pcmBytes.length) {
          sum += pcmBytes.readInt16LE(idx);
        }
      }
      const avg = Math.max(-32768, Math.min(32767, Math.round(sum / downsampleFactor)));
      out[i] = linearPcm16ToMuLawSample(avg);
    }
    return out;
  }

  function pcm16BytesToG711UlawBase64Adaptive(pcmBytes: Buffer): string {
    const ulawBytes = pcm16BytesToG711UlawBytesAdaptive(pcmBytes);
    return ulawBytes.toString('base64');
  }

  function decodeBase64Safe(data: string): Buffer | null {
    try {
      return Buffer.from(data, 'base64');
    } catch {
      return null;
    }
  }

  function shouldTreatDeltaAsPcm16(deltaBase64: string): boolean {
    if (openaiOutputAudioFormat === 'pcm16') return true;
    void deltaBase64;
    return false;
  }

  function mergedTranscriptText(): string {
    const lines = conversation
      .map((item) => {
        const label = item.role === 'caller' ? 'Caller' : 'Assistant';
        return `${label}: ${item.text}`.trim();
      })
      .filter(Boolean);
    return lines.join('\n').trim();
  }

  async function startTwilioRecording(callSid: string) {
    if (recordingStartAttempted) return;
    recordingStartAttempted = true;

    const enabled = (process.env.TWILIO_RECORD_CALLS ?? 'true') !== 'false';
    if (!enabled) return;

    try {
      const publicBaseUrl = requireEnvFirst(['PUBLIC_BASE_URL', 'VOICE_BRIDGE_PUBLIC_BASE_URL']).replace(/\/$/, '');
      const accountSid =
        envFirst(['TWILIO_ACCOUNT_SID', 'TWILIO_SID']) || (await getSecret('TWILIO_ACCOUNT_SID'));
      const authToken = await getSecret('TWILIO_AUTH_TOKEN');
      const client = twilio(accountSid, authToken);

      await client.calls(callSid).recordings.create({
        recordingStatusCallback: `${publicBaseUrl}/twilio/recording-status`,
        recordingStatusCallbackMethod: 'POST',
        recordingStatusCallbackEvent: ['completed'],
        recordingChannels: 'mono',
      });
    } catch (e: any) {
      log('startTwilioRecording failed (non-fatal)', e?.message ?? String(e));
    }
  }

  function clearNoResponseTimer() {
    if (noResponseTimer) {
      clearTimeout(noResponseTimer);
      noResponseTimer = null;
    }
  }

  function clearPendingResponseTimer() {
    if (pendingResponseTimer) {
      clearTimeout(pendingResponseTimer);
      pendingResponseTimer = null;
    }
  }

    function scheduleAssistantResponse() {
      if (!openaiWs || pendingAutoHangup) return;
      if (!fsmEnabled && bookingStep !== 'idle') return;
      clearPendingResponseTimer();
      if (!pendingUserTranscript.trim()) {
        if (!pendingAutoHangup) armNoResponseTimer();
        return;
    }
    if (lastUserSpeechStoppedAt && Date.now() - lastUserSpeechStoppedAt < 250) {
      pendingResponseAfterSpeech = true;
      return;
    }
    const wordCount = pendingUserTranscript.trim().split(/\s+/).filter(Boolean).length;
    const delayMs = wordCount <= 2 ? 900 : 650;
    const minSilenceMs = 750;
    pendingResponseTimer = setTimeout(async () => {
      pendingResponseTimer = null;
      if (!openaiWs || pendingAutoHangup) return;
      if (userSpeechActive) {
        pendingResponseAfterSpeech = true;
        return;
      }
      if (Date.now() - lastUserTranscriptAt < minSilenceMs) {
        pendingResponseAfterSpeech = true;
        scheduleAssistantResponse();
        return;
      }
      if (!pendingUserTranscript.trim()) return;
      const bufferedText = pendingUserTranscript;
      if (fsmEnabled) {
        try {
          const handled = await handleFsmTurn(bufferedText);
          pendingUserTranscript = '';
          if (handled) {
            noResponseStage = 0;
            return;
          }
          sendPrompt("Sorry, I didn't catch that. Could you repeat?");
          return;
        } catch (err: any) {
          log('handleFsmTurn failed (deferred)', err?.message ?? String(err));
          pendingUserTranscript = '';
          sendPrompt("Sorry, I ran into a hiccup. Could you say that again?");
          return;
        }
      } else if (bookingStep === 'idle') {
        try {
          const handledBooking = await handleBookingTurn(bufferedText);
          if (handledBooking) {
            noResponseStage = 0;
            pendingUserTranscript = '';
            return;
          }
        } catch (err: any) {
          log('handleBookingTurn failed (deferred)', err?.message ?? String(err));
        }
        }
        pendingUserTranscript = '';
        allowModelResponse = true;
        sendToOpenAI(openaiWs!, responseCreate());
      }, delayMs);
    }

  function tryInitialGreeting() {
    if (initialGreetingSent) return;
    if (!openaiSessionReady || !twilioStreamReady) return;
    if (!ctx || !openaiWs || pendingAutoHangup) return;

    initialGreetingSent = true;
    log('Sending initial greeting', { openaiReady: openaiSessionReady, twilioReady: twilioStreamReady });

    const companyName = tenant?.company_name || 'HandyCall';
    const greetingText = `Hi, thanks for calling ${companyName}. How can I help you today?`;

    if (fsmEnabled) {
      sessionContext.state = 'GREETING';
      sendPrompt(greetingText, { max_output_tokens: 80 });
    } else {
      sendPrompt(greetingText, { max_output_tokens: 80 });
    }
    noResponseStage = 0;
    armNoResponseTimer();
  }

  function repromptLowSignal(attempt: number) {
    const msg =
      attempt <= 1
        ? "Sorry - I didn't catch that. Are you calling to book an appointment, or do you have a quick question?"
        : "I'm still having trouble hearing you. If you'd like, I can take a message for a callback - what's your name?";
    sendPrompt(msg, { max_output_tokens: 90 });
    noResponseStage = 0;
    armNoResponseTimer();
  }

    function sendPrompt(text: string, options?: { max_output_tokens?: number }) {
      if (!openaiWs || pendingAutoHangup) return;
      clearPendingResponseTimer();
      if (lastResponseId) {
        sendToOpenAI(openaiWs, { type: 'response.cancel' });
      }
      allowModelResponse = true;
      const safe = text.replace(/"/g, '\\"');
      if (fsmEnabled) {
        lastFsmPrompt = text;
      } else if (bookingStep !== 'idle') {
        lastBookingPrompt = text;
      // lastBookingPromptAt = Date.now();
      bookingPromptActive = true;
    }
    const maxTokens = options?.max_output_tokens ?? 120;
      sendToOpenAI(
        openaiWs,
        responseCreate(
          ['audio', 'text'],
          `Read the following sentence verbatim. Do not add, remove, or paraphrase any words: "${safe}"`,
        {
          temperature: 0,
          max_output_tokens: maxTokens,
          ...(fsmEnabled ? { tool_choice: 'none' } : {}),
        }
      )
    );
  }

  // function getRecentSpeechDurationMs() {
  //   if (lastUserSpeechDurationMs > 0) return lastUserSpeechDurationMs;
  //   if (
  //     lastUserSpeechStoppedAt > 0 &&
  //     lastUserSpeechStartedAt > 0 &&
  //     lastUserSpeechStoppedAt >= lastUserSpeechStartedAt
  //   ) {
  //     return lastUserSpeechStoppedAt - lastUserSpeechStartedAt;
  //   }
  //   return 0;
  // }

  function shouldIgnoreBookingTranscript(): boolean {
    // Disable client-side filtering of transcripts during booking.
    // Let the LLM (or FSM) decide if the input is useful.
    return false;
  }

  function syncIntakeToModel() {
    if (!openaiWs) return;
    sendToOpenAI(openaiWs, {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: `Current intake (authoritative, do not re-ask unless missing): ${JSON.stringify(intake)}`,
          },
        ],
      },
    });
  }

  function buildBookingSlotOptions(slots: string[], readableSlots: string[], timeZone: string): BookingSlotOption[] {
    return slots.map((iso, idx) => {
      const rawLabel = readableSlots[idx];
      const label =
        typeof rawLabel === 'string' && rawLabel.trim()
          ? rawLabel.trim()
          : formatSlotForPrompt(iso, timeZone);
      const timeLabel = normalizeTimeLabel(formatSlotTimeOnly(iso, timeZone));
      return { iso, label, timeLabel };
    });
  }

  async function holdBookingSlot(slot: BookingSlotOption, timeZone: string): Promise<boolean> {
    if (!ctx) return false;
    try {
      const result = await invokeTool(ctx, 'hold_slot', {
        slot: slot.iso,
        timezone: timeZone,
        hold_minutes: 5,
      });
      if (result?.ok) {
        slot.hold_id = result.hold_id;
        return true;
      }
      log('hold_slot rejected', { slot: slot.iso, result });
    } catch (err: any) {
      log('hold_slot failed', err?.message ?? String(err));
    }
    return false;
  }

  async function handleBookingTurn(text: string): Promise<boolean> {
    if (!ctx || !openaiWs) return false;

    // Ignore empty or likely echo/noise inputs to prevent accidental state machine advancement
    if (!text || text.length < 2 || isLikelyEcho(text, lastAssistantText)) {
      return false;
    }

    if (bookingStep === 'idle') {
      if (!hasBookingIntent(text)) return false;
      bookingSlots = [];
      pendingName = null;
      pendingZip = null;
      pendingSlot = null;
      lastBookingPrompt = null;
      bookingStep = 'ask_name';
      sendPrompt("Sure, what's your full name?");
      return true;
    }

    if (bookingStep === 'ask_name') {
      const name = extractNameValue(text);
      if (!name) {
        sendPrompt("Sorry, I didn't catch the name. What name should I use?");
        return true;
      }
      pendingName = name;
      bookingStep = 'confirm_name';
      sendPrompt(`Just to confirm, is the name ${name}?`);
      return true;
    }

    if (bookingStep === 'confirm_name') {
      if (isAffirmative(text)) {
        if (pendingName) {
          intake.name = pendingName;
          syncIntakeToModel();
        }
        bookingStep = 'ask_zip';
        sendPrompt("Thanks. What's your zip code?");
        return true;
      }
      if (isNegative(text)) {
        pendingName = null;
        bookingStep = 'ask_name';
        sendPrompt('No problem. What name should I use?');
        return true;
      }
      const fallbackName = pendingName || 'that name';
      sendPrompt(`Sorry, I just need a yes or no. Is the name ${fallbackName}?`);
      return true;
    }

    if (bookingStep === 'ask_zip') {
      const zip = extractZipValue(text);
      if (!zip) {
        sendPrompt("What's your 5-digit zip code?");
        return true;
      }
      pendingZip = zip;
      bookingStep = 'confirm_zip';
      sendPrompt(`Got it, that's ${zipToSpoken(zip)}, right?`);
      return true;
    }

    if (bookingStep === 'confirm_zip') {
      if (isAffirmative(text)) {
        if (pendingZip) {
          intake.zip = pendingZip;
          syncIntakeToModel();
        }
        bookingStep = 'ask_time';
        sendPrompt('What day and time would you prefer?');
        return true;
      }
      if (isNegative(text)) {
        pendingZip = null;
        bookingStep = 'ask_zip';
        sendPrompt('Okay, what is the correct zip code?');
        return true;
      }
      const fallbackZip = pendingZip ? zipToSpoken(pendingZip) : 'that zip code';
      sendPrompt(`Sorry, just a yes or no - is that ${fallbackZip}?`);
      return true;
    }

    if (bookingStep === 'ask_time') {
      if (!looksLikeTimeRequest(text)) {
        sendPrompt('What day and time would you prefer?');
        return true;
      }
      const tz = tenant?.timezone || 'UTC';
      const explicitTime = extractTimeNeedle(text);
      const ambiguousHour =
        !explicitTime && /\b(at|around|about|for)\s+\d{1,2}(?::\d{2})?\b/i.test(text);
      const hasExplicitTime = !!explicitTime || ambiguousHour;
      const hasDay = hasDayReference(text);
      if (hasExplicitTime && !hasDay) {
        sendPrompt('What day would you like to book that time for?');
        return true;
      }
      const dayQuery = hasExplicitTime ? stripTimeFromText(text) : text;
      const query = dayQuery || text;
      let result: any;
      try {
        result = await invokeTool(ctx, 'get_availability', {
          start_time: query,
          timezone: tz,
        });
      } catch (err: any) {
        log('get_availability failed (booking flow)', err?.message ?? String(err));
        sendPrompt("I couldn't check availability right now. What day or time works instead?");
        bookingStep = 'ask_time';
        return true;
      }
      const slots = Array.isArray(result?.slots) ? result.slots : [];
      const readable = Array.isArray(result?.readable_slots) ? result.readable_slots : [];
      if (!slots.length) {
        sendPrompt("I don't see openings around that time. What day or time works instead?");
        bookingStep = 'ask_time';
        return true;
      }
      bookingSlots = buildBookingSlotOptions(slots, readable, tz);
      const spokenAvailability =
        typeof result?.spoken_availability === 'string' ? result.spoken_availability.trim() : '';
      if (hasExplicitTime) {
        const match = pickSlotFromResponse(text, bookingSlots);
        if (match) {
          const held = await holdBookingSlot(match, tz);
          if (!held) {
            bookingSlots = bookingSlots.filter((slot) => slot.iso !== match.iso);
            if (bookingSlots.length) {
              const remaining = bookingSlots.map((slot) => slot.label).join(', ');
              const maxTokens = remaining.length > 180 ? 240 : 160;
              sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
                max_output_tokens: maxTokens,
              });
              bookingStep = 'offer_slots';
              return true;
            }
            sendPrompt('That time just got taken. What day or time works instead?');
            bookingStep = 'ask_time';
            return true;
          }
          pendingSlot = match;
          sendPrompt(`I can do ${match.label}. Want me to book that?`);
          bookingStep = 'confirm_time';
          return true;
        }
      }
      const maxSlotsToSpeak = 12;
      if (bookingSlots.length > maxSlotsToSpeak) {
        if (spokenAvailability) {
          sendPrompt(spokenAvailability);
          bookingStep = 'offer_slots';
          return true;
        }
        const first = bookingSlots[0];
        const last = bookingSlots[bookingSlots.length - 1];
        const startLabel = formatSlotTimeOnly(first.iso, tz);
        const endLabel = formatSlotTimeOnly(last.iso, tz);
        sendPrompt(`That day has wide availability from ${startLabel} to ${endLabel}. What time works best?`);
        bookingStep = 'offer_slots';
        return true;
      }
      const labels = bookingSlots.map((slot) => slot.label).join(', ');
      const maxTokens = labels.length > 180 ? 240 : 160;
      sendPrompt(`I have these times: ${labels}. Which works best?`, { max_output_tokens: maxTokens });
      bookingStep = 'offer_slots';
      return true;
    }

    if (bookingStep === 'confirm_time') {
      if (!pendingSlot) {
        bookingStep = 'ask_time';
        sendPrompt('What day and time would you prefer?');
        return true;
      }
      if (isAffirmative(text)) {
        const tz = tenant?.timezone || 'UTC';
        const customerName = pendingName || (typeof intake.name === 'string' ? intake.name : '') || 'Caller';
        try {
          if (pendingSlot && !pendingSlot.hold_id) {
            const held = await holdBookingSlot(pendingSlot, tz);
            if (!held) {
              pendingSlot = null;
              bookingStep = 'offer_slots';
              if (bookingSlots.length > 12) {
                const first = bookingSlots[0];
                const last = bookingSlots[bookingSlots.length - 1];
                const startLabel = formatSlotTimeOnly(first.iso, tz);
                const endLabel = formatSlotTimeOnly(last.iso, tz);
                sendPrompt(
                  `That time just got taken. I still have availability from ${startLabel} to ${endLabel}. What time works best?`
                );
              } else if (bookingSlots.length) {
                const remaining = bookingSlots.map((slot) => slot.label).join(', ');
                const maxTokens = remaining.length > 180 ? 240 : 160;
                sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
                  max_output_tokens: maxTokens,
                });
              } else {
                sendPrompt('That time just got taken. What day or time works instead?');
              }
              return true;
            }
          }
          const notes = buildBookingNotes(intake, intakeFieldOrder.length ? intakeFieldOrder : Object.keys(intake));
          await invokeTool(ctx, 'create_booking', {
            start_time: pendingSlot.iso,
            timezone: tz,
            customer_name: customerName,
            customer_email: intake.email,
            service_type: tenant?.service_type,
            details: intake,
            notes,
            confirmed: true,
          });
          appointmentCreated = true;
          intake.preferred_time = pendingSlot.label;
          syncIntakeToModel();
          sendPrompt(`You're booked for ${pendingSlot.label}. Is there anything else I can help with today?`);
          bookingStep = 'done';
          pendingSlot = null;
          return true;
        } catch (err: any) {
          log('create_booking failed (booking flow)', err?.message ?? String(err));
          pendingSlot = null;
          bookingStep = 'offer_slots';
          if (bookingSlots.length > 12) {
            const first = bookingSlots[0];
            const last = bookingSlots[bookingSlots.length - 1];
            const startLabel = formatSlotTimeOnly(first.iso, tz);
            const endLabel = formatSlotTimeOnly(last.iso, tz);
            sendPrompt(
              `That time just got taken. I still have availability from ${startLabel} to ${endLabel}. What time works best?`
            );
          } else {
            const remaining = bookingSlots.map((slot) => slot.label).join(', ');
            const maxTokens = remaining.length > 180 ? 240 : 160;
            sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
              max_output_tokens: maxTokens,
            });
          }
          return true;
        }
      }
      if (isNegative(text)) {
        pendingSlot = null;
        bookingStep = 'ask_time';
        sendPrompt('Okay. What day and time would you prefer instead?');
        return true;
      }
      sendPrompt('Just to confirm, should I book that time?');
      return true;
    }

    if (bookingStep === 'offer_slots') {
      const tz = tenant?.timezone || 'UTC';
      const chosen = pickSlotFromResponse(text, bookingSlots);
      if (chosen) {
        const customerName = pendingName || (typeof intake.name === 'string' ? intake.name : '') || 'Caller';
        try {
          const held = await holdBookingSlot(chosen, tz);
          if (!held) {
            bookingSlots = bookingSlots.filter((slot) => slot.iso !== chosen.iso);
            if (bookingSlots.length) {
              if (bookingSlots.length > 12) {
                const first = bookingSlots[0];
                const last = bookingSlots[bookingSlots.length - 1];
                const startLabel = formatSlotTimeOnly(first.iso, tz);
                const endLabel = formatSlotTimeOnly(last.iso, tz);
                sendPrompt(
                  `That time just got taken. I still have availability from ${startLabel} to ${endLabel}. What time works best?`
                );
              } else {
                const remaining = bookingSlots.map((slot) => slot.label).join(', ');
                const maxTokens = remaining.length > 180 ? 240 : 160;
                sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
                  max_output_tokens: maxTokens,
                });
              }
              bookingStep = 'offer_slots';
              return true;
            }
            bookingStep = 'ask_time';
            sendPrompt('That time just got taken. What day or time works instead?');
            return true;
          }
          const notes = buildBookingNotes(intake, intakeFieldOrder.length ? intakeFieldOrder : Object.keys(intake));
          await invokeTool(ctx, 'create_booking', {
            start_time: chosen.iso,
            timezone: tz,
            customer_name: customerName,
            customer_email: intake.email,
            service_type: tenant?.service_type,
            details: intake,
            notes,
            confirmed: true,
          });
          appointmentCreated = true;
          intake.preferred_time = chosen.label;
          syncIntakeToModel();
          sendPrompt(`You're booked for ${chosen.label}. Is there anything else I can help with today?`);
          bookingStep = 'done';
          return true;
        } catch (err: any) {
          log('create_booking failed (booking flow)', err?.message ?? String(err));
          bookingSlots = bookingSlots.filter((slot) => slot.iso !== chosen.iso);
          if (bookingSlots.length) {
            if (bookingSlots.length > 12) {
              const first = bookingSlots[0];
              const last = bookingSlots[bookingSlots.length - 1];
              const startLabel = formatSlotTimeOnly(first.iso, tz);
              const endLabel = formatSlotTimeOnly(last.iso, tz);
              sendPrompt(
                `That time just got taken. I still have availability from ${startLabel} to ${endLabel}. What time works best?`
              );
            } else {
              const remaining = bookingSlots.map((slot) => slot.label).join(', ');
              const maxTokens = remaining.length > 180 ? 240 : 160;
              sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
                max_output_tokens: maxTokens,
              });
            }
            bookingStep = 'offer_slots';
            return true;
          }
          bookingStep = 'ask_time';
          sendPrompt('That time just got taken. What day or time works instead?');
          return true;
        }
      }

      if (looksLikeTimeRequest(text)) {
        bookingStep = 'ask_time';
        return await handleBookingTurn(text);
      }

      sendPrompt('Which of those times would you like?');
      return true;
    }

    if (bookingStep === 'done') {
      if (isNegative(text)) {
        const summary = intake.preferred_time
          ? `Booked appointment for ${intake.preferred_time}.`
          : 'Booked an appointment.';
        try {
          await invokeTool(ctx, 'save_call', {
            summary,
            collected_info: intake,
          });
        } catch (err: any) {
          log('save_call failed (booking flow)', err?.message ?? String(err));
        }
        sendPrompt("Thanks for calling - if you need anything else, just give us a call back.");
        if (!pendingAutoHangup) {
          pendingAutoHangup = true;
          pendingHangupMarkName = `booking_done_${Date.now()}`;
        }
        scheduleForcedHangup('booking complete');
        bookingStep = 'idle';
        return true;
      }
      if (isAffirmative(text)) {
        bookingStep = 'idle';
        sendPrompt('Sure. How else can I help?');
        return true;
      }
      sendPrompt('Is there anything else I can help with today?');
      return true;
    }

    return false;
  }

    function resetFsmBookingContext() {
      bookingSlots = [];
      pendingName = null;
      pendingZip = null;
      pendingSlot = null;
      pendingEmail = null;
      pendingEmailPurpose = null;
      intakeFieldOrder = [];
      activeIntakeField = null;
      appointmentCreated = false;
      pendingPlanOffer = null;
      planInquiryComplete = false;
      lastPlanQueryKey = null;
      sessionContext.customerName = undefined;
      sessionContext.zipCode = undefined;
      sessionContext.proposedTime = undefined;
      sessionContext.serviceNeed = undefined;
    }

  function requiresServiceAreaCheck(): boolean {
    const policy = tenant?.service_template?.tool_policy;
    if (typeof policy?.require_zip_check === 'boolean') return policy.require_zip_check;
    const zips = tenant?.service_area_zipcodes;
    return Array.isArray(zips) && zips.length > 0;
  }

  async function answerWithKnowledge(question: string): Promise<boolean> {
    if (!ctx || !openaiWs) return false;
    sessionContext.state = 'ANSWERING';
    pendingAnswerFollowUp = true;
    let results: any[] = [];
    try {
      isProcessingTool = true;
      results = await invokeTool(ctx, 'knowledge_search', { query: question, top_k: 3 });
    } catch (err: any) {
      log('knowledge_search failed', err?.message ?? String(err));
      results = [];
    } finally {
      isProcessingTool = false;
    }
    if (!results.length) {
      sendPrompt("I don't have that information on hand, but I'll have the team follow up.");
      return true;
    }
    const snippets = results
      .map((item, idx) => {
        const title = item?.title || item?.type || `Info ${idx + 1}`;
        const text = String(item?.text || '').trim();
        return text ? `(${idx + 1}) ${title}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
    const instructions = `Use only the information below to answer in 1-2 sentences. Do not ask a question.\n\n${snippets}`;
    allowModelResponse = true;
    sendToOpenAI(
      openaiWs,
      responseCreate(['audio', 'text'], instructions, { temperature: 0.2, max_output_tokens: 200, tool_choice: 'none' })
    );
    return true;
  }

  async function ensureServiceArea(zip: string): Promise<boolean> {
    if (!ctx || !openaiWs) return false;
    if (!requiresServiceAreaCheck()) return true;
    try {
      isProcessingTool = true;
      const result = await invokeTool(ctx, 'check_service_area', { zip });
      const serviced =
        typeof result?.serviced === 'boolean'
          ? result.serviced
          : typeof result?.eligible === 'boolean'
            ? result.eligible
            : true;
      if (!serviced) {
        sendPrompt(result?.message || "Sorry, we don't service that area.");
        if (!pendingAutoHangup) {
          pendingAutoHangup = true;
          pendingHangupMarkName = `service_area_${Date.now()}`;
        }
        scheduleForcedHangup('service area not serviced');
        sessionContext.state = 'CLOSING';
        return false;
      }
      return true;
    } catch (err: any) {
      log('check_service_area failed (fsm)', err?.message ?? String(err));
      sendPrompt(
        "I'm having trouble checking the service area right now. I can take your details and have the team follow up."
      );
      return true;
    } finally {
      isProcessingTool = false;
    }
  }

    function initIntakePlan() {
      intakeFieldOrder = buildIntakeFieldOrder(tenant?.service_template, requiresServiceAreaCheck());
      activeIntakeField = null;
      pendingEmail = null;
      pendingEmailPurpose = null;
    }

    function getServiceFieldKey(): string | null {
      for (const field of intakeFieldOrder) {
        if (isServiceField(field)) return field;
      }
      return null;
    }

    function recordServiceNeed(value: string) {
      const trimmed = value.trim();
      if (!trimmed) return;
      const current = sessionContext.serviceNeed;
      if (!current || normalizeForEcho(current) !== normalizeForEcho(trimmed)) {
        planInquiryComplete = false;
        pendingPlanOffer = null;
        lastPlanQueryKey = null;
      }
      sessionContext.serviceNeed = trimmed;
      const key = getServiceFieldKey();
      if (key) {
        setFieldValue(key, trimmed);
        return;
      }
      intake.service_request_type = trimmed;
    }

    function summarizePlanText(raw: string): string | null {
      const cleaned = String(raw || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return null;
      const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
      if (sentence.length > 220) return `${sentence.slice(0, 220).trim()}...`;
      return sentence;
    }

    async function findPlanOffer(serviceNeed: string): Promise<string | null> {
      if (!ctx) return null;
      const query = [
        'subscription plan pricing',
        serviceNeed,
        tenant?.service_type ? formatServiceTypeLabel(tenant.service_type) : '',
      ]
        .filter(Boolean)
        .join(' ');
      let results: any[] = [];
      try {
        isProcessingTool = true;
        results = await invokeTool(ctx, 'knowledge_search', { query, top_k: 3 });
      } catch (err: any) {
        log('knowledge_search failed (plan lookup)', err?.message ?? String(err));
        results = [];
      } finally {
        isProcessingTool = false;
      }
      if (!Array.isArray(results) || !results.length) return null;
      const keyword = /\b(subscription|plan|membership|annual|monthly|per\s+year|per\s+month|\$\d+)/i;
      for (const item of results) {
        const text = String(item?.text || item?.title || '').trim();
        if (!text) continue;
        if (!keyword.test(text)) continue;
        const summary = summarizePlanText(text);
        if (summary) return summary;
      }
      return null;
    }

    async function maybeOfferPlan(serviceNeed: string): Promise<boolean> {
      const key = normalizeForEcho(serviceNeed);
      if (planInquiryComplete && key === lastPlanQueryKey) return false;
      lastPlanQueryKey = key;
      const offer = await findPlanOffer(serviceNeed);
      planInquiryComplete = true;
      if (!offer) return false;
      pendingPlanOffer = offer;
      sessionContext.state = 'ASK_PLAN';
      sendPrompt(`${offer} Would you like that subscription, or should we book a one-time service?`);
      return true;
    }

  function hasFieldValue(field: string): boolean {
    if (isPreferredTimeField(field)) {
      return typeof intake.preferred_time === 'string' && intake.preferred_time.trim().length > 0;
    }
    if (isNameField(field)) {
      return typeof intake.name === 'string' && intake.name.trim().length > 0;
    }
    if (isZipField(field)) {
      return typeof intake.zip === 'string' && intake.zip.trim().length > 0;
    }
    if (isEmailField(field)) {
      return typeof intake.email === 'string' && intake.email.trim().length > 0;
    }
    if (isAddressField(field)) {
      return typeof intake.address === 'string' && intake.address.trim().length > 0;
    }
    if (isPhoneField(field)) {
      return true;
    }
    const key = normalizeFieldKey(field);
    const value = intake[key];
    return value !== undefined && value !== null && String(value).trim().length > 0;
  }

  function setFieldValue(field: string, value: string) {
    const key = normalizeFieldKey(field);
    if (isNameField(field)) {
      intake.name = value.trim();
      return;
    }
    if (isZipField(field)) {
      intake.zip = value.trim();
      return;
    }
    if (isEmailField(field)) {
      intake.email = value.trim();
      return;
    }
    if (isAddressField(field)) {
      intake.address = value.trim();
      return;
    }
    if (isPhoneField(field)) {
      intake.phone = value.trim();
      return;
    }
    intake[key] = value.trim();
  }

  function nextMissingField(): string | null {
    if (!intakeFieldOrder.length) return null;
    for (const field of intakeFieldOrder) {
      if (!hasFieldValue(field)) return field;
    }
    return null;
  }

  function askForNextField() {
    const serviceLabel = formatServiceTypeLabel(tenant?.service_type);
    const serviceType = tenant?.service_type;
    const next = nextMissingField();
    if (!next) {
      sessionContext.state = 'ASK_TIME';
      sendPrompt('What day and time would you prefer?');
      return;
    }
    if (isPreferredTimeField(next)) {
      sessionContext.state = 'ASK_TIME';
      sendPrompt('What day and time would you prefer?');
      return;
    }
    activeIntakeField = next;
    sessionContext.state = 'COLLECTING';
    sendPrompt(fieldPrompt(next, serviceLabel, serviceType));
  }

  function buildBookingNotes(intakeData: Record<string, any>, fields: string[]): string | undefined {
    const ignored = new Set(['name', 'full_name', 'zip', 'zipcode', 'preferred_time', 'email', 'phone', 'phone_number']);
    const lines: string[] = [];
    for (const field of fields) {
      const key = normalizeFieldKey(field);
      if (ignored.has(key)) continue;
      let value: any;
      if (isAddressField(field)) {
        value = intakeData.address;
      } else if (isNameField(field)) {
        value = intakeData.name;
      } else if (isZipField(field)) {
        value = intakeData.zip;
      } else {
        value = intakeData[key];
      }
      if (value !== undefined && value !== null && String(value).trim().length > 0) {
        lines.push(`${titleizeField(field)}: ${String(value).trim()}`);
      }
    }
    return lines.length ? lines.join('\n') : undefined;
  }

  async function handleFsmTurn(text: string): Promise<boolean> {
    if (!ctx || !openaiWs) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    log('handleFsmTurn processing', { text: trimmed, state: sessionContext.state });

    const isGreeting = /^(hi|hello|hey)\b/i.test(trimmed) && trimmed.split(/\s+/).length <= 3;
    const bookingIntent = hasBookingIntent(trimmed);
    const questionIntent = looksLikeQuestion(trimmed);
    const requireZipCheck = requiresServiceAreaCheck();

    if (sessionContext.state === 'GREETING') {
      if (isGreeting) {
        sendPrompt('How can I help you today?');
        return true;
      }
      if (!isMeaningfulGreetingReply(trimmed)) {
        sendPrompt('How can I help you today?');
        return true;
      }
      if (questionIntent && !bookingIntent) {
        return await answerWithKnowledge(trimmed);
      }
      const serviceIntent = bookingIntent || looksLikeServiceRequest(trimmed);
      if (!serviceIntent) {
        sendPrompt('How can I help you today?');
        return true;
      }
      sessionContext.intent = 'booking';
      resetFsmBookingContext();
      initIntakePlan();

      const zip = extractZipValue(trimmed);
      if (zip) {
        pendingZip = zip;
        sessionContext.zipCode = zip;
        intake.zip = zip;
      }
      const name = extractNameValue(trimmed);
      if (name) {
        pendingName = name;
        sessionContext.customerName = name;
        intake.name = name;
      }
      const email = extractEmail(trimmed);
      if (email) {
        intake.email = email;
      }
      if (looksLikeAddress(trimmed)) {
        intake.address = trimmed;
      }
      syncIntakeToModel();

      if (requireZipCheck && intake.zip) {
        const serviced = await ensureServiceArea(intake.zip);
        if (!serviced) return true;
      }

      askForNextField();
      return true;
    }

    if (sessionContext.state === 'COLLECTING') {
      if (!activeIntakeField) {
        askForNextField();
        return true;
      }
      const fieldKey = activeIntakeField;
      if (isZipField(fieldKey)) {
        const zip = extractZipValue(trimmed);
        if (!zip) {
          sendPrompt("What's your 5-digit zip code?");
          return true;
        }
        setFieldValue(fieldKey, zip);
        pendingZip = zip;
        sessionContext.zipCode = zip;
        syncIntakeToModel();
        if (requiresServiceAreaCheck()) {
          const serviced = await ensureServiceArea(zip);
          if (!serviced) return true;
        }
        activeIntakeField = null;
        askForNextField();
        return true;
      }

      if (isNameField(fieldKey)) {
        const name = extractNameValue(trimmed) || trimmed;
        if (!name) {
          sendPrompt("Sorry, I didn't catch the name. What's your full name?");
          return true;
        }
        setFieldValue(fieldKey, name);
        pendingName = name;
        sessionContext.customerName = name;
        syncIntakeToModel();
        activeIntakeField = null;
        askForNextField();
        return true;
      }

      if (isEmailField(fieldKey)) {
        const email = extractEmail(trimmed);
        if (!email) {
          sendPrompt("Sorry, I didn't catch that email. Could you repeat it?");
          return true;
        }
        pendingEmail = email;
        pendingEmailPurpose = 'intake';
        sessionContext.state = 'CONFIRM_EMAIL';
        const spelled = spellEmailForConfirmation(email);
        sendPrompt(`I have ${spelled}. Is that right?`);
        return true;
      }

        if (isAddressField(fieldKey)) {
          if (!trimmed) {
            sendPrompt("What's the service address?");
            return true;
          }
          setFieldValue(fieldKey, trimmed);
        if (!intake.zip) {
          const embeddedZip = extractZipValue(trimmed);
          if (embeddedZip) {
            intake.zip = embeddedZip;
            sessionContext.zipCode = embeddedZip;
          }
        }
        syncIntakeToModel();
          activeIntakeField = null;
          askForNextField();
          return true;
        }

        if (isServiceField(fieldKey)) {
          if (!trimmed) {
            sendPrompt(fieldPrompt(fieldKey, formatServiceTypeLabel(tenant?.service_type), tenant?.service_type));
            return true;
          }
          recordServiceNeed(trimmed);
          syncIntakeToModel();
          activeIntakeField = null;
          if (await maybeOfferPlan(trimmed)) {
            return true;
          }
          askForNextField();
          return true;
        }

        if (!trimmed) {
          sendPrompt(fieldPrompt(fieldKey, formatServiceTypeLabel(tenant?.service_type), tenant?.service_type));
          return true;
        }
        setFieldValue(fieldKey, trimmed);
        syncIntakeToModel();
      activeIntakeField = null;
        askForNextField();
        return true;
      }

      if (sessionContext.state === 'ASK_PLAN') {
        const normalized = normalizeForEcho(trimmed);
        const choosesOneTime =
          isNegative(trimmed) ||
          /\bone[-\s]?time\b/.test(normalized) ||
          /\b(one\s+time|single\s+visit|one\s+off|just\s+once)\b/.test(normalized);
        const choosesPlan =
          isAffirmative(trimmed) ||
          /\b(subscription|plan|membership|annual|monthly)\b/.test(normalized);

        if (choosesPlan) {
          intake.plan_choice = pendingPlanOffer || 'subscription';
          pendingPlanOffer = null;
          sessionContext.state = 'COLLECTING';
          askForNextField();
          return true;
        }
        if (choosesOneTime) {
          intake.plan_choice = 'one-time';
          pendingPlanOffer = null;
          sessionContext.state = 'COLLECTING';
          askForNextField();
          return true;
        }
        if (questionIntent) {
          await answerWithKnowledge(trimmed);
        }
        sendPrompt('Would you like the subscription plan, or a one-time service?');
        return true;
      }

      if (sessionContext.state === 'ASK_EMAIL') {
        if (isNegative(trimmed) || /\b(no email|no e-?mail|dont have email|don't have email|no email address)\b/i.test(trimmed)) {
          pendingEmail = null;
          pendingEmailPurpose = null;
          sendPrompt("No problem. Your booking is confirmed. If you need changes, just call us.");
        sessionContext.state = 'FOLLOW_UP';
        return true;
      }
      const email = extractEmail(trimmed);
      if (!email) {
        sendPrompt("What's the best email to send your confirmation link to?");
        return true;
      }
      pendingEmail = email;
      pendingEmailPurpose = 'link';
      sessionContext.state = 'CONFIRM_EMAIL';
      const spelled = spellEmailForConfirmation(email);
      sendPrompt(`I have ${spelled}. Is that right?`);
      return true;
    }

    if (sessionContext.state === 'CONFIRM_EMAIL') {
      if (isAffirmative(trimmed)) {
        if (pendingEmail) {
          intake.email = pendingEmail;
          syncIntakeToModel();
        }
        const purpose = pendingEmailPurpose || (intake.preferred_time ? 'link' : 'intake');
        pendingEmail = null;
        pendingEmailPurpose = null;
        if (purpose === 'intake') {
          activeIntakeField = null;
          askForNextField();
          return true;
        }
        try {
          if (intake.email) {
            isProcessingTool = true;
            await invokeTool(ctx, 'send_booking_link', { email: intake.email });
          }
        } catch (err: any) {
          log('send_booking_link failed', err?.message ?? String(err));
        } finally {
          isProcessingTool = false;
        }
        sendPrompt('Great. Is there anything else I can help with today?');
        sessionContext.state = 'FOLLOW_UP';
        return true;
      }
      if (isNegative(trimmed)) {
        pendingEmail = null;
        if (pendingEmailPurpose === 'intake') {
          pendingEmailPurpose = null;
          sessionContext.state = 'COLLECTING';
          activeIntakeField = 'email';
          sendPrompt("Okay. What's the correct email?");
          return true;
        }
        pendingEmailPurpose = null;
        sessionContext.state = 'ASK_EMAIL';
        sendPrompt("Okay. What's the correct email?");
        return true;
      }
      sendPrompt('Sorry, just a yes or no. Is that email correct?');
      return true;
    }

      if (sessionContext.state === 'ASK_NAME') {
        // Check if we're collecting last name (pendingName already has first name)
        if (pendingName && pendingName.trim().split(/\s+/).length === 1) {
          // We already have first name, this is the last name response
          const lastName = extractNameValue(trimmed) || trimmed.trim();
          if (lastName) {
            const fullName = `${pendingName} ${lastName}`;
            pendingName = fullName;
            sessionContext.customerName = fullName;
            intake.name = fullName;
            syncIntakeToModel();
            askForNextField();
            return true;
          } else {
            sendPrompt("Sorry, I didn't catch that. What's your last name?");
            return true;
          }
        }

      const name = extractNameValue(trimmed);
      if (!name) {
        sendPrompt("Sorry, I didn't catch the name. What's your first and last name?");
        return true;
      }

      // Check if we have at least first and last name (2 words minimum)
      const nameParts = name.trim().split(/\s+/).filter(Boolean);
      if (nameParts.length < 2) {
        sendPrompt(`Thanks, ${name}. And what's your last name?`);
        // Store the first name temporarily and stay in ASK_NAME state
        pendingName = name;
        return true;
      }

        pendingName = name;
        sessionContext.customerName = name;
        intake.name = name;
        syncIntakeToModel();
        askForNextField();
        return true;
      }

      if (sessionContext.state === 'CONFIRM_NAME') {
        if (isAffirmative(trimmed)) {
          if (pendingName) {
            intake.name = pendingName;
            syncIntakeToModel();
          }
          askForNextField();
          return true;
        }
      if (isNegative(trimmed)) {
        pendingName = null;
        sessionContext.customerName = undefined;
        sessionContext.state = 'ASK_NAME';
        sendPrompt('No problem. What name should I use?');
        return true;
      }
      sendPrompt(`Sorry, I just need a yes or no. Is the name ${pendingName || 'that name'}?`);
      return true;
    }

      if (sessionContext.state === 'ASK_ZIP') {
        if (!requireZipCheck) {
          askForNextField();
          return true;
        }
        if (!/\d/.test(trimmed) && trimmed.length <= 3) {
          log('Ignoring non-zip short response while waiting for zip', { text: trimmed });
          sendPrompt("What's your 5-digit zip code?");
          return true;
        }
        const zip = extractZipValue(trimmed);
        if (!zip) {
          if (looksLikeAddress(trimmed)) {
            intake.address = trimmed;
            syncIntakeToModel();
          }
          sendPrompt("What's your 5-digit zip code?");
          return true;
        }
      pendingZip = zip;
      sessionContext.zipCode = zip;
      intake.zip = zip;
        syncIntakeToModel();
        const serviced = await ensureServiceArea(zip);
        if (!serviced) return true;
        askForNextField();
        return true;
      }

      if (sessionContext.state === 'CONFIRM_ZIP') {
        if (isAffirmative(trimmed)) {
          if (pendingZip) {
            intake.zip = pendingZip;
            syncIntakeToModel();
          }
          askForNextField();
          return true;
        }
      if (isNegative(trimmed)) {
        pendingZip = null;
        sessionContext.zipCode = undefined;
        sessionContext.state = 'ASK_ZIP';
        sendPrompt('Okay, what is the correct zip code?');
        return true;
      }
      sendPrompt(`Sorry, just a yes or no - is that ${pendingZip ? zipToSpoken(pendingZip) : 'that zip'}?`);
      return true;
    }

    if (sessionContext.state === 'ASK_TIME') {
      if (!looksLikeTimeRequest(trimmed)) {
        sendPrompt('What day and time would you prefer?');
        return true;
      }
      const tz = tenant?.timezone || 'UTC';
      const explicitTime = extractTimeNeedle(trimmed);
      const ambiguousHour =
        !explicitTime && /\b(at|around|about|for)\s+\d{1,2}(?::\d{2})?\b/i.test(trimmed);
      const hasExplicitTime = !!explicitTime || ambiguousHour;
      const hasDay = hasDayReference(trimmed);
      if (hasExplicitTime && !hasDay) {
        sendPrompt('What day would you like to book that time for?');
        return true;
      }
      const dayQuery = hasExplicitTime ? stripTimeFromText(trimmed) : trimmed;
      const query = dayQuery || trimmed;
      let result: any;
      try {
        isProcessingTool = true;
        sendPrompt('Let me check the schedule for you. One moment.');
        result = await invokeTool(ctx, 'get_availability', {
          start_time: query,
          timezone: tz,
        });
      } catch (err: any) {
        log('get_availability failed (fsm)', err?.message ?? String(err));
        sendPrompt("I couldn't check availability right now. What day or time works instead?");
        sessionContext.state = 'ASK_TIME';
        isProcessingTool = false;
        return true;
      } finally {
        isProcessingTool = false;
      }
      const slots = Array.isArray(result?.slots) ? result.slots : [];
      const readable = Array.isArray(result?.readable_slots) ? result.readable_slots : [];
      const spokenAvailability =
        typeof result?.spoken_availability === 'string' ? result.spoken_availability.trim() : '';
      const closedDay = result?.closed_day === true;
      if (!slots.length) {
        if (spokenAvailability) {
          sendPrompt(spokenAvailability);
        } else if (closedDay) {
          sendPrompt("We're closed that day. What day works instead?");
        } else {
          sendPrompt("I don't see openings around that time. What day or time works instead?");
        }
        sessionContext.state = 'ASK_TIME';
        return true;
      }
      bookingSlots = buildBookingSlotOptions(slots, readable, tz);
      if (hasExplicitTime) {
        const match = pickSlotFromResponse(trimmed, bookingSlots);
        if (match) {
          const held = await holdBookingSlot(match, tz);
          if (!held) {
            bookingSlots = bookingSlots.filter((slot) => slot.iso !== match.iso);
            if (bookingSlots.length) {
              const choices = formatSlotChoices(bookingSlots, 3);
              sendPrompt(`That time isn't open. I do have ${choices.join(', ')}. Which works best?`);
              sessionContext.state = 'OFFER_SLOTS';
              return true;
            }
            sendPrompt('That time just got taken. What day or time works instead?');
            sessionContext.state = 'ASK_TIME';
            return true;
          }
          pendingSlot = match;
          sessionContext.proposedTime = match.label;
          sessionContext.state = 'CONFIRM_BOOKING';
          sendPrompt(`I can do ${match.label}. Want me to book that?`);
          return true;
        }
        if (bookingSlots.length) {
          const choices = formatSlotChoices(bookingSlots, 3);
          const list = choices.join(', ');
          sendPrompt(`That time isn't open. I do have ${list}. Which works best?`);
          sessionContext.state = 'OFFER_SLOTS';
          return true;
        }
        if (spokenAvailability) {
          sendPrompt(spokenAvailability);
          sessionContext.state = 'ASK_TIME';
          return true;
        }
      }
      if (bookingSlots.length > 12) {
        const choices = formatSlotChoices(bookingSlots, 3);
        const list = choices.join(', ');
        sendPrompt(`I have ${list}. Which works best?`);
        sessionContext.state = 'OFFER_SLOTS';
        return true;
      }
      const labels = bookingSlots.map((slot) => slot.label).join(', ');
      const maxTokens = labels.length > 180 ? 240 : 160;
      sendPrompt(`I have these times: ${labels}. Which works best?`, { max_output_tokens: maxTokens });
      sessionContext.state = 'OFFER_SLOTS';
      return true;
    }

    if (sessionContext.state === 'OFFER_SLOTS') {
      const chosen = pickSlotFromResponse(trimmed, bookingSlots);
      if (chosen) {
        const tz = tenant?.timezone || 'UTC';
        const held = await holdBookingSlot(chosen, tz);
        if (!held) {
          bookingSlots = bookingSlots.filter((slot) => slot.iso !== chosen.iso);
          if (bookingSlots.length) {
            const choices = formatSlotChoices(bookingSlots, 3);
            sendPrompt(`That time just got taken. I do have ${choices.join(', ')}. Which works best?`);
            sessionContext.state = 'OFFER_SLOTS';
            return true;
          }
          sendPrompt('That time just got taken. What day or time works instead?');
          sessionContext.state = 'ASK_TIME';
          return true;
        }
        pendingSlot = chosen;
        sessionContext.proposedTime = chosen.label;
        sessionContext.state = 'CONFIRM_BOOKING';
        sendPrompt(`Great. Want me to book ${chosen.label}?`);
        return true;
      }
      if (looksLikeTimeRequest(trimmed)) {
        sessionContext.state = 'ASK_TIME';
        return await handleFsmTurn(trimmed);
      }
      sendPrompt('Which of those times would you like?');
      return true;
    }

    if (sessionContext.state === 'CONFIRM_BOOKING') {
      if (!pendingSlot) {
        sessionContext.state = 'ASK_TIME';
        sendPrompt('What day and time would you prefer?');
        return true;
      }
      if (isAffirmative(trimmed)) {
        const tz = tenant?.timezone || 'UTC';
        const customerName = pendingName || (typeof intake.name === 'string' ? intake.name : '') || 'Caller';
        try {
          isProcessingTool = true;
          sendPrompt('Great. Booking that now.');
          if (pendingSlot && !pendingSlot.hold_id) {
            const held = await holdBookingSlot(pendingSlot, tz);
            if (!held) {
              pendingSlot = null;
              sessionContext.state = 'OFFER_SLOTS';
              if (bookingSlots.length > 12) {
                sendPrompt('That time just got taken. What time works best instead?');
              } else if (bookingSlots.length) {
                const remaining = bookingSlots.map((slot) => slot.label).join(', ');
                const maxTokens = remaining.length > 180 ? 240 : 160;
                sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
                  max_output_tokens: maxTokens,
                });
              } else {
                sendPrompt('That time just got taken. What day or time works instead?');
                sessionContext.state = 'ASK_TIME';
              }
              return true;
            }
          }
          const notes = buildBookingNotes(intake, intakeFieldOrder.length ? intakeFieldOrder : Object.keys(intake));
          await invokeTool(ctx, 'create_booking', {
            start_time: pendingSlot.iso,
            timezone: tz,
            customer_name: customerName,
            customer_email: intake.email,
            service_type: tenant?.service_type,
            details: intake,
            notes,
            confirmed: true,
          });
          appointmentCreated = true;
          intake.preferred_time = pendingSlot.label;
          syncIntakeToModel();
          if (!intake.email) {
            sessionContext.state = 'ASK_EMAIL';
            sendPrompt(`You're booked for ${pendingSlot.label}. What email should I send your confirmation link to?`);
            pendingSlot = null;
            return true;
          }
          try {
            await invokeTool(ctx, 'send_booking_link', { email: intake.email });
          } catch (err: any) {
            log('send_booking_link failed', err?.message ?? String(err));
          }
          sendPrompt(`You're booked for ${pendingSlot.label}. I'll email you a confirmation link. Anything else I can help with?`);
          sessionContext.state = 'FOLLOW_UP';
          pendingSlot = null;
          return true;
        } catch (err: any) {
          log('create_booking failed (fsm)', err?.message ?? String(err));
          pendingSlot = null;
          sessionContext.state = 'OFFER_SLOTS';
          if (bookingSlots.length > 12) {
            sendPrompt('That time just got taken. What time works best instead?');
          } else {
            const remaining = bookingSlots.map((slot) => slot.label).join(', ');
            const maxTokens = remaining.length > 180 ? 240 : 160;
            sendPrompt(`That time just got taken. I still have ${remaining}. Which works best?`, {
              max_output_tokens: maxTokens,
            });
          }
          return true;
        } finally {
          isProcessingTool = false;
        }
      }
      if (isNegative(trimmed)) {
        pendingSlot = null;
        sessionContext.state = 'ASK_TIME';
        sendPrompt('Okay. What day and time would you prefer instead?');
        return true;
      }
      sendPrompt('Just to confirm, should I book that time?');
      return true;
    }

    if (sessionContext.state === 'ANSWERING') {
      if (bookingIntent) {
        sessionContext.intent = 'booking';
        resetFsmBookingContext();
        initIntakePlan();
        askForNextField();
        return true;
      }
      return await answerWithKnowledge(trimmed);
    }

    if (sessionContext.state === 'FOLLOW_UP') {
      if (isNegative(trimmed)) {
        const summary = intake.preferred_time
          ? `Booked appointment for ${intake.preferred_time}.`
          : 'Caller inquiry handled.';
        try {
          await invokeTool(ctx, 'save_call', { summary, collected_info: intake });
        } catch (err: any) {
          log('save_call failed (fsm)', err?.message ?? String(err));
        }
        sendPrompt('Thanks for calling - if you need anything else, just give us a call back.');
        if (!pendingAutoHangup) {
          pendingAutoHangup = true;
          pendingHangupMarkName = `fsm_done_${Date.now()}`;
        }
        scheduleForcedHangup('fsm complete');
        sessionContext.state = 'CLOSING';
        return true;
      }
      if (isAffirmative(trimmed)) {
        sessionContext.state = 'GREETING';
        sendPrompt('Sure. How else can I help?');
        return true;
      }
      if (bookingIntent) {
        sessionContext.intent = 'booking';
        resetFsmBookingContext();
        initIntakePlan();
        askForNextField();
        return true;
      }
      if (questionIntent) {
        return await answerWithKnowledge(trimmed);
      }
      sendPrompt('Is there anything else I can help with today?');
      return true;
    }

    if (sessionContext.state === 'CLOSING') {
      return true;
    }

    return false;
  }

  function armNoResponseTimer() {
    clearNoResponseTimer();
    const delayMs = noResponseStage === 0 ? 8000 : 7000;
    noResponseTimer = setTimeout(() => {
      noResponseTimer = null;
      if (!ctx || !openaiWs) return;
      // Don't interrupt if the assistant is actively speaking.
      if (Date.now() < assistantAudioActiveUntil) {
        armNoResponseTimer();
        return;
      }

      if (fsmEnabled && lastFsmPrompt) {
        if (noResponseStage === 0) {
          noResponseStage = 1;
          sendPrompt(lastFsmPrompt);
          armNoResponseTimer();
          return;
        }
        sendPrompt('No problem. Feel free to call back if you still need help.');
        if (!pendingAutoHangup) {
          pendingAutoHangup = true;
          pendingHangupMarkName = `no_response_${Date.now()}`;
        }
        scheduleForcedHangup('no response after two prompts');
        return;
      }
      if (!fsmEnabled && bookingStep !== 'idle' && lastBookingPrompt) {
        if (noResponseStage === 0) {
          noResponseStage = 1;
          sendPrompt(lastBookingPrompt);
          armNoResponseTimer();
          return;
        }
        // Second failure: say goodbye and end the call.
        sendPrompt('No problem. Feel free to call back if you still need help.');
        if (!pendingAutoHangup) {
          pendingAutoHangup = true;
          pendingHangupMarkName = `no_response_${Date.now()}`;
        }
        scheduleForcedHangup('no response after two prompts');
        return;
      }

        if (noResponseStage === 0) {
          noResponseStage = 1;
          if (fsmEnabled) {
            sendPrompt("Sorry, I didn't catch that. How can I help you today?");
          } else {
            allowModelResponse = true;
            sendToOpenAI(openaiWs, {
              type: 'response.create',
              response: {
                modalities: ['audio', 'text'],
                instructions:
                "Sorry, I didn't catch that. How can I help you today? Keep it to one short question.",
            },
          });
        }
        armNoResponseTimer();
        return;
      }

      // Second failure: say goodbye and end the call.
      if (!pendingAutoHangup) {
        pendingAutoHangup = true;
        pendingHangupMarkName = `no_response_${Date.now()}`;
      }
        scheduleForcedHangup('no response after two prompts');
        sendToOpenAI(openaiWs, { type: 'response.cancel' });
        allowModelResponse = true;
        sendToOpenAI(openaiWs, {
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
            instructions:
            'No response from the caller. Say ONE short friendly goodbye sentence and end the call. Do not ask another question.',
        },
      });
    }, delayMs);
  }

  function extractAssistantTextFromDone(msg: any): string {
    const textPieces: string[] = [];
    const output = msg?.response?.output;
    if (Array.isArray(output)) {
      for (const item of output) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
          if (typeof c?.text === 'string' && c.text.trim()) textPieces.push(c.text.trim());
        }
      }
    }
    return textPieces.join(' ').trim();
  }

  function dedupeAssistantText(text: string): string {
    const trimmed = (text || '').trim();
    if (!trimmed) return '';
    const collapsed = trimmed.replace(/\s+/g, ' ');
    const words = collapsed.split(' ');
    if (words.length >= 2 && words.length % 2 === 0) {
      const half = words.length / 2;
      const first = words.slice(0, half).join(' ');
      const second = words.slice(half).join(' ');
      if (first === second) return first;
    }
    const mid = Math.floor(collapsed.length / 2);
    if (collapsed.length >= 4 && collapsed.length % 2 === 0) {
      const first = collapsed.slice(0, mid).trim();
      const second = collapsed.slice(mid).trim();
      if (first && second && first === second) return first;
    }
    return collapsed;
  }

  async function performHangup(reason: string) {
    if (!ctx) return;
    if (pendingHangupTimer) {
      clearTimeout(pendingHangupTimer);
      pendingHangupTimer = null;
    }
    if (forcedHangupTimer) {
      clearTimeout(forcedHangupTimer);
      forcedHangupTimer = null;
    }
    pendingAutoHangup = false;
    pendingHangupMarkName = null;

    try {
      // Persist final call state (even if already saved) so duration/ended_at reflect the actual hangup time.
      try {
        const duration_seconds = ctx.startedAt ? Math.max(1, Math.ceil((Date.now() - ctx.startedAt) / 1000)) : undefined;
        await invokeTool(ctx, 'save_call', {
          transcript: mergedTranscriptText() || undefined,
          duration_seconds,
          collected_info: intake,
        });
        callSaved = true;
      } catch (e: any) {
        log('final save_call failed (non-fatal)', e?.message ?? String(e));
      }

      // Best-effort: if the recording callback didn't arrive, try to fetch a completed recording for this call.
      try {
        const accountSid =
          envFirst(['TWILIO_ACCOUNT_SID', 'TWILIO_SID']) || (await getSecret('TWILIO_ACCOUNT_SID'));
        const authToken = await getSecret('TWILIO_AUTH_TOKEN');
        const client = twilio(accountSid, authToken);
        const recordings = await client.recordings.list({ callSid: ctx.callSid, limit: 20 });
        const completed = recordings.find((r: any) => String(r?.status || '').toLowerCase() === 'completed');
        if (completed?.sid) {
          await invokeTool(ctx, 'save_recording', {
            recording_sid: completed.sid,
            duration_seconds:
              typeof completed.duration === 'string'
                ? Number.parseInt(completed.duration, 10)
                : undefined,
          });
        }
      } catch (e: any) {
        log('recording fallback failed (non-fatal)', e?.message ?? String(e));
      }

      log('Hanging up call', { reason });
      await invokeTool(ctx, 'end_call', { reason });
    } catch (e: any) {
      log('performHangup failed (non-fatal)', e?.message ?? String(e));
    }
  }

  function scheduleForcedHangup(reason: string) {
    if (!ctx) return;
    if (forcedHangupTimer) {
      log('Hangup already scheduled, ignoring new schedule request', { reason });
      return;
    }
    log('Scheduling forced hangup in 8 seconds', { reason, noResponseStage });
    forcedHangupTimer = setTimeout(() => {
      forcedHangupTimer = null;
      log('Executing forced hangup', { reason });
      void performHangup(`Forced hangup timeout: ${reason}`);
    }, 8000);
  }

  const handleTwilioMessage = async (data: RawData) => {
    let event: any;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (event?.event === 'start') {
      const streamSid = event?.start?.streamSid as string;
      const callSid = event?.start?.callSid as string;
      const custom = (event?.start?.customParameters ?? {}) as Record<string, string>;
      const to = custom.to || '';
      const from = custom.from || '';
      const token = custom.token || '';

      const expectedToken = process.env.TWILIO_MEDIA_STREAM_TOKEN || '';
      if (expectedToken && token !== expectedToken) {
        log('Rejecting media stream: invalid token');
        twilioWs.close();
        return;
      }

      if (!streamSid || !callSid || !to || !from) {
        log('Missing start metadata', { streamSid, callSid, to, from });
        twilioWs.close();
        return;
      }

      try {
        tenant = await resolveTenant(to);
      } catch (err: any) {
        log('resolveTenant failed', err?.message ?? String(err));
        twilioWs.close();
        return;
      }
      const startedAt = Date.now();
      ctx = {
        callSid,
        streamSid,
        from,
        to,
        company_id: tenant.company_id,
        startedAt,
        transfer_enabled: tenant.transfer_enabled ?? false,
        transfer_number: tenant.transfer_number ?? '',
      };
      log('Media stream started', { to, from, company_id: tenant.company_id });
      intake.phone = from;
      intake.phone_number = from;

      if (!twilioStreamReady) {
        twilioStreamReady = true;
        tryInitialGreeting();
      }

      activeCalls.set(callSid, {
        company_id: tenant.company_id,
        from,
        to,
        startedAt,
        service_area_zipcodes: tenant.service_area_zipcodes
      });

      void startTwilioRecording(callSid);

      const model =
        tenant?.agent_config?.realtime_model ||
        envFirst(['OPENAI_REALTIME_MODEL', 'REALTIME_MODEL']) ||
        'gpt-realtime-mini';
      const voice =
        tenant?.agent_config?.realtime_voice ||
        envFirst(['OPENAI_REALTIME_VOICE', 'REALTIME_VOICE']) ||
        'nova';
      const instructions = buildInstructions({
        company_name: tenant.company_name,
        service_type: tenant.service_type,
        timezone: tenant.timezone,
        service_template: tenant.service_template,
        extra: tenant?.agent_config?.realtime_instructions,
      });

      const openaiKey = await getSecret('OPENAI_API_KEY');
      const openaiUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
      openaiWs = new WebSocket(openaiUrl, {
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      openaiWs.on('open', async () => {
        if (!ctx || !openaiWs) return;

        sendToOpenAI(openaiWs, {
          type: 'session.update',
          session: {
            voice,
            instructions,
            tools: toolsSchema(),
            tool_choice: 'auto',
            input_audio_format: 'g711_ulaw',
            output_audio_format: 'g711_ulaw',
            input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
            // Lower silence threshold reduces perceived latency between user stop -> assistant start.
            // Too low can cause interruptions; tune if you notice cutoffs.
            turn_detection: {
              type: 'semantic_vad',
              create_response: true,
              interrupt_response: true,
            },
          },
        });
        openaiOutputAudioFormat = 'g711_ulaw';

        // Create lead/call record in the background (so greeting isn't delayed).
        invokeTool(ctx, 'create_lead', { collected_info: {} }).catch((e: any) =>
          log('create_lead failed (non-fatal)', e?.message ?? String(e))
        );

        // Recording is started earlier on stream start (best-effort).
      });

      openaiWs.on('message', async (raw) => {
        if (!ctx || !openaiWs) return;
        let msg: any;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg?.type === 'session.created') {
          log('OpenAI session created', { id: msg?.session?.id });
        }

        if (msg?.type === 'session.updated') {
          const fmt = msg?.session?.output_audio_format;
          if (typeof fmt === 'string' && fmt) openaiOutputAudioFormat = fmt;
          log('OpenAI session updated', { output_audio_format: openaiOutputAudioFormat });

          openaiSessionReady = true;
          tryInitialGreeting();
        }

        const responseEvent = typeof msg?.type === 'string' && msg.type.startsWith('response.');
        if (responseEvent && !allowModelResponse) {
          if (msg.type === 'response.created') {
            log('Blocking unsolicited model response');
            sendToOpenAI(openaiWs, { type: 'response.cancel' });
          }
          return;
        }

        // Barge-in: cancel assistant output when user starts talking.
        // Debounced to avoid background noise triggering constant interruptions.
        if (msg?.type === 'input_audio_buffer.speech_started') {
          userSpeechActive = true;
          lastUserSpeechStartedAt = Date.now();
          // lastUserSpeechDurationMs = 0;
          clearNoResponseTimer();
          clearPendingResponseTimer();
          // Barge-in: clear any buffered audio on the Twilio side and stop queued audio
          outboundAudioQueue = [];
          outboundNextSendAt = 0;
          if (outboundAudioTimer) {
            clearTimeout(outboundAudioTimer);
            outboundAudioTimer = null;
          }
          if (ctx?.streamSid) {
            sendToTwilio(twilioWs, { event: 'clear', streamSid: ctx.streamSid });
          }
        }

        if (msg?.type === 'input_audio_buffer.speech_stopped') {
          userSpeechActive = false;
          lastUserSpeechStoppedAt = Date.now();
          if (lastUserSpeechStartedAt > 0) {
            lastUserSpeechDurationMs = Math.max(0, lastUserSpeechStoppedAt - lastUserSpeechStartedAt);
          }
          if (pendingResponseAfterSpeech && !pendingAutoHangup) {
            pendingResponseAfterSpeech = false;
            scheduleAssistantResponse();
          }
        }

        if (msg?.type === 'response.audio.delta' && typeof msg?.delta === 'string') {
          const now = Date.now();
          assistantAudioActiveUntil = now + 350;
          const asPcm16 = shouldTreatDeltaAsPcm16(msg.delta);
          const bytes = asPcm16 ? decodeBase64Safe(msg.delta) : null;
          const payload = asPcm16 && bytes ? pcm16BytesToG711UlawBase64Adaptive(bytes) : msg.delta;

          if (audioDeltaDebugCount < 3) {
            audioDeltaDebugCount++;
            log('audio.delta', {
              output_audio_format: openaiOutputAudioFormat,
              raw_bytes: decodeBase64Safe(msg.delta)?.length,
              converted: asPcm16,
              payload_bytes: decodeBase64Safe(payload)?.length,
            });
          }
          enqueueTwilioAudio(payload);
        }

        if (
          (msg?.type === 'response.output_text.delta' || msg?.type === 'response.text.delta') &&
          (typeof msg?.delta === 'string' || typeof msg?.text === 'string')
        ) {
          pendingAssistantHeuristicText += (msg.delta ?? msg.text) as string;
          const recent = pendingAssistantHeuristicText.slice(-250).toLowerCase();
          if (
            recent.includes('anything else i can help') ||
            recent.includes('anything else i can do') ||
            recent.includes('anything else') ||
            recent.includes('any other question') ||
            recent.includes('anything more')
          ) {
            lastAssistantAskedAnythingElseAt = Date.now();
          }
        }

        // Prefer capturing what the assistant actually said (audio transcript) so the call log includes both sides.
        const isAudioTranscriptDelta = msg?.type === 'response.audio_transcript.delta';
        const isOutputAudioTranscriptDelta = msg?.type === 'response.output_audio_transcript.delta';
        if (
          (isAudioTranscriptDelta || isOutputAudioTranscriptDelta) &&
          (typeof msg?.delta === 'string' || typeof msg?.text === 'string')
        ) {
          const source = isOutputAudioTranscriptDelta ? 'output_audio' : 'audio';
          if (!assistantTranscriptSource) assistantTranscriptSource = source;
          if (assistantTranscriptSource === source) {
            pendingAssistantText += (msg.delta ?? msg.text) as string;
          }
        }

        const isAudioTranscriptDone = msg?.type === 'response.audio_transcript.done';
        const isOutputAudioTranscriptDone = msg?.type === 'response.output_audio_transcript.done';
        if (
          (isAudioTranscriptDone || isOutputAudioTranscriptDone) &&
          typeof (msg?.transcript ?? msg?.text) === 'string'
        ) {
          const source = isOutputAudioTranscriptDone ? 'output_audio' : 'audio';
          if (!assistantTranscriptSource) assistantTranscriptSource = source;
          if (assistantTranscriptSource === source) {
            const t = (msg.transcript ?? msg.text).trim();
            if (t) pendingAssistantText = `${pendingAssistantText}${pendingAssistantText ? ' ' : ''}${t}`;
          }
        }

        if (msg?.type === 'conversation.item.input_audio_transcription.completed') {
          const t = msg?.transcript;
          if (typeof t === 'string' && t.trim()) {
            clearNoResponseTimer();
            lastUserTranscriptAt = Date.now();
            const text = t.trim();
            if (isLowSignalTranscript(text)) {
              lowSignalCount = Math.min(lowSignalCount + 1, 2);
              log('Low-signal transcript gate', { text });
              repromptLowSignal(lowSignalCount);
              return;
            }
            lowSignalCount = 0;
            const normalizedText = text.toLowerCase();
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const speechDurationMs =
              lastUserSpeechDurationMs > 0
                ? lastUserSpeechDurationMs
                : lastUserSpeechStoppedAt && lastUserSpeechStartedAt
                  ? Math.max(0, lastUserSpeechStoppedAt - lastUserSpeechStartedAt)
                  : 0;
            if (isProcessingTool && !isExplicitBargeIn(text)) {
              // DISABLED: filtering filler utterance while tool in flight often drops the actual answer if it starts with "uh" or "well"
              // if (isFillerUtterance(text)) {
              //   log('Ignoring filler while tool in flight', { text });
              //   armNoResponseTimer();
              //   return;
              // }
            }
            if (normalizedText === lastCallerText && Date.now() - lastCallerAt < 1500) {
              log('Skipping duplicate transcript', { text });
              return;
            }
            const assistantSnapshot =
              pendingAssistantText.trim() || pendingAssistantHeuristicText.trim() || lastAssistantText;
            const msSinceAssistant = Date.now() - lastAssistantAt;
            const assistantRecentlySpoke = Date.now() < assistantAudioActiveUntil + 500;
            const isEcho =
              assistantSnapshot &&
              (assistantRecentlySpoke || msSinceAssistant < 5000) &&
              isLikelyEcho(text, assistantSnapshot);
            if (isEcho) {
              log('Ignoring echo transcript', { text });
              armNoResponseTimer();
              return;
            }
              const shortNoise =
                speechDurationMs > 0 &&
                speechDurationMs < 320 &&
                wordCount <= 2 &&
                !/\d/.test(text) &&
                !isAffirmative(text) &&
                !isNegative(text);
              if (shortNoise) {
                log('Ignoring very short speech/noise', { text, speechDurationMs });
                armNoResponseTimer();
                return;
              }
              const recentSpeechStart = lastUserSpeechStartedAt > 0 && Date.now() - lastUserSpeechStartedAt < 4000;
              const noSpeechMarker =
                !recentSpeechStart &&
                speechDurationMs === 0 &&
                wordCount <= 2 &&
                !/\d/.test(text);
              if (noSpeechMarker) {
                log('Ignoring transcript without speech markers', { text });
                armNoResponseTimer();
                return;
              }
              if (assistantRecentlySpoke && wordCount <= 2 && !/\d/.test(text) && !isAffirmative(text) && !isNegative(text)) {
                log('Ignoring short transcript near assistant speech', { text });
                armNoResponseTimer();
                return;
              }
              const lastPrompt =
                (fsmEnabled ? lastFsmPrompt : lastBookingPrompt) || assistantSnapshot || lastAssistantText;
              const shortYesNo =
                wordCount <= 2 && !/\d/.test(text) && (isAffirmative(text) || isNegative(text));
              if (shortYesNo && lastPrompt && !isYesNoPrompt(lastPrompt)) {
                log('Ignoring short yes/no without yes/no prompt', { text, lastPrompt });
                armNoResponseTimer();
                return;
              }
              if (assistantRecentlySpoke && !recentSpeechStart) {
                log('Ignoring transcript without speech start', { text });
                armNoResponseTimer();
                return;
              }
            if (Date.now() < assistantAudioActiveUntil && !isFillerUtterance(text)) {
              sendToOpenAI(openaiWs, { type: 'response.cancel' });
              sendToTwilio(twilioWs, { event: 'clear', streamSid: ctx.streamSid });
              assistantAudioActiveUntil = 0;
            }
            if (!fsmEnabled && bookingStep !== 'idle' && shouldIgnoreBookingTranscript()) {
              log('Ignoring short booking response', { text, bookingStep });
              armNoResponseTimer();
              return;
            }
            lastCallerText = normalizedText;
            lastCallerAt = Date.now();
            conversation.push({ role: 'caller', text });
            pendingUserTranscript = pendingUserTranscript
              ? `${pendingUserTranscript} ${text}`
              : text;
            if (!fsmEnabled) {
              let handledBooking = false;
              if (bookingStep !== 'idle') {
                handledBooking = await handleBookingTurn(text);
              }
              if (handledBooking) {
                noResponseStage = 0;
                pendingUserTranscript = '';
                return;
              }
            }
            const inlinePatch = extractInlineIntake(lastAssistantText, text);
            if (Object.keys(inlinePatch).length) {
              intake = { ...intake, ...inlinePatch };
              if (openaiWs) {
                sendToOpenAI(openaiWs, {
                  type: 'conversation.item.create',
                  item: {
                    type: 'message',
                    role: 'system',
                    content: [
                      {
                        type: 'input_text',
                        text: `Current intake (authoritative, do not re-ask unless missing): ${JSON.stringify(intake)}`,
                      },
                    ],
                  },
                });
              }
            }
            if (isLikelyNonAnswer() && !Object.keys(inlinePatch).length) {
              const sinceQuestionMs = lastAssistantQuestionAt ? Date.now() - lastAssistantQuestionAt : null;
              log('Ignoring non-answer transcript', { text, sinceQuestionMs });
              if (!pendingAutoHangup) armNoResponseTimer();
              return;
            }
            // Any user response resets the no-response sequence.
            noResponseStage = 0;
          }

          // Fallback end-of-call: if we recently asked "anything else", and the user says "no", hang up.
          if (!fsmEnabled && lastAssistantAskedAnythingElseAt && Date.now() - lastAssistantAskedAnythingElseAt < 20000) {
            const normalized = t.trim().toLowerCase();
            const isNo =
              normalized === 'no' ||
              normalized === 'nope' ||
              normalized === 'nah' ||
              normalized === 'im good' ||
              normalized === "i'm good" ||
              normalized.includes('no that') ||
              normalized.includes("that's all") ||
              normalized.includes("that's it") ||
              normalized.includes('that is it') ||
              normalized.includes('that is all') ||
              normalized.includes('nothing else') ||
              normalized.includes('no i') ||
              normalized.includes('no thank');
            if (isNo) {
              if (!pendingAutoHangup) {
                pendingAutoHangup = true;
                pendingHangupMarkName = `goodbye_${Date.now()}`;
                log('Auto-hangup triggered; generating goodbye', { mark: pendingHangupMarkName });
                scheduleForcedHangup('caller said no (anything else)');
                // Cancel any in-flight response and force a short goodbye before ending.
                sendToOpenAI(openaiWs, { type: 'response.cancel' });
                allowModelResponse = true;
                sendToOpenAI(openaiWs, {
                  type: 'response.create',
                  response: {
                    modalities: ['audio', 'text'],
                    instructions:
                      'The caller said that is all. Say ONE short friendly goodbye sentence (thank them and invite them to call back if needed). Do not ask another question.',
                  },
                });
              }
            }
          }

          // Only generate a response after we have an actual transcription.
          // Trigger IMMEDIATELY without delay for snappy feel, unless speech is currently active.
          if (typeof t === 'string' && t.trim() && openaiWs && !pendingAutoHangup) {
            if (userSpeechActive) {
              pendingResponseAfterSpeech = true;
            } else {
              // Execute turn logic immediately (deterministic response)
              const bufferedText = pendingUserTranscript.trim();
              if (bufferedText) {
                // Immediate execution
                (async () => {
                  if (fsmEnabled) {
                    try {
                      const handled = await handleFsmTurn(bufferedText);
                      pendingUserTranscript = '';
                      if (handled) {
                        noResponseStage = 0;
                        return;
                      }
                      // If not handled, fall through? FSM should handle everything or return false.
                      // Use a generic fallback if FSM returned false (shouldn't happen if properly covered).
                      sendPrompt("Sorry, I didn't catch that. Could you repeat?");
                    } catch (err: any) {
                      log('handleFsmTurn immediate failed', err?.message);
                      sendPrompt("Sorry, I had a glitch. One more time?");
                    }
                  } else if (bookingStep !== 'idle') {
                    // Legacy booking flow
                    try {
                      const handled = await handleBookingTurn(bufferedText);
                      if (handled) {
                        noResponseStage = 0;
                        pendingUserTranscript = '';
                        return;
                      }
                    } catch (e) { }
                  }

                    // Fallback / Default conversation
                    if (pendingUserTranscript) { // if not consumed
                      pendingUserTranscript = '';
                      allowModelResponse = true;
                      sendToOpenAI(openaiWs!, responseCreate());
                    }
                })();
              }
            }
          } else if (!pendingAutoHangup) {
            // Silence/incomprehensible: (re)arm the no-response timer.
            armNoResponseTimer();
          }
        }

        if (msg?.type === 'response.function_call_arguments.done') {
          const toolName = msg?.name;
          const toolCallId = msg?.call_id;
          const rawArgs = msg?.arguments ?? '{}';

          let args: any = {};
          try {
            args = JSON.parse(rawArgs);
          } catch {
            args = {};
          }

          try {
            isProcessingTool = true;
            if (toolName === 'transfer_call') {
              const result = await invokeTool(ctx, toolName, args);
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: toolCallId, output: JSON.stringify(result) },
              });
              isProcessingTool = false;
              allowModelResponse = false;
              return;
            }
            if (toolName === 'get_availability' || toolName === 'create_booking') {
              const calendarBlocked = tenant?.calendar_setup_completed === false;
              const scheduleBlocked = tenant?.schedule_setup_completed === false;
              if (calendarBlocked || scheduleBlocked) {
                sendToOpenAI(openaiWs, {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: toolCallId,
                    output: JSON.stringify({
                      ok: false,
                      error: 'Scheduling is not fully configured for this account.',
                    }),
                  },
                });
                isProcessingTool = false;
                allowModelResponse = true;
                sendToOpenAI(
                  openaiWs,
                  responseCreate(
                    ['audio', 'text'],
                    'Our scheduling calendar is not fully set up yet. Apologize briefly and offer to take details so the team can follow up.'
                  )
                );
                return;
              }
              if (tenant?.timezone && (!args?.timezone || typeof args.timezone !== 'string')) {
                args = { ...args, timezone: tenant.timezone };
              }
            }

            if (toolName === 'update_intake') {
              if (bookingStep !== 'idle') {
                sendToOpenAI(openaiWs, {
                  type: 'conversation.item.create',
                  item: { type: 'function_call_output', call_id: toolCallId, output: JSON.stringify({ ok: true }) },
                });
                isProcessingTool = false;
                return;
              }
              const patch = args?.intake ?? args ?? {};
              if (patch && typeof patch === 'object') {
                intake = { ...intake, ...patch };
              }
              const recentAssistantPrompt = (pendingAssistantText.trim() || pendingAssistantHeuristicText.trim()).slice(0, 240);
              const assistantAskedQuestion = recentAssistantPrompt.includes('?');
              // Tell the model what we have so it stops asking twice.
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'system',
                  content: [
                    {
                      type: 'input_text',
                      text: `Current intake (authoritative, do not re-ask unless missing): ${JSON.stringify(intake)}`,
                    },
                  ],
                },
              });
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: toolCallId, output: JSON.stringify({ ok: true, intake }) },
              });
              isProcessingTool = false;
              const patchKeys = patch && typeof patch === 'object' ? Object.keys(patch) : [];
              if (patchKeys.length === 0) {
                return;
              }
                if (!assistantAskedQuestion) {
                  allowModelResponse = true;
                  sendToOpenAI(openaiWs, responseCreate());
                }
                return;
              }

            if (toolName === 'end_call') {
              // Don't hang up immediately inside the tool call (it can cut off the final audio).
              // Acknowledge the tool, then hang up after the response audio finishes (response.done -> mark/timer).
              if (!pendingAutoHangup) {
                pendingAutoHangup = true;
                pendingHangupMarkName = `model_end_${Date.now()}`;
              }
              scheduleForcedHangup('model requested end_call');
              log('Model requested end_call; deferring until response finishes', { mark: pendingHangupMarkName });
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: toolCallId,
                  output: JSON.stringify({ ok: true }),
                },
                });
                isProcessingTool = false;
                allowModelResponse = true;
                sendToOpenAI(openaiWs, responseCreate());
                return;
              }

            if (toolName === 'create_booking') {
              const currentName =
                (typeof intake?.name === 'string' && intake.name.trim()) ||
                [intake?.first_name, intake?.last_name].filter(Boolean).join(' ').trim();
              if (currentName && (!args?.customer_name || !String(args.customer_name).trim())) {
                args = { ...args, customer_name: currentName };
              }
            }

            if (toolName === 'send_booking_link' && fsmEnabled && !appointmentCreated) {
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: toolCallId,
                  output: JSON.stringify({ ok: false, error: 'Booking link can only be sent after booking is confirmed.' }),
                },
              });
              isProcessingTool = false;
              sendPrompt('I can send the confirmation link after we finish booking.');
              return;
            }

            const toolArgs =
              toolName === 'save_call'
                ? {
                  ...args,
                  transcript:
                    typeof args?.transcript === 'string' && args.transcript.trim()
                      ? args.transcript
                      : mergedTranscriptText() || undefined,
                  duration_seconds:
                    typeof args?.duration_seconds === 'number'
                      ? args.duration_seconds
                      : ctx.startedAt
                        ? Math.max(1, Math.ceil((Date.now() - ctx.startedAt) / 1000))
                        : undefined,
                  collected_info:
                    args?.collected_info && typeof args.collected_info === 'object'
                      ? args.collected_info
                      : intake,
                }
                : args;

            const result = await invokeTool(ctx, toolName, toolArgs);
            if (toolName === 'get_availability') {
              const count = Array.isArray((result as any)?.slots) ? result.slots.length : 0;
              lastAvailabilitySlots = Array.isArray((result as any)?.slots) ? result.slots : [];
              lastAvailabilityTimezone = typeof args?.timezone === 'string' ? args.timezone : null;
              log('get_availability result', {
                start_time: args?.start_time,
                end_time: args?.end_time,
                timezone: args?.timezone,
                slots: count,
              });
            }
            if (toolName === 'create_booking') {
              log('create_booking result', {
                start_time: args?.start_time,
                end_time: args?.end_time,
                timezone: args?.timezone,
                ok: (result as any)?.ok,
                appointment_id: (result as any)?.appointment_id,
              });
              if ((result as any)?.ok) {
                appointmentCreated = true;
              }
            }
            if (toolName === 'save_call') {
              callSaved = true;
              log('save_call succeeded', { transcript_len: (toolArgs?.transcript || '').length });

              if (!pendingAutoHangup) {
                pendingAutoHangup = true;
                pendingHangupMarkName = `save_call_${Date.now()}`;
              }
              scheduleForcedHangup('save_call completed');

              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: { type: 'function_call_output', call_id: toolCallId, output: JSON.stringify(result) },
                });
                isProcessingTool = false;
                allowModelResponse = true;
                sendToOpenAI(openaiWs, {
                  type: 'response.create',
                  response: {
                    modalities: ['audio', 'text'],
                    instructions:
                    'Say ONE short friendly goodbye sentence (thank them and invite them to call back if needed). Do not mention saving. Do not ask another question.',
                },
              });
              return;
            }
            sendToOpenAI(openaiWs, {
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: toolCallId, output: JSON.stringify(result) },
            });
            if (toolName === 'get_availability') {
              isProcessingTool = false;
              const slots = Array.isArray((result as any)?.slots) ? result.slots : [];
              const spokenAvailability =
                typeof (result as any)?.spoken_availability === 'string' ? (result as any).spoken_availability.trim() : '';
              if (slots.length) {
                const tz =
                  (typeof (result as any)?.timezone === 'string' && (result as any).timezone) ||
                  (typeof args?.timezone === 'string' ? args.timezone : '') ||
                  tenant?.timezone ||
                  'UTC';
                  if (spokenAvailability) {
                    allowModelResponse = true;
                    sendToOpenAI(
                      openaiWs,
                      responseCreate(['audio', 'text'], spokenAvailability)
                    );
                  } else {
                    const readableSlots = Array.isArray((result as any)?.readable_slots)
                      ? (result as any).readable_slots
                      : slots.map((slot: string) => formatSlotForPrompt(slot, tz));
                    allowModelResponse = true;
                    sendToOpenAI(
                      openaiWs,
                      responseCreate(
                        ['audio', 'text'],
                        `Offer only these available times in ${tz} (no other times): ${readableSlots.join(
                          ', '
                      )}. Ask which one they want. Do not confirm a time until they choose one.`
                    )
                  );
                }
                } else {
                  allowModelResponse = true;
                  sendToOpenAI(
                    openaiWs,
                    responseCreate(
                      ['audio', 'text'],
                      'There are no openings in that window. Ask for another day or a different time range.'
                    )
                  );
                }
                return;
              }
              isProcessingTool = false;
              allowModelResponse = true;
              sendToOpenAI(openaiWs, responseCreate());
            isProcessingTool = false;
          } catch (err: any) {
            // Keep the caller experience smooth: save_call failures should never be spoken back to the caller.
            // We'll retry on stop/hangup as best-effort.
            if (toolName === 'save_call') {
              log('save_call failed (non-fatal)', err?.message ?? String(err));
              if (!pendingAutoHangup) {
                pendingAutoHangup = true;
                pendingHangupMarkName = `save_call_${Date.now()}`;
              }
              scheduleForcedHangup('save_call failed');
              sendToOpenAI(openaiWs, {
                type: 'conversation.item.create',
                item: {
                  type: 'function_call_output',
                  call_id: toolCallId,
                  output: JSON.stringify({ ok: true }),
                },
              });
              isProcessingTool = false;
              sendToOpenAI(openaiWs, {
                type: 'response.create',
                response: {
                  modalities: ['audio', 'text'],
                  instructions:
                    'Say ONE short friendly goodbye sentence (thank them and invite them to call back if needed). Do not mention saving. Do not ask another question.',
                },
              });
              return;
            }
            if (toolName === 'get_availability' || toolName === 'create_booking') {
              log(`${toolName} failed`, { error: err?.message ?? String(err), args });
            }
            const requestedStart = typeof args?.start_time === 'string' ? args.start_time : '';
            const filteredSlots = lastAvailabilitySlots.filter((s) => s !== requestedStart);
            sendToOpenAI(openaiWs, {
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: toolCallId,
                output: JSON.stringify({
                  ok: false,
                  error: err?.message ?? String(err),
                  slots: toolName === 'create_booking' ? filteredSlots : undefined,
                  timezone: toolName === 'create_booking' ? lastAvailabilityTimezone : undefined,
                }),
              },
            });
            if (toolName === 'create_booking' && filteredSlots.length) {
              const tz = lastAvailabilityTimezone || tenant?.timezone || 'UTC';
              const readableSlots = filteredSlots.map(s => formatSlotForPrompt(s, tz));
              sendToOpenAI(
                openaiWs,
                responseCreate(
                  ['audio', 'text'],
                  `The requested time is unavailable. Offer only these available slots: ${readableSlots.join(
                    ', '
                  )}.`
                )
              );
            } else {
              sendToOpenAI(openaiWs, responseCreate());
            }
            isProcessingTool = false;
          }
        }

        if (msg?.type === 'response.done' && pendingAutoHangup && pendingHangupMarkName) {
          // Twilio may still be playing queued audio when the model is done generating.
          // Use a Twilio `mark` as a best-effort sync point before hanging up, with a short fallback delay.
          log('Goodbye generation done; sending mark before hangup', { mark: pendingHangupMarkName });
          sendToTwilio(twilioWs, {
            event: 'mark',
            streamSid: ctx.streamSid,
            mark: { name: pendingHangupMarkName },
          });

          if (pendingHangupTimer) clearTimeout(pendingHangupTimer);
          pendingHangupTimer = setTimeout(() => {
            void performHangup('Goodbye finished (fallback timer)');
          }, 2000);
        }

        if (msg?.type === 'response.done') {
          if (bookingPromptActive) bookingPromptActive = false;
          const extracted = extractAssistantTextFromDone(msg);
          const candidate =
            pendingAssistantText.trim() || pendingAssistantHeuristicText.trim() || extracted;
          const finalAssistant = dedupeAssistantText(candidate);
          const responseId = msg?.response?.id as string | undefined;
          const now = Date.now();
          const isDuplicateResponse = responseId && responseId === lastResponseId;
          const isDuplicateText =
            finalAssistant &&
            finalAssistant === lastAssistantText &&
            now - lastAssistantAt < 4000;
          if (!isDuplicateResponse && finalAssistant && !isDuplicateText) {
            conversation.push({ role: 'assistant', text: finalAssistant });
            lastAssistantText = finalAssistant;
            lastAssistantAt = now;
            if (finalAssistant.includes('?')) {
              lastAssistantQuestionAt = now;
              noResponseStage = 0;
              if (!pendingAutoHangup) armNoResponseTimer();
            }
          }
            if (responseId) lastResponseId = responseId;
            pendingAssistantText = '';
            pendingAssistantHeuristicText = '';
            assistantTranscriptSource = null;
            allowModelResponse = false;
            if (fsmEnabled && pendingAnswerFollowUp) {
              pendingAnswerFollowUp = false;
              sessionContext.state = 'FOLLOW_UP';
              if (!pendingAutoHangup) {
                sendPrompt('Is there anything else I can help with today?');
              }
          }
        }
      });

      openaiWs.on('close', () => {
        log('OpenAI websocket closed');
        openaiWs = null;
        twilioWs.close();
      });

      openaiWs.on('error', (err) => {
        log('OpenAI websocket error', (err as any)?.message ?? String(err));
        openaiWs = null;
        twilioWs.close();
      });

      return;
    }

    if (event?.event === 'media') {
      if (!openaiWs) return;
      const payload = event?.media?.payload;
      if (typeof payload !== 'string') return;

      // Mark Twilio stream as ready when we receive first media chunk
      if (!twilioStreamReady) {
        twilioStreamReady = true;
        tryInitialGreeting();
      }

      // NOISE GATE: RMS-based filtering
      const gateThreshold = Number(envFirst(['NOISE_GATE_THRESHOLD']) || 500); // 14-bit PCM scale max 8192 approx
      const rms = calculateRmsFromBase64(payload);
      if (rms < gateThreshold) {
        // Send silence frame or skip?
        // Skipping completely might cause VAD issues if it expects continuous stream?
        // OpenAI Realtime VAD handles silence gaps fine, but sending strict silence is safer.
        // For now, let's just skip sending to OpenAI if it's pure noise, effectively "muting" the line.
        // But we must be careful not to cut off soft speech.
        return;
      }

      sendToOpenAI(openaiWs, { type: 'input_audio_buffer.append', audio: payload });
      return;
    }

    if (event?.event === 'stop') {
      if (ctx) log('Media stream stopped');
      // Best-effort: persist if the model didn't already call save_call.
      if (ctx && !callSaved) {
        try {
          const merged = mergedTranscriptText();
          const duration_seconds = ctx?.startedAt ? Math.max(1, Math.ceil((Date.now() - ctx.startedAt) / 1000)) : undefined;
          await invokeTool(ctx, 'save_call', {
            summary: 'Call ended.',
            transcript: merged || undefined,
            duration_seconds,
            collected_info: intake,
          });
          callSaved = true;
        } catch (e: any) {
          log('save_call failed (non-fatal)', e?.message ?? String(e));
        }
      }

      if (openaiWs) {
        openaiWs.close();
        openaiWs = null;
      }
      twilioWs.close();
      return;
    }

    if (event?.event === 'mark') {
      const name = event?.mark?.name as string | undefined;
      if (pendingAutoHangup && pendingHangupMarkName && name === pendingHangupMarkName) {
        log('Received hangup mark; ending call now', { mark: name });
        await performHangup('Goodbye finished (mark received)');
      }
      return;
    }

    if (event?.event === 'dtmf') {
      return;
    }

    if (event?.event === 'connected') {
      log('Twilio stream connected');
      if (!twilioStreamReady) {
        twilioStreamReady = true;
        tryInitialGreeting();
      }
      return;
    }

    if (event?.event === 'close') {
      return;
    }

    // ignore unknown events
  };

  twilioWs.on('message', (data) => {
    handleTwilioMessage(data).catch((err: any) => {
      const prefix = ctx ? `[callSid=${ctx.callSid} streamSid=${ctx.streamSid}]` : '[twilio]';
      console.error(prefix, 'Unhandled error in Twilio message handler', err?.message ?? String(err));
      try {
        twilioWs.close();
      } catch {
        // ignore
      }
      try {
        if (openaiWs) openaiWs.close();
      } catch {
        // ignore
      }
      openaiWs = null;
      ctx = null;
    });
  });

  twilioWs.on('close', () => {
    if (ctx) log('Twilio websocket closed');
    if (openaiWs) openaiWs.close();
    openaiWs = null;
    ctx = null;
  });

  twilioWs.on('error', (err) => {
    if (ctx) log('Twilio websocket error', (err as any)?.message ?? String(err));
    if (openaiWs) openaiWs.close();
    openaiWs = null;
    ctx = null;
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`handycall-voice-bridge listening on :${port}`);
});
