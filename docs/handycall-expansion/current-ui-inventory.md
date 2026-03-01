# HandyCall.ai — Current UI Inventory

> Generated 2026-02-26. Extracted from `packages/web/` codebase inspection.

---

## 1. Screens / Routes List

### 1.1 Marketing Pages

| # | Route | File | Description |
|---|-------|------|-------------|
| 1 | `/` | `app/page.tsx` | Landing page — hero with search, stats strip, live call demo, how-it-works, features grid, industries, CTA |
| 2 | `/pricing` | `app/pricing/page.tsx` | Plan comparison (Starter/Pro/Max) with feature matrix |
| 3 | `/contact` | `app/contact/page.tsx` | Contact form with business inquiry fields |
| 4 | `/terms` | `app/terms/page.tsx` | Terms of service |
| 5 | `/privacy-policy` | `app/privacy-policy/page.tsx` | Privacy policy |

### 1.2 Authentication Pages

| # | Route | File | Description |
|---|-------|------|-------------|
| 6 | `/login` | `app/login/page.tsx` | Email/password + Google/Apple social auth, password change modal |
| 7 | `/register` | `app/register/page.tsx` | Full name, email, password, social signup, 5-step progress |
| 8 | `/forgot-password` | `app/forgot-password/page.tsx` | Email input for reset request |
| 9 | `/reset-password` | `app/reset-password/page.tsx` | New password confirmation form |
| 10 | `/verify-email` | `app/verify-email/page.tsx` | Email verification code entry |

### 1.3 Onboarding

| # | Route | File | Description |
|---|-------|------|-------------|
| 11 | `/onboarding` | `app/onboarding/page.tsx` | Redirect to /onboarding/profile |
| 12 | `/onboarding/[step]` | `app/onboarding/[step]/page.tsx` | Dynamic step handler (profile, services, hours, billing) |

### 1.4 Dashboard (Pro/Owner)

| # | Route | File | Description |
|---|-------|------|-------------|
| 13 | `/dashboard` | `app/dashboard/page.tsx` | Overview: 4 metric cards, usage bars, quick actions, activity feed |
| 14 | `/dashboard/calls` | `app/dashboard/calls/page.tsx` | Call list with search, filter, metadata |
| 15 | `/dashboard/calls/[id]` | `app/dashboard/calls/[id]/page.tsx` | Call detail: transcript, recording player, AI summary |
| 16 | `/dashboard/messages` | `app/dashboard/messages/page.tsx` | SMS thread list |
| 17 | `/dashboard/messages/[id]` | `app/dashboard/messages/[id]/page.tsx` | Thread detail view |
| 18 | `/dashboard/customers` | `app/dashboard/customers/page.tsx` | Lead/customer list with tags and scores |
| 19 | `/dashboard/contacts` | `app/dashboard/contacts/page.tsx` | Contact CRM management |
| 20 | `/dashboard/appointments` | `app/dashboard/appointments/page.tsx` | Calendar view of appointments |
| 21 | `/dashboard/knowledge` | `app/dashboard/knowledge/page.tsx` | Knowledge base: pricing, FAQs, service area tab |
| 22 | `/dashboard/settings` | `app/dashboard/settings/page.tsx` | Call handling rules, business hours, AI config |
| 23 | `/dashboard/account-settings` | `app/dashboard/account-settings/page.tsx` | User profile settings |
| 24 | `/dashboard/usage` | `app/dashboard/usage/page.tsx` | Usage analytics with progress bars |
| 25 | `/dashboard/billing` | `app/dashboard/billing/page.tsx` | Billing overview |
| 26 | `/dashboard/billing/plans` | `app/dashboard/billing/plans/page.tsx` | Plan comparison + upgrade flow |
| 27 | `/dashboard/billing/payment-method` | `app/dashboard/billing/payment-method/page.tsx` | Payment method management (Stripe Elements) |
| 28 | `/dashboard/billing/invoices` | `app/dashboard/billing/invoices/page.tsx` | Invoice history list |
| 29 | `/dashboard/payments` | `app/dashboard/payments/page.tsx` | Customer payment records (Stripe Connect) |
| 30 | `/dashboard/notifications` | `app/dashboard/notifications/page.tsx` | Notification center |
| 31 | `/dashboard/flagged-questions` | `app/dashboard/flagged-questions/page.tsx` | Unanswered question review queue |

