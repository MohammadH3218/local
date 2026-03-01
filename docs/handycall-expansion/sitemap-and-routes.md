# HandyCall.ai — Sitemap & Route Specifications

> Complete information architecture for the expanded platform: consumer marketplace, pro business OS, customer portal.

---

## 1. Route Overview

### Legend

| Symbol | Meaning |
|--------|---------|
| **[EXISTS]** | Route exists today in the codebase |
| **[EXTEND]** | Exists but needs significant expansion |
| **[NEW]** | Must be created |
| Auth: `public` | No authentication required |
| Auth: `customer` | Requires customer account |
| Auth: `pro` | Requires pro/owner account |
| Auth: `admin` | Requires platform admin |

---

## 2. Customer-Facing (Marketing + App)

### 2.1 Marketing Pages

#### `/` — Consumer-First Landing Page **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Primary entry point. Consumer-first: help customers find and book services. Secondary: pro awareness. |
| **Primary CTA** | "Find a Pro" (search bar submission) |
| **Key Components** | SearchBar (service + location), CategoryGrid, HowItWorks, TrustCues, Testimonials, ProBanner, Footer |
| **Data Dependencies** | Static content (SSG). Optional: popular categories count, featured providers (API) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Search submission rate, scroll depth, click-through to /search or /categories, pro CTA click rate |

#### `/categories` — Browse All Categories **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Browse all service categories. Discovery path for customers who don't know what to search for. |
| **Primary CTA** | Click category → `/categories/[slug]` |
| **Key Components** | CategoryGrid (icons + names + pro count), SearchBar (top), Breadcrumbs |
| **Data Dependencies** | Category list with pro counts (API or ISR) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Category click-through rate, bounce rate, search from this page |

#### `/categories/[slug]` — Category Landing Page **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | SEO landing page per category. Show description, search bar pre-filtered, featured providers, FAQ. |
| **Primary CTA** | "Find [Category] Pros Near You" → search with pre-filter |
| **Key Components** | CategoryHeader, SearchBar (pre-filtered), ProviderList (top-rated), FAQ accordion, TrustBadges |
| **Data Dependencies** | Category metadata, top providers in category, FAQ content |
| **Auth Requirement** | `public` |
| **Success Metrics** | Organic search traffic, conversion to /search, time on page |

#### `/search` — Search Results **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Show matching providers based on service type + location. Core marketplace discovery. |
| **Primary CTA** | "Request Quote" or "Book Now" per provider card |
| **Key Components** | SearchBar (editable), FilterSidebar (rating, distance, availability, verified), ProviderCard list, MapView (optional), Pagination, SortDropdown |
| **Data Dependencies** | Provider search API (category, location, filters), geo data |
| **Auth Requirement** | `public` (can search without login; login required to request quote) |
| **Success Metrics** | Provider profile click rate, quote request rate, search refinement rate, zero-result rate |

#### `/provider/[id]` — Provider Profile **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Public profile for a service provider. Reviews, services offered, availability, booking. |
| **Primary CTA** | "Request a Quote" or "Book Appointment" |
| **Key Components** | ProviderHeader (photo, name, rating, badges), ServiceList, ReviewList, AvailabilityWidget, ContactOptions, MapEmbed (service area), Gallery (optional) |
| **Data Dependencies** | Provider profile API, reviews API, availability API |
| **Auth Requirement** | `public` (login required to book/quote) |
| **Success Metrics** | Quote/book conversion rate, review read depth, contact click rate |

#### `/request` — Request Quote / Booking **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Multi-step form: describe job → select provider(s) → submit request or book directly. |
| **Primary CTA** | "Submit Request" or "Confirm Booking" |
| **Key Components** | StepIndicator, ServiceSelector, JobDescriptionForm, LocationInput, DatePreference, PhotoUpload (optional), PaymentCollect (if booking), ConfirmationScreen |
| **Data Dependencies** | Selected provider data, availability, pricing, Stripe payment intent |
| **Auth Requirement** | `customer` (prompt login/register mid-flow if needed) |
| **Success Metrics** | Form completion rate, drop-off per step, booking conversion, average request size |

