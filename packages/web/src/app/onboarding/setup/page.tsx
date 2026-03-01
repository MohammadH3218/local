'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import {
  IconSparkles,
  IconUser,
  IconSend,
  IconCheck,
  IconX,
  IconArrowRight,
  IconLoader2,
  IconMapPin,
  IconCalendar,
  IconPhone,
  IconBrain,
  IconCreditCard,
  IconBrandGoogle,
  IconBrandWindows,
  IconBrandApple,
  IconPencil,
} from '@tabler/icons-react';
import { useOnboarding } from '@/components/onboarding/onboarding-context';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { SERVICE_TYPE_OPTIONS } from '@/constants/service-types';
import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from '@/constants/timezones';
import { PLAN_CATALOG, getPlanPriceDisplay } from '@/constants/plans';
import { SubscriptionPlan } from '@handycall/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'loading'
  | 'profile_name'
  | 'company_name'
  | 'service_type'
  | 'timezone'
  | 'service_area_choice'
  | 'service_area_input'
  | 'calendar_mode'
  | 'calendar_hours'
  | 'calendar_provider'
  | 'calendar_apple'
  | 'phone_choice'
  | 'phone_claim'
  | 'phone_forward'
  | 'knowledge_intro'
  | 'knowledge_chat'
  | 'billing_plan'
  | 'billing_payment'
  | 'complete';