### 1.5 Admin Panel

| # | Route | File | Description |
|---|-------|------|-------------|
| 32 | `/admin` | `app/admin/page.tsx` | System stats, top companies table, recent activity |
| 33 | `/admin/login` | `app/admin/login/page.tsx` | Admin-specific login |
| 34 | `/admin/companies` | `app/admin/companies/page.tsx` | Company list with management actions |
| 35 | `/admin/companies/[id]` | `app/admin/companies/[id]/page.tsx` | Company detail view |
| 36 | `/admin/users` | `app/admin/users/page.tsx` | User management |
| 37 | `/admin/customers` | `app/admin/customers/page.tsx` | Customer management |
| 38 | `/admin/calls` | `app/admin/calls/page.tsx` | Global call log |
| 39 | `/admin/calls/[id]` | `app/admin/calls/[id]/page.tsx` | Call detail |
| 40 | `/admin/appointments` | `app/admin/appointments/page.tsx` | Global appointments |
| 41 | `/admin/knowledge` | `app/admin/knowledge/page.tsx` | Knowledge management |
| 42 | `/admin/usage` | `app/admin/usage/page.tsx` | System-wide usage metrics |
| 43 | `/admin/subscriptions` | `app/admin/subscriptions/page.tsx` | Subscription management |
| 44 | `/admin/settings` | `app/admin/settings/page.tsx` | Admin settings |

### 1.6 Public / Token-Based

| # | Route | File | Description |
|---|-------|------|-------------|
| 45 | `/book/[token]` | `app/book/[token]/page.tsx` | Public booking form with payment, reschedule, cancel |

### 1.7 API Routes

| # | Route | File | Description |
|---|-------|------|-------------|
| 46 | `/api/auth/[...nextauth]` | `app/api/auth/[...nextauth]/route.ts` | NextAuth handlers |
| 47 | `/api/proxy/[...path]` | `app/api/proxy/[...path]/route.ts` | BFF proxy to backend |

---

## 2. Component Inventory

### 2.1 UI Primitives (shadcn/ui + Radix)

| Component | File | Variants | Notes |
|-----------|------|----------|-------|
| **Button** | `components/ui/button.tsx` | default, destructive, outline, secondary, ghost, link × default, sm, lg, icon | CVA-based, full a11y |
| **Input** | `components/ui/input.tsx` | — | Styled with focus ring, disabled states |
| **Label** | `components/ui/label.tsx` | — | Radix Label primitive |
| **Textarea** | `components/ui/textarea.tsx` | — | Multi-line input |
| **Select** | `components/ui/select.tsx` | — | Radix Select with trigger, content, item |
| **Card** | `components/ui/card.tsx` | — | Header, Title, Description, Content, Footer sub-components |
| **Dialog** | `components/ui/dialog.tsx` | — | Radix Dialog with overlay, animations |
| **Avatar** | `components/ui/avatar.tsx` | — | Image + fallback |
| **Badge** | `components/ui/badge.tsx` | — | Inline tag/label |
| **Dropdown Menu** | `components/ui/dropdown-menu.tsx` | — | Radix Dropdown with items, separators |
| **Toast** | `components/ui/toast.tsx` | — | Notification toasts |
| **Toaster** | `components/ui/toaster.tsx` | — | Toast container/provider |
| **Logo** | `components/ui/logo.tsx` | words, icon | SVG logo component |

### 2.2 Marketing Components

