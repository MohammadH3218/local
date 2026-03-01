# HandyCall.ai — Frontend Design System & Strategy

> Comprehensive design system spec for the expanded platform: consumer marketplace + pro business OS + customer portal.

> **Update (Current UI Direction):** This spec now follows the landing-page style baseline:
> white/slate-first surfaces, sparse emerald accents, no decorative gradients/glows, and consistent iconography.

---

## 1. Design Principles

### 1.1 Core Principles

1. **Clarity over cleverness** — Every screen should communicate its purpose within 3 seconds. No mystery meat navigation, no ambiguous icons.
2. **Two audiences, one brand** — Customers and pros share the same visual language but see different content hierarchies. The brand is HandyCall, not two separate products.
3. **Density where needed, space where expected** — Pro dashboards can be information-dense (they use it daily). Consumer pages need breathing room and trust cues.
4. **Progressive disclosure** — Don't overwhelm. Show essentials first, reveal complexity on demand (expand, click-through, modals).
5. **Mobile-capable, desktop-designed** — The web app is desktop-first for pros (complex dashboards). Consumer flows must be fully mobile-functional.
6. **No AI slop** — Every visual, illustration, and animation should feel intentional. Avoid generic "techy" aesthetics. The brand is practical, trustworthy, modern.

### 1.2 Visual Identity (Existing Brand — Maintained)