#### `/how-it-works` — How It Works (Consumer) **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Explain the platform to customers: search, book, pay, review. Build trust. |
| **Primary CTA** | "Find a Pro" |
| **Key Components** | StepCards (3–4 steps), TrustSection, FAQ, SearchBar |
| **Data Dependencies** | Static content (SSG) |
| **Auth Requirement** | `public` |
| **Success Metrics** | CTA click-through, bounce rate |

#### `/help` — Help Center **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Customer support: FAQ, contact, common issues. |
| **Primary CTA** | Search help articles or contact support |
| **Key Components** | SearchInput, FAQAccordion (by topic), ContactForm, ChatWidget trigger |
| **Data Dependencies** | Help articles (static or CMS) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Self-service resolution rate, contact form submissions, search queries |

### 2.2 Customer Authentication

#### `/login` — Login **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Unified login for customers and pros. Default experience is customer-friendly. |
| **Primary CTA** | "Log In" |
| **Key Components** | EmailInput, PasswordInput, SocialAuth (Google, Apple), "I'm a Pro" toggle/link, ForgotPasswordLink, RegisterLink |
| **Data Dependencies** | Cognito auth |
| **Auth Requirement** | `public` (redirect if already logged in) |
| **Success Metrics** | Login success rate, social auth adoption, password reset rate |
| **Extension Notes** | Add "I'm a Pro" link that redirects to `/pros/login` or toggles auth mode. After login, route based on role: customer → `/account`, pro → `/pros/dashboard`. |

#### `/signup` — Customer Registration **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Customer account creation. Lightweight — name, email, password. |
| **Primary CTA** | "Create Account" |
| **Key Components** | NameInput, EmailInput, PasswordInput, SocialAuth, ProSignupLink ("Are you a pro?"), Terms checkbox |
| **Data Dependencies** | Cognito registration |
| **Auth Requirement** | `public` |
| **Success Metrics** | Registration completion rate, social auth %, email verification rate |
| **Extension Notes** | Current `/register` is pro-focused. Rename/reroute: `/signup` = customer, `/pros/signup` = pro. |

### 2.3 Customer Portal (Authenticated)

#### `/account` — Customer Portal Home **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Customer's home: upcoming bookings, recent activity, quick actions. |
| **Primary CTA** | "Book a Service" |
| **Key Components** | UpcomingBookingCards, RecentActivityFeed, QuickActions (book, message, pay), NotificationSummary |
| **Data Dependencies** | Customer bookings API, activity API |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Return visit rate, booking frequency, engagement depth |

#### `/account/bookings` — My Bookings **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | List all bookings (upcoming, past, cancelled). Manage, reschedule, cancel. |
| **Primary CTA** | "View Details" / "Reschedule" / "Book Again" |
| **Key Components** | BookingTabs (Upcoming, Past, Cancelled), BookingCard (provider, service, date, status, actions), EmptyState |
| **Data Dependencies** | Customer bookings API with status filter |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Rebooking rate, cancellation rate, reschedule success |

#### `/account/subscriptions` — My Subscriptions **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Manage recurring service subscriptions (pest control, lawn care, cleaning). |
| **Primary CTA** | "Manage" / "Pause" / "Cancel" |
| **Key Components** | SubscriptionCards (provider, service, frequency, next date, price), PaymentMethodDisplay, CancelFlow |
| **Data Dependencies** | Customer subscriptions API, Stripe billing portal |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Subscription retention, pause vs cancel ratio, renewal rate |

#### `/account/payments` — Payment History **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | View all payments, receipts, refunds. Download invoices. |
| **Primary CTA** | "Download Receipt" |
| **Key Components** | PaymentTable (date, provider, service, amount, status), ReceiptDownload, RefundStatus |
| **Data Dependencies** | Customer payments API (Stripe Connect) |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Receipt download rate, dispute rate |

#### `/account/messages` — Messages **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Message threads with service providers. View booking-related communications. |
| **Primary CTA** | "Send Message" |
| **Key Components** | ThreadList, MessageThread (bubbles), MessageInput, BookingContext (linked booking in thread header) |
| **Data Dependencies** | Customer messages API (per-thread) |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Response rate, message-to-booking conversion, thread resolution time |