| Component | File | Purpose |
|-----------|------|---------|
| **SiteHeader** | `components/marketing/site-header.tsx` | Top nav: logo, links (Pricing, Contact), Login, CTA button. Configurable via props: `ctaLabel`, `ctaHref`, `hideLogin` |
| **SiteFooter** | `components/marketing/site-footer.tsx` | Footer with link groups, company info |
| **FadeIn** | `components/marketing/fade-in.tsx` | Intersection Observer-based entrance animation. Props: `delay`, `duration`, `direction` (up/down/left/right) |
| **AnimatedCounter** | `components/marketing/animated-counter.tsx` | Number counter animation for statistics (requestAnimationFrame-based) |

### 2.3 Portal / Dashboard Components

| Component | File | Purpose |
|-----------|------|---------|
| **PageHeader** | `components/portal/page-header.tsx` | Section header with eyebrow tag, title, subtitle, action buttons |
| **SectionCard** | `components/portal/section-card.tsx` | Reusable content card for dashboard sections |
| **EmptyState** | `components/portal/empty-state.tsx` | Empty state with icon, title, description, action |

### 2.4 Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| **AdminNav** | `components/admin/admin-nav.tsx` | Admin navigation bar |
| **AdminSidebar** | `components/admin/admin-sidebar.tsx` | Admin sidebar with nav links |
| **CompanySwitcher** | `components/admin/company-switcher.tsx` | Company context switcher dropdown |
| **CreateCompanyDialog** | `components/admin/create-company-dialog.tsx` | Dialog form for creating companies |
| **CreateUserDialog** | `components/admin/create-user-dialog.tsx` | Dialog form for creating users |
| **DeleteConfirmDialog** | `components/admin/delete-confirm-dialog.tsx` | Destructive action confirmation |

### 2.5 Feature Components

| Component | File | Purpose |
|-----------|------|---------|
| **ProfileDropdown** | `components/profile-dropdown.tsx` | User avatar menu with profile, settings, logout |
| **NotificationBell** | `components/notifications/notification-bell.tsx` | Bell icon with unread count, popover list |
| **AudioPlayer** | `components/audio-player.tsx` | Custom audio playback for call recordings |
| **CallForwardingGuide** | `components/telephony/call-forwarding-guide.tsx` | Step-by-step call forwarding setup |
| **OnboardingContext** | `components/onboarding/onboarding-context.tsx` | React Context for multi-step onboarding state |

### 2.6 Provider Components

| Component | File | Purpose |
|-----------|------|---------|
| **SessionProvider** | `components/providers/session-provider.tsx` | NextAuth session wrapper |
| **AmplifyProvider** | `components/providers/amplify-provider.tsx` | AWS Amplify config wrapper |

---

## 3. Style Tokens

> **Current Direction Update:** Standardize toward a landing-page-consistent system:
> white/slate surfaces, subtle borders, minimal emerald accents, and no decorative gradient/glow treatments.

### 3.1 Color Palette

#### CSS Custom Properties (HSL)

```css
/* Light Theme (default) */
--background: 0 0% 100%;         /* White */
--foreground: 222 47% 11%;       /* Slate-900 */
--card: 0 0% 100%;               /* White */
--card-foreground: 160 18% 12%;  /* Dark blue-gray */
--popover: 0 0% 100%;            /* White */
--popover-foreground: 160 18% 12%;
--primary: 160 84% 34%;          /* Emerald green — #059669 */
--primary-foreground: 0 0% 100%; /* White */
--secondary: 160 20% 96%;        /* Light blue-gray */
--secondary-foreground: 160 30% 20%;
--muted: 160 22% 94%;            /* Muted gray-teal */
--muted-foreground: 160 10% 40%;
--accent: 210 20% 96%;           /* Slate-100 */
--accent-foreground: 222 47% 11%;
--destructive: 0 84% 60%;        /* Red */
--destructive-foreground: 0 0% 100%;
--border: 214 32% 91%;           /* Slate-200 */
--input: 214 32% 91%;            /* Slate-200 */
--ring: 160 84% 34%;             /* Emerald focus ring */
--radius: 0.75rem;               /* 12px */
```

#### Tailwind Utility Colors (in active use)