type ChatMessage = {
  id: string;
  role: 'bot' | 'user';
  content: string;
  /** If set, an edit pencil appears on this user message */
  onEdit?: () => void;
};
type KnowledgeMsg = { role: 'user' | 'assistant'; content: string };
type DayRow = { closed: boolean; open: string; close: string };
type CalendarHours = Record<string, DayRow>;

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { key: 'MON', label: 'Mon' },
  { key: 'TUE', label: 'Tue' },
  { key: 'WED', label: 'Wed' },
  { key: 'THU', label: 'Thu' },
  { key: 'FRI', label: 'Fri' },
  { key: 'SAT', label: 'Sat' },
  { key: 'SUN', label: 'Sun' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
const mkId = () => `msg-${++_id}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function defaultHours(): CalendarHours {
  return Object.fromEntries(
    WEEKDAYS.map((d) => [
      d.key,
      { closed: d.key === 'SAT' || d.key === 'SUN', open: '09:00', close: '17:00' },
    ]),
  );
}

function compactHours(hours: CalendarHours) {
  const out: Record<string, { open: string; close: string }> = {};
  for (const [day, row] of Object.entries(hours)) {
    if (!row.closed) out[day] = { open: row.open, close: row.close };
  }
  return out;
}

function normalizeHours(source: any): CalendarHours {
  const base = defaultHours();
  if (!source || typeof source !== 'object') return base;
  for (const { key } of WEEKDAYS) {
    const raw = source[key];
    if (raw && !raw.closed && raw.open) {
      base[key] = { closed: false, open: raw.open, close: raw.close || '17:00' };
    }
  }
  return base;
}

// ─── Stripe payment sub-component ────────────────────────────────────────────

function StripePaymentForm({
  selectedPlan,
  onSuccess,
}: {
  selectedPlan: SubscriptionPlan | null;
  onSuccess: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !selectedPlan || done) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setLoading(true);
    setError(null);
    try {
      const { client_secret } = await apiClient.createSetupIntent();
      const { error: stripeErr, setupIntent } = await stripe.confirmCardSetup(client_secret, {
        payment_method: { card },
      });
      if (stripeErr) throw new Error(stripeErr.message);
      if (!setupIntent?.payment_method) throw new Error('No payment method returned.');
      await apiClient.createSubscription({
        plan: selectedPlan,
        payment_method_id: setupIntent.payment_method as string,
      });
      setDone(true);
      await onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Payment failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <CardElement
          options={{
            style: {
              base: {
                color: '#1f2937',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                fontSize: '14px',
                '::placeholder': { color: '#9ca3af' },
              },
              invalid: { color: '#ef4444' },
            },
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {done && <p className="text-sm font-medium text-emerald-600">Subscription activated!</p>}
      <button
        type="submit"
        disabled={!stripe || loading || done || !selectedPlan}
        className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <IconLoader2 className="h-4 w-4 animate-spin" stroke={1.5} />
            Processing...
          </>
        ) : (
          <>
            <IconCreditCard className="h-4 w-4" stroke={1.5} />
            Activate {selectedPlan ? PLAN_CATALOG[selectedPlan].name : ''} plan
          </>
        )}
      </button>
    </form>
  );
}

// ─── Small reusable buttons ───────────────────────────────────────────────────

function ActionButton({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled || loading}
      className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
    >
      {loading && <IconLoader2 className="h-4 w-4 animate-spin" stroke={1.5} />}
      {children}
    </button>
  );
}

function ChipButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ChoiceButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OnboardingSetupPage() {
  const { loading, company, status, refreshAll, refreshKnowledge, companyNumber, refreshCompanyNumber } =
    useOnboarding();
  const { setCompany } = useAuthStore();
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Form data
  const [nameInput, setNameInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [zipInput, setZipInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [zipCodes, setZipCodes] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [calendarHours, setCalendarHours] = useState<CalendarHours>(defaultHours());
  const [calendarTimezone, setCalendarTimezone] = useState(DEFAULT_TIMEZONE);
  const [appleEmail, setAppleEmail] = useState('');
  const [applePass, setApplePass] = useState('');
  const [areaCode, setAreaCode] = useState('832');
  const [numberSearch, setNumberSearch] = useState('');
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [searchingNums, setSearchingNums] = useState(false);
  const [forwardNumber, setForwardNumber] = useState('');

  // "Other / Not listed" service type
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherServiceInput, setOtherServiceInput] = useState('');

  // Knowledge AI state
  const [kbMessages, setKbMessages] = useState<KnowledgeMsg[]>([]);
  const [kbInput, setKbInput] = useState('');
  const [kbLoading, setKbLoading] = useState(false);
  const [kbDone, setKbDone] = useState(false);
  const [kbGenerating, setKbGenerating] = useState(false);
  const [kbError, setKbError] = useState<string | null>(null);

  // Billing state
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const stripePromise = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return key ? loadStripe(key) : null;
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, kbMessages]);

  // ─── Chat helpers ──────────────────────────────────────────────────────────

  const botSay = useCallback(async (text: string) => {
    setIsTyping(true);
    await sleep(Math.min(500 + text.length * 12, 1600));
    setIsTyping(false);
    setMessages((prev) => [...prev, { id: mkId(), role: 'bot', content: text }]);
  }, []);

  const userSay = useCallback((text: string, onEdit?: () => void) => {
    setMessages((prev) => [...prev, { id: mkId(), role: 'user', content: text, onEdit }]);
  }, []);

  const goTo = useCallback(
    async (next: Phase, ...msgs: string[]) => {
      setErrMsg(null);
      for (const m of msgs) await botSay(m);
      setPhase(next);
    },
    [botSay],
  );

  /**
   * Re-opens a previous step for editing.
   * Adds a bot re-prompt message and jumps back to that phase.
   */
  const editStep = useCallback(
    (prompt: string, targetPhase: Phase, prefill?: () => void) => {
      setErrMsg(null);
      if (prefill) prefill();
      void (async () => {
        await botSay(prompt);
        setPhase(targetPhase);
      })();
    },
    [botSay],
  );

  // ─── Initialization ────────────────────────────────────────────────────────

  useEffect(() => {
    if (loading || initialized.current) return;
    initialized.current = true;

    // Pre-fill from existing data
    if (company?.company_name) setCompanyInput(company.company_name as string);
    if (company?.timezone) setCalendarTimezone(company.timezone as string);
    if ((company?.service_area_zipcodes as string[])?.length)
      setZipCodes(company.service_area_zipcodes as string[]);
    if ((company?.service_area_cities as string[])?.length)
      setCities(company.service_area_cities as string[]);
    if (company?.business_hours) setCalendarHours(normalizeHours(company.business_hours));
    if (company?.phone_number) setForwardNumber(company.phone_number as string);

    void startChat(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const startChat = async (s: typeof status) => {
    await botSay(
      "👋 Hi! I'm your HandyCall setup assistant. Let's get your AI receptionist ready — it only takes a few minutes.",
    );
    if (!s.profile) {
      await goTo('profile_name', "First, what's your full name?");
    } else if (!s.companyProfile) {
      await goTo('company_name', "Let's set up your company. What's the business name?");
    } else if (!s.serviceArea) {
      await goTo(
        'service_area_choice',
        'Where do you provide service? Do you cover all areas, or specific zip codes and cities?',
      );
    } else if (!s.calendar) {
      await goTo('calendar_mode', "Let's set up your booking calendar. How do you want to manage appointments?");
    } else if (!s.phone) {
      await goTo('phone_choice', "Almost there! How do you want customers to reach you?");
    } else if (!s.knowledge) {
      await goTo(
        'knowledge_intro',
        "Now let's build your AI receptionist's knowledge base so it can answer caller questions accurately.",
      );
    } else if (!s.billing) {
      await goTo('billing_plan', "Last step — let's activate your HandyCall subscription.");
    } else {
      await botSay('🎉 Setup complete! Redirecting to your dashboard...');
      setTimeout(() => router.replace('/dashboard'), 2000);
    }
  };

  // ─── Step handlers ─────────────────────────────────────────────────────────

  const handleProfileName = async () => {
    const name = nameInput.trim();
    if (!name) return;
    const captured = name;
    userSay(captured, () =>
      editStep("What name would you like to use?", 'profile_name', () => setNameInput(captured)),
    );
    setNameInput('');
    setIsSaving(true);
    try {
      await apiClient.updateMyCompany({ owner_name: captured });
      await refreshAll();
    } catch {
      // Non-blocking
    } finally {
      setIsSaving(false);
    }
    await goTo('company_name', `Nice to meet you, ${captured}! What's the name of your business?`);
  };

  const handleCompanyName = async () => {
    const name = companyInput.trim();
    if (!name) return;
    userSay(name, () => editStep("What's the correct business name?", 'company_name'));
    await goTo('service_type', `Got it — ${name}! What type of service do you provide?`);
  };

  const handleServiceType = async (value: string, label: string) => {
    setShowOtherInput(false);
    setOtherServiceInput('');
    const displayLabel = label;
    userSay(displayLabel, () =>
      editStep('Which service type best describes your business?', 'service_type', () => {
        setShowOtherInput(false);
        setOtherServiceInput('');
      }),
    );
    setIsSaving(true);
    try {
      await apiClient.updateMyCompany({ service_type: value });
      await refreshAll();
      await goTo('timezone', 'What timezone are you in?');
    } catch {
      setErrMsg('Could not save service type. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTimezone = async (value: string, label: string) => {
    userSay(label, () => editStep('Which timezone are you in?', 'timezone'));
    setCalendarTimezone(value);
    setIsSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        company_name: companyInput.trim(),
        timezone: value,
        company_profile_completed: true,
      });
      setCompany(updated);
      await refreshAll();
      await goTo(
        'service_area_choice',
        "Company details saved! Now let's set your service area. Do you serve all areas, or specific zip codes and cities?",
      );
    } catch {
      setErrMsg('Could not save company profile. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleServiceAreaAll = async () => {
    userSay('Serve all areas');
    setIsSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        service_area_zipcodes: [],
        service_area_cities: [],
        service_area_completed: true,
      });
      setCompany(updated);
      await refreshAll();
      await goTo('calendar_mode', "Got it — you cover all areas. Now let's set up your booking calendar.");
    } catch {
      setErrMsg('Could not save service area.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleServiceAreaSpecific = async () => {
    userSay('Specific zip codes & cities');
    await goTo('service_area_input', "Add your zip codes and cities below. Click 'Save' when done.");
  };

  const addZip = () => {
    const v = zipInput.trim();
    if (!v || !/^\d{5}$/.test(v) || zipCodes.includes(v)) {
      setZipInput('');
      return;
    }
    setZipCodes((prev) => [...prev, v]);
    setZipInput('');
  };

  const addCity = () => {
    const v = cityInput.trim();
    if (!v || cities.includes(v)) {
      setCityInput('');
      return;
    }
    setCities((prev) => [...prev, v]);
    setCityInput('');
  };

  const handleSaveServiceArea = async () => {
    if (zipCodes.length === 0 && cities.length === 0) {
      setErrMsg('Add at least one zip code or city.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        service_area_zipcodes: zipCodes,
        service_area_cities: cities,
        service_area_completed: true,
      });
      setCompany(updated);
      await refreshAll();
      userSay(
        `${zipCodes.length} zip code${zipCodes.length !== 1 ? 's' : ''}, ${cities.length} ${cities.length !== 1 ? 'cities' : 'city'} saved`,
      );
      await goTo('calendar_mode', "Service area saved! Let's set up your booking calendar.");
    } catch {
      setErrMsg('Could not save service area.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCalendarMode = async (mode: 'INTERNAL' | 'EXTERNAL') => {
    if (mode === 'INTERNAL') {
      userSay('Use HandyCall Calendar');
      await goTo(
        'calendar_hours',
        "Great choice! Set your business hours so callers can book valid times. Toggle each day open or closed.",
      );
    } else {
      userSay('Connect my existing calendar');
      await goTo('calendar_provider', 'Which calendar would you like to connect?');
    }
  };

  const handleSaveCalendarHours = async () => {
    const hasOpen = WEEKDAYS.some((d) => !calendarHours[d.key]?.closed);
    if (!hasOpen) {
      setErrMsg('Set at least one open day.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({
        calendar_mode: 'INTERNAL',
        timezone: calendarTimezone,
        business_hours: compactHours(calendarHours),
        schedule_setup_completed: true,
        calendar_setup_completed: true,
      });
      setCompany(updated);
      await refreshAll();
      userSay('Business hours saved ✓');
      await goTo('phone_choice', "Calendar is all set! Now let's get your phone ready. How do you want customers to reach you?");
    } catch {
      setErrMsg('Could not save calendar settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCalendarProvider = async (provider: 'GOOGLE' | 'MICROSOFT' | 'APPLE') => {
    const label =
      provider === 'GOOGLE'
        ? 'Google Calendar'
        : provider === 'MICROSOFT'
          ? 'Outlook / Microsoft 365'
          : 'Apple iCloud';
    userSay(label);
    if (provider === 'APPLE') {
      await goTo('calendar_apple', 'Enter your Apple ID and an app-specific password to connect.');
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateMyCompany({
        calendar_mode: 'EXTERNAL',
        timezone: calendarTimezone,
        schedule_setup_completed: true,
        calendar_setup_completed: false,
      });
      const res =
        provider === 'GOOGLE'
          ? await apiClient.getGoogleCalendarAuthUrl()
          : await apiClient.getMicrosoftCalendarAuthUrl();
      if (res?.url) window.location.href = res.url;
    } catch {
      setErrMsg('Could not start calendar connection. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectApple = async () => {
    if (!appleEmail || !applePass) {
      setErrMsg('Enter your Apple ID and app-specific password.');
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateMyCompany({
        calendar_mode: 'EXTERNAL',
        timezone: calendarTimezone,
        schedule_setup_completed: true,
        calendar_setup_completed: false,
      });
      await apiClient.connectAppleCalendar(appleEmail, applePass);
      await refreshAll();
      userSay('Apple Calendar connected ✓');
      await goTo('phone_choice', "Calendar connected! Let's set up your phone.");
    } catch (err: any) {
      setErrMsg(err?.message || 'Could not connect Apple Calendar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhoneChoice = async (choice: 'claim' | 'forward' | 'demo') => {
    if (choice === 'claim') {
      userSay('Claim a new HandyCall number');
      await goTo('phone_claim', "Let's find a local number! Enter an area code to search available numbers.");
    } else if (choice === 'forward') {
      userSay('Forward my existing number');
      await goTo(
        'phone_forward',
        "Enter your current business number. I'll save it so you can set up forwarding from your carrier.",
      );
    } else {
      userSay('Use a demo number for testing');
      setIsSaving(true);
      try {
        const res = await apiClient.claimDemoPhoneNumber();
        await refreshCompanyNumber();
        await refreshAll();
        const num = res?.phoneNumber ?? res?.phone_number ?? res?.data?.phoneNumber ?? '';
        userSay(`Demo number assigned${num ? `: ${num}` : ''}`);
        await goTo(
          'knowledge_intro',
          `Demo number ready${num ? ` (${num})` : ''}! Now let's build your AI knowledge base.`,
        );
      } catch {
        setErrMsg('Could not assign demo number.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSearchNumbers = async () => {
    setSearchingNums(true);
    setAvailableNumbers([]);
    setErrMsg(null);
    try {
      const results = await apiClient.getAvailablePhoneNumbers({
        areaCode: areaCode.trim() || undefined,
        contains: numberSearch.trim() || undefined,
        maxResults: 8,
      });
      setAvailableNumbers(results || []);
      if (!results?.length) setErrMsg('No numbers found. Try a different area code.');
    } catch {
      setErrMsg('Search failed. Try again.');
    } finally {
      setSearchingNums(false);
    }
  };

  const handleClaimNumber = async (phoneNumber: string) => {
    setIsSaving(true);
    try {
      await apiClient.claimPhoneNumber(phoneNumber, 'HandyCall onboarding');
      await refreshCompanyNumber();
      await refreshAll();
      userSay(`Claimed ${phoneNumber} ✓`);
      await goTo(
        'knowledge_intro',
        `Your HandyCall number is ${phoneNumber}. Now let's build your AI knowledge base so it can answer calls accurately!`,
      );
    } catch (err: any) {
      setErrMsg(err?.message || 'Could not claim number. Try another.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveForwarding = async () => {
    if (!forwardNumber.trim()) {
      setErrMsg('Enter your current business number.');
      return;
    }
    setIsSaving(true);
    try {
      const updated = await apiClient.updateMyCompany({ phone_number: forwardNumber.trim() });
      setCompany(updated);
      userSay(`Saved: ${forwardNumber.trim()}`);
      await goTo(
        'knowledge_intro',
        `Got it! When ready, forward calls from ${forwardNumber.trim()} to your HandyCall number in your carrier settings. Now let's build your knowledge base!`,
      );
    } catch {
      setErrMsg('Could not save number.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartKnowledge = async () => {
    userSay("Let's build it!");
    await botSay(
      "I'll ask you a few targeted questions about your business — services, pricing, policies, and what customers typically ask. Your answers become your AI's knowledge base. You can always add more entries from your dashboard later.",
    );
    setPhase('knowledge_chat');
    void fetchKbReply([]);
  };

  const fetchKbReply = async (history: KnowledgeMsg[]) => {
    setKbLoading(true);
    setKbError(null);
    try {
      const res = await apiClient.knowledgeAssistantRespond(history);
      const msg = String(res?.assistant_message || '').trim();
      if (msg) {
        setKbMessages([...history, { role: 'assistant', content: msg }]);
      }
      setKbDone(res?.done === true);
    } catch {
      setKbError(
        "The AI interview is temporarily unavailable. You can still generate a knowledge base with what you've answered, or skip and add entries manually from the dashboard.",
      );
    } finally {
      setKbLoading(false);
    }
  };

  const sendKbMessage = async () => {
    const text = kbInput.trim();
    if (!text || kbLoading) return;
    const next: KnowledgeMsg[] = [...kbMessages, { role: 'user', content: text }];
    setKbMessages(next);
    setKbInput('');
    await fetchKbReply(next);
  };

  const handleGenerateKnowledge = async () => {
    setKbGenerating(true);
    setKbError(null);
    try {
      const [kbRes, prodRes] = await Promise.all([
        apiClient.knowledgeAssistantGenerate(kbMessages, true),
        apiClient.knowledgeExtractProducts(kbMessages).catch(() => ({ created_count: 0, skipped_count: 0 })),
      ]);
      const created = Number(kbRes?.created_count || 0);
      const productsCreated = Number(prodRes?.created_count || 0);
      await refreshKnowledge();
      await refreshAll();
      userSay(`Knowledge base generated: ${created} entries created`);
      const productNote = productsCreated > 0
        ? ` I also created ${productsCreated} service product${productsCreated === 1 ? '' : 's'} in your Payments page.`
        : '';
      await goTo(
        'billing_plan',
        `Done! I created ${created} knowledge entr${created === 1 ? 'y' : 'ies'} for your AI receptionist.${productNote} You can always add more from your dashboard.`,
        "Now for the last step — let's activate your HandyCall subscription. Which plan fits your business?",
      );
    } catch (err: any) {
      setKbError(err?.message || 'Could not generate knowledge base. Try again.');
    } finally {
      setKbGenerating(false);
    }
  };

  const handleSkipKnowledge = async () => {
    userSay('Skip for now');
    await goTo(
      'billing_plan',
      "No problem! You can add knowledge entries anytime from your dashboard. Let's activate your subscription.",
    );
  };

  const handlePlanSelect = async (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    userSay(`${PLAN_CATALOG[plan].name} — $${PLAN_CATALOG[plan].price}/month`);
    await goTo('billing_payment', `${PLAN_CATALOG[plan].name} plan selected! Add a payment method to activate.`);
  };

  const handleBillingSuccess = async () => {
    await refreshAll();
    await goTo('complete', "🎉 You're all set! Your HandyCall AI receptionist is live and ready to take calls.");
  };

  // ─── Active zone ───────────────────────────────────────────────────────────

  const renderActiveZone = () => {
    if (phase === 'loading' || phase === 'complete') return null;

    return (
      <div className="space-y-3">
        {errMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <IconX className="h-4 w-4 flex-shrink-0" stroke={1.5} />
            {errMsg}
          </div>
        )}

        {/* Profile name */}
        {phase === 'profile_name' && (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleProfileName()}
              placeholder="Your full name..."
              disabled={isSaving}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
            />
            <ActionButton onClick={handleProfileName} disabled={!nameInput.trim() || isSaving} loading={isSaving}>
              <IconSend className="h-4 w-4" stroke={1.5} />
            </ActionButton>
          </div>
        )}

        {/* Company name */}
        {phase === 'company_name' && (
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={companyInput}
              onChange={(e) => setCompanyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && companyInput.trim() && void handleCompanyName()}
              placeholder="Business name..."
              disabled={isSaving}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
            />
            <ActionButton onClick={handleCompanyName} disabled={!companyInput.trim() || isSaving} loading={isSaving}>
              <IconSend className="h-4 w-4" stroke={1.5} />
            </ActionButton>
          </div>
        )}

        {/* Service type */}
        {phase === 'service_type' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {SERVICE_TYPE_OPTIONS.filter((opt) => (opt.value as string) !== 'OTHER').map((opt) => (
                <ChipButton
                  key={opt.value}
                  onClick={() => void handleServiceType(opt.value, opt.label)}
                  disabled={isSaving}
                >
                  {opt.label}
                </ChipButton>
              ))}
              <ChipButton
                onClick={() => {
                  setShowOtherInput(true);
                  setOtherServiceInput('');
                }}
                disabled={isSaving || showOtherInput}
              >
                Other / Not listed →
              </ChipButton>
            </div>
            {showOtherInput && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={otherServiceInput}
                  onChange={(e) => setOtherServiceInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' &&
                    otherServiceInput.trim() &&
                    void handleServiceType('OTHER', otherServiceInput.trim())
                  }
                  placeholder="e.g. Septic tank cleaning, Foundation repair..."
                  disabled={isSaving}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                />
                <ActionButton
                  onClick={() => void handleServiceType('OTHER', otherServiceInput.trim())}
                  disabled={!otherServiceInput.trim() || isSaving}
                  loading={isSaving}
                >
                  <IconSend className="h-4 w-4" stroke={1.5} />
                </ActionButton>
              </div>
            )}
          </div>
        )}

        {/* Timezone */}
        {phase === 'timezone' && (
          <div className="flex flex-wrap gap-2">
            {TIMEZONE_OPTIONS.map((tz) => (
              <ChipButton key={tz.value} onClick={() => void handleTimezone(tz.value, tz.label)} disabled={isSaving}>
                {tz.label}
              </ChipButton>
            ))}
          </div>
        )}

        {/* Service area choice */}
        {phase === 'service_area_choice' && (
          <div className="flex flex-wrap gap-3">
            <ChoiceButton
              icon={<IconMapPin className="h-4 w-4 text-emerald-500" stroke={1.5} />}
              onClick={handleServiceAreaAll}
              disabled={isSaving}
            >
              Serve all areas
            </ChoiceButton>
            <ChoiceButton
              icon={<IconMapPin className="h-4 w-4 text-slate-400" stroke={1.5} />}
              onClick={handleServiceAreaSpecific}
              disabled={isSaving}
            >
              Specific zip codes & cities
            </ChoiceButton>
          </div>
        )}

        {/* Service area input */}
        {phase === 'service_area_input' && (
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Zip codes</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={zipInput}
                  onChange={(e) => setZipInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addZip();
                      e.preventDefault();
                    }
                  }}
                  placeholder="e.g. 77002"
                  maxLength={5}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={addZip}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {zipCodes.map((z) => (
                  <span
                    key={z}
                    className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800"
                  >
                    {z}
                    <button
                      type="button"
                      onClick={() => setZipCodes((p) => p.filter((x) => x !== z))}
                      className="text-emerald-600 hover:text-red-500"
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cities <span className="font-normal normal-case text-slate-400">(optional)</span>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      addCity();
                      e.preventDefault();
                    }
                  }}
                  placeholder="Austin, TX"
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="button"
                  onClick={addCity}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cities.map((c) => (
                  <span
                    key={c}
                    className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setCities((p) => p.filter((x) => x !== c))}
                      className="text-slate-500 hover:text-red-500"
                    >
                      <IconX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <ActionButton
              onClick={handleSaveServiceArea}
              disabled={isSaving || (zipCodes.length === 0 && cities.length === 0)}
              loading={isSaving}
            >
              <IconCheck className="h-4 w-4" stroke={2} />
              Save service area
            </ActionButton>
          </div>
        )}

        {/* Calendar mode */}
        {phase === 'calendar_mode' && (
          <div className="flex flex-wrap gap-3">
            <ChoiceButton
              icon={<IconCalendar className="h-4 w-4 text-emerald-500" stroke={1.5} />}
              onClick={() => void handleCalendarMode('INTERNAL')}
              disabled={isSaving}
            >
              Use HandyCall Calendar
            </ChoiceButton>
            <ChoiceButton
              icon={<IconCalendar className="h-4 w-4 text-slate-400" stroke={1.5} />}
              onClick={() => void handleCalendarMode('EXTERNAL')}
              disabled={isSaving}
            >
              Connect my existing calendar
            </ChoiceButton>
          </div>
        )}

        {/* Business hours */}
        {phase === 'calendar_hours' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {WEEKDAYS.map((day) => {
                const row = calendarHours[day.key] ?? { closed: true, open: '09:00', close: '17:00' };
                return (
                  <div
                    key={day.key}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="w-8 text-xs font-bold text-slate-500">{day.label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarHours((prev) => ({ ...prev, [day.key]: { ...row, closed: !row.closed } }))
                      }
                      className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold transition ${
                        row.closed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {row.closed ? 'Closed' : 'Open'}
                    </button>
                    {!row.closed && (
                      <>
                        <input
                          type="time"
                          value={row.open}
                          onChange={(e) =>
                            setCalendarHours((prev) => ({ ...prev, [day.key]: { ...row, open: e.target.value } }))
                          }
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs"
                        />
                        <span className="text-xs text-slate-400">–</span>
                        <input
                          type="time"
                          value={row.close}
                          onChange={(e) =>
                            setCalendarHours((prev) => ({ ...prev, [day.key]: { ...row, close: e.target.value } }))
                          }
                          className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <ActionButton onClick={handleSaveCalendarHours} disabled={isSaving} loading={isSaving}>
              <IconCheck className="h-4 w-4" stroke={2} />
              Save hours & continue
            </ActionButton>
          </div>
        )}

        {/* Calendar provider */}
        {phase === 'calendar_provider' && (
          <div className="flex flex-wrap gap-3">
            {[
              { id: 'GOOGLE', label: 'Google Calendar', icon: <IconBrandGoogle className="h-4 w-4" stroke={1.5} /> },
              {
                id: 'MICROSOFT',
                label: 'Outlook / Microsoft 365',
                icon: <IconBrandWindows className="h-4 w-4" stroke={1.5} />,
              },
              { id: 'APPLE', label: 'Apple iCloud', icon: <IconBrandApple className="h-4 w-4" stroke={1.5} /> },
            ].map((opt) => (
              <ChoiceButton
                key={opt.id}
                icon={opt.icon}
                onClick={() => void handleCalendarProvider(opt.id as 'GOOGLE' | 'MICROSOFT' | 'APPLE')}
                disabled={isSaving}
              >
                {opt.label}
              </ChoiceButton>
            ))}
          </div>
        )}

        {/* Apple calendar credentials */}
        {phase === 'calendar_apple' && (
          <div className="space-y-3">
            <input
              type="email"
              value={appleEmail}
              onChange={(e) => setAppleEmail(e.target.value)}
              placeholder="Apple ID email"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <input
              type="password"
              value={applePass}
              onChange={(e) => setApplePass(e.target.value)}
              placeholder="App-specific password"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <a
              href="https://support.apple.com/en-us/102654"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-emerald-600 hover:underline"
            >
              How to generate an app-specific password →
            </a>
            <ActionButton
              onClick={handleConnectApple}
              disabled={isSaving || !appleEmail || !applePass}
              loading={isSaving}
            >
              <IconCheck className="h-4 w-4" stroke={2} />
              Connect Apple Calendar
            </ActionButton>
          </div>
        )}

        {/* Phone choice */}
        {phase === 'phone_choice' && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {[
              {
                id: 'claim',
                label: 'Claim a new HandyCall number',
                icon: <IconPhone className="h-4 w-4 text-emerald-500" stroke={1.5} />,
              },
              {
                id: 'forward',
                label: 'Forward my existing number',
                icon: <IconPhone className="h-4 w-4 text-slate-500" stroke={1.5} />,
              },
              {
                id: 'demo',
                label: 'Use a demo number for testing',
                icon: <IconPhone className="h-4 w-4 text-slate-300" stroke={1.5} />,
              },
            ].map((opt) => (
              <ChoiceButton
                key={opt.id}
                icon={opt.icon}
                onClick={() => void handlePhoneChoice(opt.id as 'claim' | 'forward' | 'demo')}
                disabled={isSaving}
              >
                {opt.label}
              </ChoiceButton>
            ))}
          </div>
        )}

        {/* Phone number search */}
        {phase === 'phone_claim' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                placeholder="Area code"
                maxLength={3}
                className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              />
              <input
                type="text"
                value={numberSearch}
                onChange={(e) => setNumberSearch(e.target.value)}
                placeholder="Contains (optional)"
                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={() => void handleSearchNumbers()}
                disabled={searchingNums || isSaving}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {searchingNums ? <IconLoader2 className="h-4 w-4 animate-spin" stroke={1.5} /> : 'Search'}
              </button>
            </div>
            {availableNumbers.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {availableNumbers.map((num) => (
                  <button
                    type="button"
                    key={num.phoneNumber}
                    onClick={() => void handleClaimNumber(num.phoneNumber)}
                    disabled={isSaving}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <span className="font-semibold text-slate-900">{num.phoneNumber}</span>
                    <span className="text-xs font-medium text-emerald-600">Claim →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Forward number input */}
        {phase === 'phone_forward' && (
          <div className="flex gap-2">
            <input
              autoFocus
              type="tel"
              value={forwardNumber}
              onChange={(e) => setForwardNumber(e.target.value)}
              placeholder="+15551234567"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            />
            <ActionButton onClick={handleSaveForwarding} disabled={isSaving || !forwardNumber.trim()} loading={isSaving}>
              <IconCheck className="h-4 w-4" stroke={2} />
              Save
            </ActionButton>
          </div>
        )}

        {/* Knowledge intro */}
        {phase === 'knowledge_intro' && (
          <div className="flex flex-wrap gap-3">
            <ChoiceButton
              icon={<IconBrain className="h-4 w-4 text-emerald-500" stroke={1.5} />}
              onClick={() => void handleStartKnowledge()}
              disabled={isSaving}
            >
              Build my knowledge base
            </ChoiceButton>
            <button
              type="button"
              onClick={() => void handleSkipKnowledge()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Knowledge AI chat */}
        {phase === 'knowledge_chat' && (
          <div className="space-y-3">
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
              {kbMessages.length === 0 && kbLoading && (
                <p className="text-sm text-slate-400">Loading first question...</p>
              )}
              {kbMessages.map((m, i) => (
                <div
                  key={i}
                  className={`rounded-xl px-3 py-2 text-sm ${
                    m.role === 'assistant'
                      ? 'border border-emerald-100 bg-emerald-50 text-emerald-900'
                      : 'border border-slate-200 bg-slate-50 text-slate-800'
                  }`}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-50">
                    {m.role === 'assistant' ? 'AI Assistant' : 'You'}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                </div>
              ))}
              {kbLoading && (
                <div className="flex gap-1 px-1 py-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {kbError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                {kbError}
              </div>
            )}

            {!kbDone && !kbError && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={kbInput}
                  onChange={(e) => setKbInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !kbLoading && void sendKbMessage()}
                  placeholder="Type your answer..."
                  disabled={kbLoading}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => void sendKbMessage()}
                  disabled={!kbInput.trim() || kbLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <IconSend className="h-4 w-4" stroke={1.5} />
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(kbDone || kbMessages.some((m) => m.role === 'user') || kbError) && (
                <ActionButton
                  onClick={handleGenerateKnowledge}
                  disabled={kbGenerating}
                  loading={kbGenerating}
                >
                  <IconBrain className="h-4 w-4" stroke={1.5} />
                  {kbGenerating ? 'Generating...' : kbDone ? 'Generate knowledge base' : 'Generate with current answers'}
                </ActionButton>
              )}
              <button
                type="button"
                onClick={() => void handleSkipKnowledge()}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 hover:bg-slate-50"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* Billing plan selection */}
        {phase === 'billing_plan' && (
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(PLAN_CATALOG).map(([plan, details]) => {
              const planKey = plan as SubscriptionPlan;
              const price = getPlanPriceDisplay(planKey);
              return (
                <button
                  type="button"
                  key={plan}
                  onClick={() => void handlePlanSelect(planKey)}
                  disabled={isSaving}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-emerald-400 hover:shadow-sm disabled:opacity-50"
                >
                  <p className="text-sm font-bold text-slate-900">{details.name}</p>
                  <p className="mt-1 text-xl font-bold text-emerald-600">
                    {price.current}
                    <span className="text-xs font-normal text-slate-500"> /{price.cadence.replace('per ', '')}</span>
                  </p>
                  {details.badge && <p className="mt-1.5 text-xs text-slate-500">{details.badge}</p>}
                  {details.trialLabel && (
                    <p className="mt-1 text-xs font-semibold text-emerald-600">{details.trialLabel}</p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Stripe payment */}
        {phase === 'billing_payment' &&
          (stripePromise ? (
            <Elements stripe={stripePromise}>
              <StripePaymentForm selectedPlan={selectedPlan} onSuccess={handleBillingSuccess} />
            </Elements>
          ) : (
            <p className="text-sm text-red-600">Payment provider not configured. Contact support.</p>
          ))}
      </div>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────────────

  if (loading && messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          <p className="text-sm text-slate-500">Preparing your setup...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat transcript */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`group flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  msg.role === 'bot' ? 'bg-emerald-600' : 'bg-slate-200'
                }`}
              >
                {msg.role === 'bot' ? (
                  <IconSparkles className="h-4 w-4 text-white" stroke={1.5} />
                ) : (
                  <IconUser className="h-4 w-4 text-slate-500" stroke={1.5} />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-md rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'bot'
                    ? 'rounded-tl-sm border border-slate-200 bg-white text-slate-800 shadow-sm'
                    : 'rounded-tr-sm bg-emerald-600 text-white'
                }`}
              >
                {msg.content}
              </div>

              {/* Edit pencil — appears on hover for editable user messages */}
              {msg.role === 'user' && msg.onEdit && (
                <button
                  type="button"
                  onClick={msg.onEdit}
                  title="Edit this answer"
                  className="mt-2 flex-shrink-0 self-center rounded-lg p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                >
                  <IconPencil className="h-3.5 w-3.5" stroke={1.5} />
                </button>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-600">
                <IconSparkles className="h-4 w-4 text-white" stroke={1.5} />
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-slate-300"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Complete CTA */}
          {phase === 'complete' && !isTyping && (
            <div className="flex justify-start pl-11">
              <button
                type="button"
                onClick={() => router.replace('/dashboard')}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Go to Dashboard
                <IconArrowRight className="h-4 w-4" stroke={2} />
              </button>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Active input zone */}
      {!isTyping && phase !== 'loading' && phase !== 'complete' && (
        <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-4 sm:px-8">
          <div className="mx-auto max-w-2xl">{renderActiveZone()}</div>
        </div>
      )}
    </div>
  );
}