#### `/account/settings` — Account Settings **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Customer profile: name, email, phone, saved addresses, notification prefs, payment methods. |
| **Primary CTA** | "Save Changes" |
| **Key Components** | ProfileForm, AddressManager, NotificationPreferences, PaymentMethodManager, DeleteAccountSection |
| **Data Dependencies** | Customer profile API, Stripe customer API |
| **Auth Requirement** | `customer` |
| **Success Metrics** | Profile completion rate, payment method add rate |

---

## 3. Pro-Facing Routes

### 3.1 Pro Marketing

#### `/pros` — Pro Landing Page **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Convince service pros to join. Value prop: AI handles calls, fills calendar, grows business. |
| **Primary CTA** | "Start Free Setup" |
| **Key Components** | HeroSection (headline + demo), ValueProps, HowItWorks (pro-specific), FeatureHighlights (AI calls, CRM, booking, payments), ROICalculator (optional), ProTestimonials, PricingPreview, FinalCTA |
| **Data Dependencies** | Static content (SSG) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Pro signup conversion rate, pricing page click-through, demo engagement |

#### `/pros/pricing` — Pro Pricing **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Plan comparison for pros. Only place pricing is shown. NOT visible from consumer navigation. |
| **Primary CTA** | "Start 14-Day Free Trial" (Pro plan) |
| **Key Components** | PlanCards (Starter, Pro, Max), FeatureComparisonTable, FAQAccordion, TrustBadges |
| **Data Dependencies** | Plan data from constants (existing) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Plan selection rate, trial start rate, FAQ engagement |
| **Extension Notes** | Move existing `/pricing` page here. Remove from consumer nav. |

### 3.2 Pro Authentication

#### `/pros/login` — Pro Login **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Login optimized for pros. "Welcome back to your business dashboard." |
| **Primary CTA** | "Log In" |
| **Key Components** | Same auth components as `/login` but with pro-branded messaging and redirect to `/pros/dashboard` |
| **Data Dependencies** | Cognito auth (same pool, role-based redirect) |
| **Auth Requirement** | `public` |
| **Success Metrics** | Login success rate, time to dashboard |

#### `/pros/signup` — Pro Registration **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Pro account creation. Leads into onboarding. |
| **Primary CTA** | "Create Pro Account" |
| **Key Components** | NameInput, BusinessNameInput, EmailInput, PasswordInput, ServiceCategorySelect, SocialAuth |
| **Data Dependencies** | Cognito registration + company creation |
| **Auth Requirement** | `public` |
| **Success Metrics** | Registration → onboarding start rate |

### 3.3 Pro Onboarding

#### `/pros/onboarding` — Multi-Step Onboarding **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Comprehensive setup flow to get a pro fully operational. |
| **Primary CTA** | "Continue" / "Next Step" / "Go Live" |
| **Key Components** | StepIndicator, dynamic step content panels |
| **Data Dependencies** | Company profile, telephony API, Stripe Connect, agent config |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Step completion rate per step, total completion rate, time to go-live, drop-off points |

**Steps (extend existing):**

| Step | Name | Content |
|------|------|---------|
| 1 | **Business Profile** | Company name, service categories, service radius, license/insurance (optional), logo upload |
| 2 | **Service Offerings** | Jobs offered, pricing model per service, minimum fee, duration estimates |
| 3 | **Schedule** | Business hours per day (multi-segment), blackout dates, service days, timezone |
| 4 | **Communication Setup** | AI voice number provisioning, call forwarding config, voicemail behavior, business hours routing |
| 5 | **Messaging Setup** | SMS number assignment, auto-reply templates, opt-in compliance acknowledgment |
| 6 | **AI Agent Config** | Greeting tone, booking mode, knowledge base quick-fill, escalation rules |
| 7 | **Payments** | Connect payout account (Stripe Connect), platform fee acknowledgment |
| 8 | **Team** | (Optional) Invite team members with roles |
| 9 | **Test Mode** | Simulate test call/SMS, review AI behavior, adjust settings |
| 10 | **Go Live** | Checklist review, activate account, celebration screen |

### 3.4 Pro Dashboard (Business OS)

