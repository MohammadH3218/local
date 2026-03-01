import { ServiceType } from '@handycall/shared';

export type ServicePricingGuide = {
  headline: string;
  intro: string;
  pricingQuestions: string[];
  suggestedDetails: string[];
};

const PEST_GUIDE: ServicePricingGuide = {
  headline: 'Pest control callers ask about plans vs one-time visits',
  intro:
    'If you offer subscription plans, list what each tier includes. If you use fixed pricing, share starting prices and what changes the final cost.',
  pricingQuestions: [
    'Do you have monthly, quarterly, or annual plans?',
    'Is there a one-time treatment option?',
    'Does the price change by home size, pest type, or severity?',
  ],
  suggestedDetails: [
    'Base visit fee and any initial treatment fee',
    'Tier names with what is included in each',
    'Re-treatment/warranty policy and exclusions',
  ],
};

const TRADE_GUIDE: ServicePricingGuide = {
  headline: 'Repair businesses usually mix fees and job-based pricing',
  intro:
    'Most callers want to know service-call fees, diagnostic charges, and how final pricing is determined once a tech inspects equipment.',
  pricingQuestions: [
    'Is there a diagnostic or trip fee?',
    'Do you charge hourly, flat-rate, or both?',
    'Do you provide an estimate before repair work starts?',
  ],
  suggestedDetails: [
    'Service call and diagnostic fees',
    'Hourly rate or common starting price ranges',
    'Estimate approval policy before parts/labor are added',
  ],
};

const LAWN_GUIDE: ServicePricingGuide = {
  headline: 'Lawn and landscaping pricing is often package + add-ons',
  intro:
    'Clarify whether pricing is per-visit, weekly/monthly plans, or based on lot size/scope. Add-ons should be listed clearly.',
  pricingQuestions: [
    'Do you charge per visit or by recurring plan?',
    'How does lot size affect pricing?',
    'How much are add-ons like trimming, edging, cleanup, or fertilization?',
  ],
  suggestedDetails: [
    'Base mowing/service pricing structure',
    'Common add-ons with price labels',
    'Seasonal pricing notes and minimum visit charge',
  ],
};

const CLEANING_GUIDE: ServicePricingGuide = {
  headline: 'Cleaning businesses should separate standard vs deep-clean rates',
  intro:
    'Most customers want to know a starting range and what changes price, like home size, frequency, and condition.',
  pricingQuestions: [
    'What is your starting price?',
    'How do square footage and beds/baths impact cost?',
    'Do recurring clients get different pricing?',
  ],
  suggestedDetails: [
    'Standard clean vs deep clean baseline',
    'Size/frequency factors that change price',
    'Supplies, travel fees, and cancellation rules',
  ],
};

const PROJECT_GUIDE: ServicePricingGuide = {
  headline: 'Project services should set expectation on quote workflow',
  intro:
    'For larger jobs, callers need to know if pricing is fixed, phased, or quote-based after inspection.',
  pricingQuestions: [
    'Can you provide rough ranges before a site visit?',
    'Do you charge for estimates?',
    'How are materials and labor handled?',
  ],
  suggestedDetails: [
    'Estimate/inspection policy',
    'Starting ranges by project type',
    'Payment milestones or financing availability',
  ],
};

const GENERAL_GUIDE: ServicePricingGuide = {
  headline: 'Use a simple pricing summary if your model is mixed',
  intro:
    'You can keep this lightweight now and refine later. The AI will use what you enter and avoid inventing numbers.',
  pricingQuestions: [
    'Do you have a starting fee?',
    'What factors usually change final price?',
    'Do you provide quotes before booking?',
  ],
  suggestedDetails: [
    'Basic model (fixed, hourly, subscription, quote-based)',
    'Any minimum or service-call fee',
    'How estimates and approvals are handled',
  ],
};

const SERVICE_GUIDE_BY_TYPE: Record<ServiceType, ServicePricingGuide> = {
  [ServiceType.HANDYMAN]: PROJECT_GUIDE,
  [ServiceType.PEST_CONTROL]: PEST_GUIDE,
  [ServiceType.ELECTRICIAN]: TRADE_GUIDE,
  [ServiceType.PLUMBING]: TRADE_GUIDE,
  [ServiceType.HVAC]: TRADE_GUIDE,
  [ServiceType.LANDSCAPING]: LAWN_GUIDE,
  [ServiceType.LAWN_CARE]: LAWN_GUIDE,
  [ServiceType.CLEANING]: CLEANING_GUIDE,
  [ServiceType.CARPET_CLEANING]: CLEANING_GUIDE,
  [ServiceType.WINDOW_CLEANING]: CLEANING_GUIDE,
  [ServiceType.PRESSURE_WASHING]: CLEANING_GUIDE,
  [ServiceType.POOL_SERVICE]: CLEANING_GUIDE,
  [ServiceType.TREE_SERVICE]: LAWN_GUIDE,
  [ServiceType.ROOFING]: PROJECT_GUIDE,
  [ServiceType.PAINTING]: PROJECT_GUIDE,
  [ServiceType.FLOORING]: PROJECT_GUIDE,
  [ServiceType.REMODELING]: PROJECT_GUIDE,
  [ServiceType.GARAGE_DOOR]: TRADE_GUIDE,
  [ServiceType.APPLIANCE_REPAIR]: TRADE_GUIDE,
  [ServiceType.AUTO_MECHANIC]: TRADE_GUIDE,
  [ServiceType.LOCKSMITH]: TRADE_GUIDE,
  [ServiceType.MOVING]: PROJECT_GUIDE,
  [ServiceType.JUNK_REMOVAL]: PROJECT_GUIDE,
  [ServiceType.IRRIGATION]: LAWN_GUIDE,
  [ServiceType.SNOW_REMOVAL]: LAWN_GUIDE,
  [ServiceType.FENCING]: PROJECT_GUIDE,
  [ServiceType.CONCRETE]: PROJECT_GUIDE,
  [ServiceType.SOLAR]: PROJECT_GUIDE,
  [ServiceType.SECURITY]: TRADE_GUIDE,
  [ServiceType.OTHER]: GENERAL_GUIDE,
};

export function getServicePricingGuide(serviceType?: ServiceType | string): ServicePricingGuide {
  if (!serviceType) return GENERAL_GUIDE;
  const normalized = String(serviceType).toUpperCase() as ServiceType;
  return SERVICE_GUIDE_BY_TYPE[normalized] || GENERAL_GUIDE;
}