| Color Scale | Usage | Shades Used |
|------------|-------|-------------|
| `emerald` | Primary actions, selected/active states, links | 50, 100, 600, 700 |
| `slate` | Neutrals, backgrounds, text, borders | 50, 100, 200, 400, 500, 600, 700, 900 |
| `red` | Errors, destructive actions, warnings | 50, 200, 600, 700 |
| `amber` | Warnings, usage alerts (75%+ threshold) | 400, 500, 600 |
| `blue` | Informational badges (limited) | 600 |
| `violet` | Avoid in new UI unless product-critical | 600 |
| `green` | Success indicators | 500, 600 |
| `white` | Card backgrounds, text on primary | — |

### 3.2 Typography

| Token | Value | CSS Variable |
|-------|-------|-------------|
| Display font | Space Grotesk (Google Fonts) | `--font-display` |
| Sans/body font | Manrope (Google Fonts) | `--font-sans` |
| Heading letter-spacing | -0.02em | Inline styles |
| Heading weight | 600–700 (semibold–bold) | Tailwind `font-semibold` / `font-bold` |
| Body weight | 400–500 (regular–medium) | Tailwind `font-normal` / `font-medium` |
| Text rendering | Antialiased | `-webkit-font-smoothing: antialiased` |

#### Font Size Usage (Tailwind)

| Class | Size | Typical Usage |
|-------|------|--------------|
| `text-5xl` / `text-6xl` | 3rem / 3.75rem | Hero headlines |
| `text-3xl` / `text-4xl` | 1.875rem / 2.25rem | Section titles |
| `text-xl` / `text-2xl` | 1.25rem / 1.5rem | Card titles, subtitles |
| `text-lg` | 1.125rem | Subheadings |
| `text-base` | 1rem | Body text |
| `text-sm` | 0.875rem | Secondary text, labels |
| `text-xs` | 0.75rem | Captions, badges |

### 3.3 Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| Border radius | 0.75rem (12px) | Default `--radius` |
| Container max-width | 1400px | Tailwind `max-w-screen-2xl` |
| Section padding | 2rem–4rem | Page sections |
| Card padding | 1rem–1.5rem | Inner card content |
| Grid gap | 1rem–2rem | Dashboard grids |
| Sidebar width | ~16rem (256px) | Dashboard sidebar (estimated) |

### 3.4 Shadows

| Usage | Tailwind Class |
|-------|---------------|
| Cards | `shadow-sm` |
| Dropdowns/popovers | `shadow-md` / `shadow-lg` |
| Hero glows | Deprecated in current UI direction |

### 3.5 Animations

| Animation | Mechanism | Usage |
|-----------|-----------|-------|
| `fade-in` / `fade-up` | FadeIn component (Intersection Observer) | Marketing page sections |
| Counter animation | AnimatedCounter (requestAnimationFrame) | Stats strip numbers |
| `animate-pulse` | Tailwind built-in | Loading skeletons |
| `animate-spin` | Tailwind built-in | Loading spinners |
| `animate-ping` | Tailwind built-in | Live indicator dots |
| `accordion-down/up` | Custom keyframes in globals.css | Accordion open/close |
| Hover transitions | `transition-colors`, `transition-all` | Buttons, links, nav items |

---

## 4. Inconsistencies & UI Tech Debt

### 4.1 Design Inconsistencies

| Issue | Details | Severity |
|-------|---------|----------|
| **Color mixing** | Some components use Tailwind color classes directly (`emerald-600`, `slate-200`) instead of semantic CSS variables (`hsl(var(--primary))`) | Medium |
| **Dark mode gap** | CSS variables for dark theme are defined but not used; components hardcode light-mode classes | Low (not needed yet) |
| **Border radius inconsistency** | Most cards use `rounded-2xl` (16px) while `--radius` token is `0.75rem` (12px) | Low |
| **Font weight inconsistency** | Some headings use `font-bold` (700), others `font-semibold` (600) without clear hierarchy rules | Low |
| **Spacing inconsistency** | Section padding varies between `py-16`, `py-20`, `py-24` across marketing sections | Low |