#### `/pros/dashboard` — Dashboard Home **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | At-a-glance business health: leads, revenue, upcoming jobs, AI performance. |
| **Primary CTA** | Address top action item (e.g., "Review 3 new leads") |
| **Key Components** | StatCards (4), LeadPipeline mini, UpcomingJobs list, RevenueChart (weekly), AIPerformanceWidget (calls handled, booking rate), QuickActions |
| **Data Dependencies** | Dashboard API, calls API, appointments API, billing API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Daily active usage, action completion rate, feature adoption |
| **Extension Notes** | Current `/dashboard` becomes `/pros/dashboard`. Redirect existing URLs. |

#### `/pros/leads` — Lead Inbox **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | All incoming leads from AI calls + manual. Prioritized inbox with follow-up actions. |
| **Primary CTA** | "Follow Up" / "Convert to Booking" |
| **Key Components** | LeadList (filterable: new, contacted, booked, lost), LeadDetailPanel (call recording, transcript, contact info, actions), BulkActions, LeadScoreIndicator |
| **Data Dependencies** | Contacts API (filtered by lead status), calls API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Lead response time, lead-to-booking conversion, lead quality distribution |
| **Extension Notes** | Extends existing `/dashboard/customers`. Rename + add lead pipeline view. |

#### `/pros/schedule` — Schedule & Calendar **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Visual calendar of all appointments. Day/week/month views. Drag to reschedule. |
| **Primary CTA** | "Create Appointment" |
| **Key Components** | CalendarView (day/week/month toggle), AppointmentCard (inline), CreateAppointmentDialog, AvailabilityOverlay, TeamMemberFilter |
| **Data Dependencies** | Appointments API (range query), availability API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Schedule fill rate, no-show rate, reschedule rate |
| **Extension Notes** | Extends existing `/dashboard/appointments`. Add calendar visualization. |

#### `/pros/customers` — CRM **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Full customer relationship management. Contact records with history. |
| **Primary CTA** | "Add Customer" / "View Details" |
| **Key Components** | CustomerTable (sortable, filterable), CustomerDetailPanel (info, call history, booking history, messages, notes, tags), ImportExport, MergeContacts |
| **Data Dependencies** | Contacts API, calls API, appointments API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Customer retention, repeat booking rate, contact completeness |
| **Extension Notes** | Extends existing `/dashboard/contacts`. Add richer detail panel. |

#### `/pros/invoices` — Quotes & Invoices **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Create, send, and track quotes and invoices. Payment collection. |
| **Primary CTA** | "Create Invoice" / "Send Quote" |
| **Key Components** | InvoiceTable, InvoiceBuilder (line items, tax, discount), QuoteBuilder, PaymentStatusBadge, SendOptions (email, SMS) |
| **Data Dependencies** | Invoices API (new), Stripe Connect |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Invoice send rate, payment collection time, quote-to-invoice conversion |

#### `/pros/payments-payouts` — Payments & Payouts **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | View incoming payments, pending payouts, Stripe Connect account status. |
| **Primary CTA** | "View Payout Details" |
| **Key Components** | PaymentList, PayoutSchedule, RevenueChart, StripeConnectStatus, BankAccountInfo |
| **Data Dependencies** | Customer payments API, Stripe Connect API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Payout success rate, average collection time |
| **Extension Notes** | Extends existing `/dashboard/payments`. Add payout schedule. |

#### `/pros/ai-settings` — AI Voice & Messaging Config **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Configure AI agent behavior: voice personality, call handling rules, messaging templates, escalation. |
| **Primary CTA** | "Save Configuration" |
| **Key Components** | VoiceConfig (tone, speed, model), CallHandlingRules (business hours, overflow, forwarding), MessagingTemplates (auto-replies), EscalationRules (when to transfer to human), TestCallButton, KnowledgeBaseLink |
| **Data Dependencies** | Agent config API, telephony API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Configuration completion, test call usage, escalation rate after config |
| **Extension Notes** | Consolidates existing `/dashboard/settings` AI sections + `/dashboard/knowledge`. |

#### `/pros/reports` — Analytics & Reports **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Business analytics: call volume, lead quality, conversion rates, revenue trends, AI performance. |
| **Primary CTA** | "Export Report" |
| **Key Components** | DateRangePicker, MetricCards, CallVolumeChart, ConversionFunnel, RevenueChart, AIHandlingBreakdown, LeadQualityPie, ComparisonToggle (this week vs last) |
| **Data Dependencies** | Dashboard API, calls API, billing API (aggregated) |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Report view frequency, export rate, insight action rate |

