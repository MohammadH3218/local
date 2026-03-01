export type OnboardingStepId =
  | 'profile'
  | 'billing'
  | 'company'
  | 'service-area'
  | 'knowledge'
  | 'calendar'
  | 'phone';

export const ONBOARDING_STEPS: Array<{
  id: OnboardingStepId;
  label: string;
  description: string;
}> = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Confirm your contact details.',
  },
  {
    id: 'billing',
    label: 'Subscription',
    description: 'Pick a plan and add a payment method.',
  },
  {
    id: 'company',
    label: 'Company profile',
    description: 'Name, type, and timezone details.',
  },
  {
    id: 'service-area',
    label: 'Service area',
    description: 'Cities and zip codes you serve.',
  },
  {
    id: 'knowledge',
    label: 'Knowledge base',
    description: 'Sync pricing profile, add FAQs, and policies.',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Connect or create a booking calendar.',
  },
  {
    id: 'phone',
    label: 'Phone number',
    description: 'Choose call handling and forward your line.',
  },
];