### 4.2 Component Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| **No Table component** | Data tables built inline per page | Should extract shared DataTable with sorting/filtering |
| **No Tabs component** | Knowledge page uses custom tab implementation | Radix Tabs primitive should be added |
| **No Skeleton/Loading component** | Some pages use `animate-pulse` divs, others show nothing | Need consistent loading states |
| **No Pagination component** | Backend supports pagination but no shared UI | Contacts, calls use cursor-based but no UI |
| **No Date Picker** | Appointments use native inputs | Should add date picker component |
| **No Search Input** | Each page implements its own search bar | Should extract shared SearchInput |
| **No Breadcrumbs** | Deep pages lack navigation context | Useful for admin drill-downs |
| **No Confirmation Dialog** | Only admin has DeleteConfirmDialog | Need shared generic version |
| **No Stat Card** | Dashboard builds stat cards inline | Should extract reusable StatCard |

### 4.3 Layout / UX Debt

| Issue | Details |
|-------|---------|
| **No audience separation** | Landing page targets pros exclusively; no consumer path |
| **Pricing visible to all** | Should be under /pros only in expanded version |
| **Auth has no role selection** | Login/register assumes OWNER; no "Join as a customer" option |
| **Onboarding is pro-only** | No customer onboarding flow |
| **Mobile sidebar** | Hamburger menu exists but mobile UX is basic |
| **No breadcrumb navigation** | Deep pages (admin company detail, call detail) lack context |
| **No global search** | No omni-search for finding contacts, calls, appointments quickly |
| **No keyboard shortcuts** | Power users can't navigate efficiently |
| **No toast types** | Toast component exists but success/error/warning variants aren't strongly differentiated |

### 4.4 Performance Considerations

| Area | Status |
|------|--------|
| **SSR/ISR** | App Router uses server components by default; marketing pages would benefit from static generation |
| **Image optimization** | Only logo SVGs in `/public/images`; no next/image optimization for marketing visuals |
| **Bundle size** | Recharts, Stripe, Amplify could increase bundle; needs code splitting analysis |
| **Font loading** | Google Fonts loaded via next/font (good); no font-display swap issues observed |
| **API proxy overhead** | BFF proxy at `/api/proxy` adds latency vs direct API calls; trade-off for cookie-based auth |

### 4.5 Accessibility

| Area | Status |
|------|--------|
| **Radix primitives** | Good — proper ARIA attributes, keyboard navigation |
| **Form labels** | Present via Label component |
| **Color contrast** | Emerald-on-white (#059669 on #FFF) passes AA for large text but may be borderline for small text |
| **Focus indicators** | Ring style defined (`--ring`) and used |
| **Screen reader text** | Not systematically added; some icons lack sr-only labels |
| **Skip navigation** | Not implemented |
| **Reduced motion** | Not explicitly handled |

---

## 5. Tailwind Configuration Summary

```typescript
// tailwind.config.ts (key settings)
{
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT, foreground },
        secondary: { DEFAULT, foreground },
        destructive: { DEFAULT, foreground },
        muted: { DEFAULT, foreground },
        accent: { DEFAULT, foreground },
        popover: { DEFAULT, foreground },
        card: { DEFAULT, foreground },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', ...defaultFontFamily],
        display: ['var(--font-display)', ...defaultFontFamily],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

---

## 6. State Management Inventory

| Store / Context | Technology | Scope |
|----------------|-----------|-------|
| `auth-store.ts` | Zustand | Global auth state: user, company, tokens, role |
| `admin-company-store.ts` | Zustand | Admin company selection context |
| `onboarding-context.tsx` | React Context | Multi-step onboarding form state |
| NextAuth session | NextAuth/Cookies | Server-side session management |

---

## 7. API Client Pattern

The web frontend uses a **BFF (Backend For Frontend)** pattern:

1. All API calls go to `/api/proxy/[...path]` (Next.js API route)
2. Proxy forwards requests to `NEXT_PUBLIC_API_URL` (backend)
3. Session cookies provide authentication (no direct JWT in client)
4. Admin requests inject `x-company-id` header for company switching
5. 401 responses trigger automatic logout

Key client methods are in `lib/api-client.ts` covering all backend endpoints.