#### `/pros/team` — Team Management **[NEW]**

| Field | Value |
|-------|-------|
| **Purpose** | Manage team members: invite, assign roles, permissions. |
| **Primary CTA** | "Invite Team Member" |
| **Key Components** | TeamMemberTable (name, role, status), InviteDialog, RoleSelector (owner, dispatcher, technician), PermissionMatrix, RemoveMemberConfirm |
| **Data Dependencies** | Users API (company-scoped) |
| **Auth Requirement** | `pro` (owner only) |
| **Success Metrics** | Team size, invitation acceptance rate, multi-user engagement |

#### `/pros/settings` — Account & Business Settings **[EXTEND]**

| Field | Value |
|-------|-------|
| **Purpose** | Company profile, business hours, notification preferences, integrations, API access. |
| **Primary CTA** | "Save Changes" |
| **Key Components** | ProfileSection, BusinessHoursEditor, NotificationPrefs, IntegrationsList (calendar, CRM webhooks), APIKeyManager (Max plan), DangerZone (delete account) |
| **Data Dependencies** | Company API, notification prefs API, webhook config API |
| **Auth Requirement** | `pro` |
| **Success Metrics** | Profile completeness, integration adoption, settings save rate |

---

## 4. Admin Routes

#### `/admin` — Admin Dashboard **[EXISTS]**

| Field | Value |
|-------|-------|
| **Purpose** | Platform-wide metrics, company health, system status. |
| **Primary CTA** | Investigate anomalies |
| **Key Components** | SystemStatCards, TopCompaniesTable, RecentActivityFeed, RevenueChart, HealthIndicators |
| **Data Dependencies** | Admin stats API, activity API |
| **Auth Requirement** | `admin` |
| **Success Metrics** | Platform health, alert response time |

All existing admin routes remain. No changes needed for expansion.

---

## 5. Shared / Utility Routes

#### `/book/[token]` — Public Booking **[EXISTS]**

Remains as-is. Token-based public booking link shared by pros with customers.

#### `/terms` — Terms of Service **[EXISTS]**

Update content to cover marketplace terms.

#### `/privacy-policy` — Privacy Policy **[EXISTS]**

Update content for customer data handling.

#### `/api/auth/[...nextauth]` — Auth Handlers **[EXISTS]**

Extend to support customer role.

#### `/api/proxy/[...path]` — BFF Proxy **[EXISTS]**

No changes needed.

---

## 6. Route Migration Plan

Existing routes need redirection to new structure:

| Old Route | New Route | Action |
|-----------|-----------|--------|
| `/pricing` | `/pros/pricing` | Redirect (301) |
| `/register` | `/pros/signup` | Redirect (301), create `/signup` for customers |
| `/dashboard` | `/pros/dashboard` | Redirect (301) for existing pro users |
| `/dashboard/calls` | `/pros/dashboard` (sub-tab) | Redirect |
| `/dashboard/customers` | `/pros/leads` | Redirect |
| `/dashboard/contacts` | `/pros/customers` | Redirect |
| `/dashboard/appointments` | `/pros/schedule` | Redirect |
| `/dashboard/settings` | `/pros/settings` + `/pros/ai-settings` | Split |
| `/dashboard/billing/*` | `/pros/settings` (billing section) | Consolidate |
| `/dashboard/payments` | `/pros/payments-payouts` | Redirect |
| `/dashboard/knowledge` | `/pros/ai-settings` (knowledge tab) | Merge |
| `/onboarding/*` | `/pros/onboarding/*` | Redirect |

---

## 7. Navigation Architecture Summary

```
Consumer Nav:        [Logo] [Find Services] [Categories] [How It Works]     [For Pros] [Login]
Customer Portal Nav: [Logo] [My Bookings] [Messages] [Payments] [Account]   [Bell] [Avatar]
Pro Nav (Sidebar):   [Logo] [Dashboard] [Leads] [Schedule] [Customers]
                     [Invoices] [Payments] [AI Settings] [Reports] [Team] [Settings]
Admin Nav (Sidebar): [Logo] [Dashboard] [Companies] [Users] [Calls]
                     [Appointments] [Knowledge] [Subscriptions] [Settings]
```