| Attribute | Value |
|-----------|-------|
| Primary color | Emerald green (#059669 / `hsl(160, 84%, 34%)`) |
| Brand feel | Professional, trustworthy, modern, approachable |
| Tone | Confident but not corporate; clear but not sterile |
| Logo | Green icon (phone + wrench motif) + "HandyCall" wordmark |
| Fonts | Space Grotesk (display), Manrope (body) |

---

## 2. Color System (Current Baseline)

### 2.1 Semantic Color Tokens

Building on the existing CSS custom property system, extend with semantic tokens:

```css
/* Core */
--primary: 160 84% 34%;          /* Emerald #059669 (CTA only) */
--primary-foreground: 0 0% 100%;
--background: 0 0% 100%;         /* White */
--foreground: 222 47% 11%;       /* Slate-900-ish */

/* Status colors (formalize existing usage) */
--success: 142 71% 45%;             /* Green-500 */
--warning: 38 92% 50%;              /* Amber-500 */
--info: 217 91% 60%;                /* Blue-500 */
--error: 0 84% 60%;                 /* Red-500 (existing destructive) */

/* Surface hierarchy */
--surface-0: 0 0% 100%;             /* White */
--surface-1: 210 20% 98%;           /* Slate-50 */
--surface-2: 210 17% 95%;           /* Slate-100 */
--surface-3: 210 16% 90%;           /* Slate-200 */

/* Text hierarchy */
--text-primary: 222 47% 11%;        /* Slate-900 */
--text-secondary: 215 16% 47%;      /* Slate-600 */
--text-tertiary: 215 14% 60%;       /* Slate-500 */
--text-disabled: 215 14% 70%;
```

### 2.2 Color Usage Rules

| Context | Color | Notes |
|---------|-------|-------|
| Primary CTAs | `--primary` (emerald-600) | "Get Started", "Book Now", "Save" |
| Secondary CTAs | `--secondary` | "Learn More", "View All" |
| Destructive | `--destructive` (red) | "Delete", "Cancel Subscription" |
| Links | `--primary` | Underline on hover only |
| Success | `--success` | Completed appointments, payments received |
| Warning | `--warning` | Usage at 75%+, pending items |
| Error | `--error` | Failed payments, blocked features |
| Backgrounds | `--surface-0` to `--surface-2` | White/slate layering only |
| Borders | `--border` | 1px solid, consistent everywhere |

### 2.3 Hard Rules
- No decorative gradient sections for standard content blocks
- No glow/blur background effects
- No colored icon containers by default (use bordered neutral containers)
- Emerald is reserved for actions, links, and active/selection emphasis

### 2.4 Iconography

- Standard icon library: **Tabler Icons** (`@tabler/icons-react`)
- Default stroke: `1.5`
- Avoid mixing icon systems within the same page
- Prefer neutral icon containers (`border-slate-200`, `bg-white`/`bg-slate-50`)

---

## 3. Typography System

### 3.1 Type Scale

| Name | Size | Line Height | Weight | Font | Usage |
|------|------|-------------|--------|------|-------|
| `display-xl` | 4rem (64px) | 1.1 | 700 | Space Grotesk | Hero headline (landing) |
| `display-lg` | 3rem (48px) | 1.15 | 700 | Space Grotesk | Section titles (marketing) |
| `display-md` | 2.25rem (36px) | 1.2 | 600 | Space Grotesk | Page titles |
| `heading-lg` | 1.5rem (24px) | 1.3 | 600 | Space Grotesk | Card titles, section headers |
| `heading-md` | 1.25rem (20px) | 1.4 | 600 | Space Grotesk | Sub-section headers |
| `heading-sm` | 1rem (16px) | 1.4 | 600 | Space Grotesk | Small headers, labels |
| `body-lg` | 1.125rem (18px) | 1.6 | 400 | Manrope | Marketing body text |
| `body-md` | 1rem (16px) | 1.5 | 400 | Manrope | Default body text |
| `body-sm` | 0.875rem (14px) | 1.5 | 400 | Manrope | Secondary text, table cells |
| `caption` | 0.75rem (12px) | 1.4 | 500 | Manrope | Timestamps, badges, fine print |
| `overline` | 0.75rem (12px) | 1.4 | 600 | Manrope | Eyebrow labels (uppercase, tracking +0.05em) |

### 3.2 Typography Rules

- **Headings**: Always Space Grotesk, letter-spacing `-0.02em`
- **Body**: Always Manrope, normal letter-spacing
- **Max line length**: 65–75 characters for body text (readability)
- **Heading hierarchy**: Never skip levels (h1 → h2 → h3)
- **No all-caps** except `overline` token
- **Bold emphasis**: Use `font-medium` (500) for emphasis in body, not `font-bold`

---

## 4. Layout Grid

### 4.1 Page Grid

```
Marketing pages:
┌─────────────────────────────────────────┐
│ SiteHeader (fixed, z-50)                │
├─────────────────────────────────────────┤
│ Container (max-w-7xl / 1280px, centered)│
│ ┌─────────────────────────────────────┐ │
│ │ Content area (px-4 sm:px-6 lg:px-8)│ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ SiteFooter                              │
└─────────────────────────────────────────┘

Dashboard (Pro):
┌────────┬────────────────────────────────┐
│ Sidebar│ Top Bar (notifications, profile)│
│ (256px)├────────────────────────────────┤
│ fixed  │ Content (padding: 2rem)        │
│        │ ┌────────────────────────────┐ │
│        │ │ PageHeader                 │ │
│        │ │ Content Grid               │ │
│        │ └────────────────────────────┘ │
└────────┴────────────────────────────────┘

Customer Portal:
┌─────────────────────────────────────────┐
│ PortalHeader (logo, nav tabs, profile)  │
├─────────────────────────────────────────┤
│ Container (max-w-5xl / 1024px, centered)│
│ ┌─────────────────────────────────────┐ │
│ │ Content (simpler, card-based)       │ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ Minimal Footer                          │
└─────────────────────────────────────────┘
```

### 4.2 Grid System

| Context | Grid | Gap | Notes |
|---------|------|-----|-------|
| Marketing hero | Single column, centered | — | Max-w-3xl for text |
| Feature grids | 2-col (mobile) → 4-col (desktop) | 1.5rem | Icon + title + description |
| Dashboard metrics | 2-col → 4-col responsive | 1rem | Stat cards |
| Dashboard content | 1-col or 2-col (sidebar + main) | 1.5rem | Context-dependent |
| Customer portal | 1-col, card stack | 1rem | Simple, scannable |
| Category grid | 2-col → 3-col → 4-col | 1rem | Category cards with icons |
| Search results | 1-col list | 0.5rem | Provider result cards |

### 4.3 Breakpoints (Existing Tailwind)

| Breakpoint | Width | Target |
|------------|-------|--------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1400px | Container max-width |

---

## 5. Component Specifications (New & Extended)

### 5.1 New Components Needed

#### SearchBar (Consumer Hero)

```
┌──────────────────────────────────────────────────┐
│ 🔍 What service do you need?  │  📍 City, ZIP  │ Search │
└──────────────────────────────────────────────────┘
```
- Two-field combo: service type (autocomplete) + location
- Prominent, rounded-full, shadowed
- Primary CTA button integrated
- Appears on: `/` hero, `/search` top

#### ProviderCard (Search Results)

```
┌────────────────────────────────────────────┐
│ [Avatar] Pro Name                    ★ 4.8 │
│          Plumbing · HVAC                   │
│          ✓ Verified · ⚡ Responds in 30m   │
│          "Great work, very professional"   │
│                                            │
│          [Request Quote]  [View Profile]   │
└────────────────────────────────────────────┘
```
- Horizontal card layout (list view)
- Photo + rating + categories + trust badges
- Two CTAs: primary (quote/book) + secondary (profile)

#### CategoryCard (Browse)

```
┌────────────────┐
│   [Icon/Illus] │
│                │
│  Plumbing      │
│  120 pros      │
└────────────────┘
```
- Square-ish card with illustration/icon, category name, pro count
- Hover: slight lift + emerald border

#### ReviewCard

```
┌────────────────────────────────────────────┐
│ ★★★★★  ·  2 days ago                      │
│                                            │
│ "They showed up on time and fixed the      │
│  issue quickly. Very professional."        │
│                                            │
│ — Sarah M.  ·  Plumbing repair             │
└────────────────────────────────────────────┘
```

#### StatCard (Dashboard — extracted from inline)

```
┌────────────────────────────┐
│ 📊 Active Leads            │
│                            │
│ 24                         │
│ ▲ 12% from last week       │
└────────────────────────────┘
```
- Icon + label + value + trend indicator
- Color-coded trend (green up, red down, gray neutral)

#### DataTable (Shared)

- Sortable columns
- Filterable headers
- Pagination (page numbers + next/prev)
- Empty state integration
- Loading skeleton rows
- Row actions (dropdown or inline)

#### Tabs (Radix-based)

- Horizontal tab list with underline active indicator
- Content panels with lazy loading
- Used for: knowledge base, settings sections, profile tabs

#### DatePicker

- Calendar popup for single date or range
- Integration with appointment scheduling
- Timezone-aware display

#### StepIndicator (Onboarding)

```
  ① Profile  ──  ② Services  ──  ③ Hours  ──  ④ AI Setup  ──  ⑤ Payments  ──  ⑥ Go Live
     ✓              ✓             ●              ○               ○              ○
```
- Horizontal step bar with numbered circles
- States: completed (check), active (filled), pending (outline)

### 5.2 Extended Existing Components

| Component | Extension |
|-----------|-----------|
| **Button** | Add `success` variant (green); add `loading` prop (spinner + disabled) |
| **Badge** | Add semantic color variants: `success`, `warning`, `error`, `info`, `neutral` |
| **Card** | Add `interactive` variant (hover lift, cursor pointer) for category/provider cards |
| **Dialog** | Add `size` prop: `sm`, `md`, `lg`, `xl` for different modal sizes |
| **Input** | Add `icon` prop for left/right icon slots (search, location pins) |
| **Toast** | Add `success`, `warning`, `error`, `info` variants with colored left border |

---

## 6. Navigation Patterns

### 6.1 Consumer Navigation

```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo] HandyCall    Find Services  Categories  How It Works      │
│                                                  For Pros  Login │
└──────────────────────────────────────────────────────────────────┘
```

- **Logo**: Links to `/`
- **Find Services**: Links to `/search`
- **Categories**: Links to `/categories`
- **How It Works**: Anchor to section on landing page
- **For Pros**: Links to `/pros` (separate landing)
- **Login**: Links to `/login` (customer default)
- **Mobile**: Hamburger → sheet with all links

### 6.2 Pro Navigation (Existing Dashboard Sidebar — Extended)

**Add to sidebar:**
- **Leads** (rename "Customers") — with unread count badge
- **Schedule** (rename "Appointments") — calendar icon
- **AI Settings** — voice + messaging config
- **Team** (new) — team member management
- **Reports** (new) — analytics and insights

### 6.3 Customer Portal Navigation

```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo] HandyCall    My Bookings  Messages  Payments  Account     │
│                                              [Notification Bell] │
└──────────────────────────────────────────────────────────────────┘
```

- Horizontal tab-style nav (not sidebar)
- Simpler than pro dashboard
- Bell icon for notifications

---

## 7. Content Strategy

### 7.1 Voice & Tone

| Audience | Tone | Example |
|----------|------|---------|
| **Customers** | Friendly, reassuring, direct | "Find trusted pros near you" |
| **Pros** | Professional, results-oriented, empowering | "Never miss a lead again" |
| **Both** | Confident, clear, no jargon | "Get started in minutes" |

### 7.2 Headline Formulas

**Customer-facing:**
- "[Benefit] + [Trust cue]" → "Find verified pros — read real reviews before you book"
- "[Action] + [Speed]" → "Book a plumber in under 2 minutes"
- "[Problem solved]" → "No more phone tag. Book services instantly."

**Pro-facing:**
- "[Pain point eliminated]" → "Never miss a call again"
- "[Result] + [Mechanism]" → "Fill your calendar with AI that answers every call"
- "[ROI statement]" → "Turn missed calls into booked jobs"

### 7.3 CTA Copy

| Context | Primary CTA | Secondary CTA |
|---------|------------|---------------|
| Consumer hero | "Find a Pro" | "How It Works" |
| Consumer search | "Request Quote" | "View Profile" |
| Pro hero | "Start Free Setup" | "See How It Works" |
| Pro pricing | "Start 14-Day Trial" | "Compare Plans" |
| Customer portal | "Book Again" | "Leave a Review" |
| Onboarding | "Continue" / "Next Step" | "Skip for Now" |

---

## 8. SEO Strategy (Marketing Pages)

### 8.1 URL Structure

```
/                           → "Home Services Near You | HandyCall"
/categories                 → "Browse Service Categories | HandyCall"
/categories/plumbing        → "Find Plumbers Near You | HandyCall"
/categories/hvac            → "HVAC Services & Repair | HandyCall"
/search?q=plumber&loc=...   → "Plumber in [City] | HandyCall"
/provider/[slug]            → "[Business Name] — Reviews & Booking | HandyCall"
/pros                       → "Grow Your Business with AI | HandyCall for Pros"
/pros/pricing               → "Pricing Plans for Pros | HandyCall"
/help                       → "Help Center | HandyCall"
```

### 8.2 Meta Tags Per Page Type

| Page Type | Title Pattern | Description Length |
|-----------|--------------|-------------------|
| Landing | "Home Services Near You — Book Trusted Pros | HandyCall" | 150–160 chars |
| Category | "Find [Category] Pros Near You | HandyCall" | 150 chars |
| Search | "[Category] in [City] — Compare & Book | HandyCall" | 155 chars |
| Provider | "[Name] — [Rating]★ [Category] | HandyCall" | 155 chars |
| Pro landing | "AI Receptionist for [Category] Businesses | HandyCall" | 155 chars |

### 8.3 Technical SEO

| Requirement | Implementation |
|-------------|---------------|
| Server-side rendering | Next.js App Router (RSC by default) |
| Static generation | Marketing pages → `generateStaticParams` for categories |
| Dynamic metadata | `generateMetadata()` per page |
| Sitemap | `app/sitemap.ts` → auto-generated XML |
| robots.txt | `app/robots.ts` |
| Structured data | JSON-LD: LocalBusiness, Service, Review, FAQ schemas |
| Canonical URLs | `<link rel="canonical">` per page |
| Open Graph | OG image, title, description for social sharing |
| Performance | Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1 |

### 8.4 Content Pages (SEO landing pages)

Create category-specific landing pages:
- `/categories/plumbing` → "Find Plumbers Near You"
- `/categories/hvac` → "HVAC Repair & Installation"
- `/categories/electrical` → "Electricians Near You"
- `/categories/pest-control` → "Pest Control Services"
- etc.

Each includes: category description, search bar, featured providers, FAQ section, trust badges.

---

## 9. Accessibility Standards (WCAG 2.1 AA)

### 9.1 Requirements

| Criterion | Requirement | Implementation |
|-----------|------------|----------------|
| **1.1.1** | All images have alt text | `next/image` alt prop required |
| **1.3.1** | Semantic HTML structure | Proper heading hierarchy, landmarks |
| **1.4.3** | Color contrast ≥ 4.5:1 (text) | Emerald #059669 on white = 4.6:1 (passes AA) |
| **1.4.11** | UI component contrast ≥ 3:1 | Border colors meet this |
| **2.1.1** | Keyboard navigable | Radix primitives handle this |
| **2.4.1** | Skip navigation link | Add `<a href="#main" class="sr-only focus:not-sr-only">` |
| **2.4.7** | Visible focus indicators | `--ring` token (emerald) |
| **2.5.5** | Target size ≥ 44×44px | Touch targets on mobile CTAs |
| **3.3.1** | Error identification | Form validation messages |
| **3.3.2** | Labels for inputs | Label component + htmlFor |

### 9.2 Implementation Checklist

- [ ] Add skip-to-content link on all pages
- [ ] Audit color contrast for all text/background combinations
- [ ] Add `aria-label` to icon-only buttons
- [ ] Add `role="status"` to toast notifications
- [ ] Implement `prefers-reduced-motion` media query
- [ ] Add `sr-only` text for decorative icons in navigation
- [ ] Test with screen reader (VoiceOver / NVDA)
- [ ] Ensure all modals trap focus
- [ ] Verify form error messages are associated via `aria-describedby`

---

## 10. Responsive Behavior

### 10.1 Breakpoint Strategy

| Breakpoint | Layout Changes |
|------------|---------------|
| `< 640px` (mobile) | Single column, hamburger nav, stacked cards, bottom CTA bar |
| `640–768px` (tablet) | 2-column grids, expanded nav, side-by-side cards |
| `768–1024px` (small desktop) | Sidebar visible (dashboard), 3-column grids |
| `1024px+` (desktop) | Full layout, 4-column grids, fixed sidebar |

### 10.2 Mobile-Specific Patterns

| Pattern | Implementation |
|---------|---------------|
| Bottom navigation | Customer portal on mobile: tab bar at bottom |
| Sheet modals | Filters, sort options → bottom sheet on mobile |
| Sticky CTA | Booking flow → fixed bottom "Book Now" button |
| Touch-friendly | Minimum 44px touch targets, generous padding |
| Image lazy loading | `next/image` with priority on above-fold |

---

## 11. Performance Strategy

### 11.1 Rendering Strategy Per Route

| Route Pattern | Strategy | Reason |
|---------------|----------|--------|
| `/` (landing) | SSG (static) | SEO + fast load, rebuild on deploy |
| `/categories/*` | SSG | SEO, limited dynamic content |
| `/search` | SSR | Dynamic results based on query |
| `/provider/[id]` | ISR (60s) | SEO + semi-dynamic (reviews update) |
| `/pros` | SSG | Marketing page |
| `/dashboard/*` | CSR (client) | Authenticated, real-time data |
| `/account/*` | CSR (client) | Authenticated |
| `/book/[token]` | SSR | Token validation needed |

### 11.2 Bundle Optimization

| Optimization | Method |
|-------------|--------|
| Code splitting | Dynamic imports for heavy pages (Recharts, Stripe) |
| Tree shaking | Import specific Lucide icons, not full library |
| Image optimization | `next/image` with WebP/AVIF, responsive srcset |
| Font optimization | `next/font` (already used), font-display: swap |
| Third-party loading | Stripe.js loaded only on payment pages |
| API data caching | React Query or SWR for dashboard data (stale-while-revalidate) |

---

## 12. Design Token Summary (Tailwind Extension)

### New Tailwind Config Additions

```typescript
// Additional theme extensions for expansion
{
  extend: {
    colors: {
      // Existing tokens (keep)
      // Add semantic status colors
      success: { DEFAULT: '#22C55E', light: '#F0FDF4', dark: '#15803D' },
      warning: { DEFAULT: '#F59E0B', light: '#FFFBEB', dark: '#B45309' },
      info: { DEFAULT: '#3B82F6', light: '#EFF6FF', dark: '#1D4ED8' },
      // Surface hierarchy
      surface: {
        0: '#FFFFFF',
        1: 'hsl(150, 40%, 98%)',
        2: 'hsl(160, 20%, 96%)',
        3: 'hsl(160, 15%, 93%)',
      },
    },
    spacing: {
      // Dashboard sidebar
      'sidebar': '16rem',  // 256px
      // Container gutters
      'gutter': '2rem',
    },
    maxWidth: {
      // Content containers
      'prose': '65ch',       // Optimal reading width
      'content': '80rem',   // 1280px
      'narrow': '64rem',    // 1024px (customer portal)
    },
    animation: {
      'fade-in': 'fadeIn 0.5s ease-out',
      'fade-up': 'fadeUp 0.5s ease-out',
      'slide-in': 'slideIn 0.3s ease-out',
      'scale-in': 'scaleIn 0.2s ease-out',
    },
  },
}
```

---

## 13. Page Templates

### 13.1 Marketing Page Template

```
[SiteHeader]
  [Hero Section]
    [Headline] + [Subheadline]
    [SearchBar or CTA]
    [Trust badges]
  [Social Proof Strip]
    [Stat] [Stat] [Stat] [Stat]
  [Features Section]
    [Feature Cards Grid]
  [How It Works]
    [Step 1] → [Step 2] → [Step 3]
  [Testimonials]
    [ReviewCard] [ReviewCard] [ReviewCard]
  [Final CTA]
    [Headline] + [Button]
[SiteFooter]
```

### 13.2 Dashboard Page Template

```
[DashboardLayout]
  [Sidebar]
  [TopBar]
  [PageHeader]
    [Eyebrow] [Title] [Subtitle]
    [Actions: Button, Dropdown]
  [Content]
    [FilterBar (optional)]
    [DataTable or CardGrid]
    [Pagination]
  [EmptyState (conditional)]
```

### 13.3 Customer Portal Page Template

```
[PortalHeader]
  [TabNav: Bookings | Messages | Payments | Account]
[Content Container (max-w-narrow)]
  [PageTitle]
  [Card Stack]
    [BookingCard / PaymentCard / MessageCard]
  [EmptyState (conditional)]
[MinimalFooter]
```
