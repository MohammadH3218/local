# HandyCall.ai — Marketing Pages Plan

> Detailed layout, copywriting, and section-by-section specifications for all marketing pages. Thumbtack-inspired, non-derivative.

> **Current Style Alignment (Required):** Match the live landing-page language:
> white/slate-first UI, subtle borders, minimal emerald accents, no glow/blur effects, no heavy gradient sections.

---

## 1. Top Navigation (Shared Across Marketing Pages)

### Consumer Default Navigation

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Logo+Wordmark]   Find Services   Categories   How It Works   │  For Pros  │  Log In  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Logo links to `/`
- "Find Services" → `/search`
- "Categories" → `/categories`
- "How It Works" → scrolls to section on landing (or `/how-it-works` standalone)
- "For Pros" → `/pros` (separate visual treatment: outlined badge or muted text)
- "Log In" → `/login` (ghost button style)
- **Mobile:** Hamburger → slide-out sheet with all links + prominent "Find a Pro" CTA

### Pro Navigation (on `/pros/*` pages)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Logo+Wordmark]   Features   Pricing   │  For Customers  │  Pro Login  │  Get Started  │
└──────────────────────────────────────────────────────────────────────────┘
```

- "Features" → anchor scroll on `/pros`
- "Pricing" → `/pros/pricing`
- "For Customers" → `/` (reverse of consumer nav)
- "Pro Login" → `/pros/login` (ghost)
- "Get Started" → `/register?audience=pro` (primary button, emerald)

---

## 2. Home Landing Page (`/`) — Consumer-First

### Section 1: Hero

**Layout:**
```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│               Home services, handled.                                  │
│                                                                        │
│      Find trusted pros near you — read reviews, compare,              │
│      and book in minutes.                                              │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │ 🔍 What do you need help with?    │  📍 ZIP or City    │ Search │  │
│   └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│   Popular: Plumbing · Electrical · HVAC · Cleaning · Pest Control     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Copy:**
- Headline: **"Home services, handled."**
- Subheadline: "Find trusted pros near you — read reviews, compare, and book in minutes."
- Search placeholder left: "What do you need help with?"
- Search placeholder right: "ZIP code or city"
- CTA button: "Search"
- Popular links: clickable, pre-fill search

**Design Notes:**
- Clean white/slate background (no busy imagery)
- Headline: `display-xl` (64px), Space Grotesk, bold
- Subheadline: `body-lg` (18px), Manrope, slate-600
- SearchBar: max-w-2xl, centered, subtle border + minimal shadow, rounded-xl
- Popular tags: `caption` size, slate-500, underline on hover

### Section 2: Trust Strip

```
┌────────────────────────────────────────────────────────────────────────┐
│  ✓ 2,500+ Verified Pros  │  ★ 4.8 Avg Rating  │  ⚡ 30min Avg Reply  │  🛡️ Satisfaction Guarantee │
└────────────────────────────────────────────────────────────────────────┘
```

**Design:** Horizontal strip, slate-50 background, 4 items evenly spaced with icons + numbers + label. AnimatedCounter for numbers.

### Section 3: Category Shortcuts

**Headline:** "What can we help you with?"

```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│[Plumbing]│ │[Electric]│ │[ HVAC  ]│ │[Cleaning]│
│  icon    │ │  icon    │ │  icon    │ │  icon    │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│[  Pest  ]│ │[Landscap]│ │[Roofing]│ │[Painting]│
│  icon    │ │  icon    │ │  icon    │ │  icon    │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

**Design:** 2-row × 4-col grid (responsive: 2-col on mobile). CategoryCards with neutral icon container + name. Hover: slate border darkening + slight lift. Links to `/categories/[slug]`.

### Section 4: How It Works

**Headline:** "Book a pro in 3 easy steps"

```
    ① Search               ② Compare               ③ Book
    [Icon: magnifier]       [Icon: checklist]        [Icon: calendar]

    Tell us what you        Browse ratings,           Pick your time
    need and where.         reviews, and              and confirm.
                            availability.             Done.
```

**Design:** 3-column (stacked on mobile). Numbered circles use slate/emerald only for active emphasis. Icon above, bold step title, 1-line description below. Connecting dotted line between steps (desktop only).

### Section 5: Featured Providers / Popular Services

**Headline:** "Top-rated pros in your area"
**Subheadline:** "Based on reviews, response time, and booking history"

3–4 ProviderCards in a horizontal scroll (mobile) or row (desktop). Each shows:
- Avatar/photo
- Name + rating
- Categories served
- "View Profile" link

**Note:** This section requires location detection (browser geolocation or IP) to show relevant results. Fallback: show nationally top-rated or generic "Popular services."

### Section 6: AI-Powered Experience (Differentiator)

**Headline:** "Every call answered. Every lead captured."
**Subheadline:** "Our AI handles calls for pros 24/7 — so customers always get a response."

```
┌──────────────────────────────────────────────────────────────┐
│  [Illustration: phone call flowing into calendar + SMS]      │
│                                                              │
│  ✓ Instant responses — no more phone tag                    │
│  ✓ Automatic scheduling — book directly from the call       │
│  ✓ SMS confirmations — customers stay informed              │
│  ✓ After-hours coverage — never miss a job                  │
└──────────────────────────────────────────────────────────────┘
```

**Design:** Two-column layout (illustration left, bullet points right). White/slate-50 section with bordered content card. This section bridges consumer and pro value — shows customers WHY response times are fast.

### Section 7: Testimonials

**Headline:** "What customers are saying"

3 ReviewCards in a row:
```
┌──────────────────────────┐
│ ★★★★★                    │
│ "Found a plumber in 10   │
│  minutes. Best service." │
│                          │
│ — Maria K., Austin TX    │
│   Plumbing repair        │
└──────────────────────────┘
```

**Design:** White cards on slate-50 background, subtle shadow. Star ratings in amber. Quote in `body-md`. Attribution in `caption`.

### Section 8: Pro CTA Banner

**Purpose:** Catch pros who land on the consumer page.

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Bordered white/slate card]                                           │
│                                                                        │
│  Are you a service pro?                                                │
│  Grow your business with AI-powered call handling,                     │
│  automatic booking, and a full business dashboard.                     │
│                                                                        │
│                    [ Learn More → ]                                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Design:** Centered bordered card (`bg-white`, `border-slate-200`) on neutral section background. "Learn More" links to `/pros`. Keep visuals minimal.

### Section 9: Final CTA

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│       Ready to get something fixed?                                    │
│                                                                        │
│   ┌────────────────────────────────────────────────┐                  │
│   │ 🔍 What do you need?     │ 📍 Location │ Search │                  │
│   └────────────────────────────────────────────────┘                  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Copy:** Headline: "Ready to get something fixed?" — same SearchBar as hero, reinforcing action.

---

## 3. Footer (All Pages)

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Logo] HandyCall                                                      │
│                                                                        │
│  For Customers        For Pros            Company          Legal       │
│  Find Services        How It Works        About            Terms       │
│  Categories           Pricing             Contact          Privacy     │
│  How It Works         Features            Help Center                  │
│  Help                 Sign Up                                          │
│                                                                        │
│  ───────────────────────────────────────────────────────────────────── │
│  © 2026 HandyCall, Inc.  All rights reserved.                         │
└────────────────────────────────────────────────────────────────────────┘
```

**Design:** slate-900 background, white/slate-400 text. 4-column grid (2-col on mobile). Logo top-left. Copyright bottom.

---

## 4. Pro Landing Page (`/pros`)

### Section 1: Hero

**Layout:**
```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│         Never miss a call again.                                       │
│                                                                        │
│    AI answers your phone, qualifies leads, and books                   │
│    appointments — while you focus on the job.                          │
│                                                                        │
│         [ Start Free Setup ]    [ See How It Works ]                   │
│                                                                        │
│    ┌────────────────────────────────────────────────────┐             │
│    │  [Hero illustration: phone call → AI → calendar]   │             │
│    └────────────────────────────────────────────────────┘             │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Copy:**
- Headline: **"Never miss a call again."**
- Subheadline: "AI answers your phone, qualifies leads, and books appointments — while you focus on the job."
- Primary CTA: "Start Free Setup" (emerald button)
- Secondary CTA: "See How It Works" (outline button)

### Section 2: Pain Points

**Headline:** "Sound familiar?"

3-column grid:
```
📵 Missed calls = missed money        📋 Manual scheduling burns hours       📱 Texts at midnight? No thanks.
"78% of customers call the next pro    "You're on the job. You can't stop     "After hours, calls pile up.
 if you don't answer."                  to book every inquiry."                 You can't work 24/7."
```

**Design:** Each pain point: icon + bold statement + supporting stat/quote. Slate-50 background.

### Section 3: How It Works (Pro-Specific)

**Headline:** "AI that runs your front desk"

4-step horizontal flow:
```
① Call comes in → ② AI answers professionally → ③ Qualifies the lead → ④ Books the appointment
```

Each step: icon + title + 2-line description. Emerald numbered circles. Connecting arrow between steps.

### Section 4: Feature Highlights

**Headline:** "Everything you need to grow"

```
┌─────────────────────┐ ┌─────────────────────┐
│ 📞 AI Call Handling  │ │ 📅 Smart Scheduling  │
│ Every call answered, │ │ Real-time calendar    │
│ leads captured, 24/7.│ │ synced to your phone. │
├─────────────────────┤ ├─────────────────────┤
│ 💬 Auto Messaging    │ │ 📊 Business Dashboard │
│ SMS confirmations,   │ │ Leads, revenue, calls │
│ follow-ups, reviews. │ │ — all in one place.   │
├─────────────────────┤ ├─────────────────────┤
│ 💰 Payments          │ │ 🧠 Knowledge Base     │
│ Collect payments via │ │ Teach your AI about   │
│ booking links.       │ │ your services & rules.│
└─────────────────────┘ └─────────────────────┘
```

**Design:** 2×3 grid of feature cards. Each: icon + bold title + 2-line description. White cards with subtle border.

### Section 5: Live Demo

**Headline:** "Hear it in action"

Embed the existing live call demo widget from the current landing page. Audio player with transcript side-by-side.

### Section 6: Pricing Preview

**Headline:** "Plans that grow with your business"
**Subheadline:** "Start free. Upgrade when you're ready."

3 plan cards (abbreviated — link to `/pros/pricing` for full details):
```
Starter $19.99/mo    Pro $39.99/mo         Max $99.99/mo
100 min · 200 SMS    300 min · 600 SMS     750 min · 1500 SMS
                     14-day free trial      Priority support
```

CTA: "Compare All Plans →" links to `/pros/pricing`

### Section 7: Social Proof

**Headline:** "Trusted by service businesses"

3 testimonial cards (pro-focused):
```
"I was losing 5+ calls a day. Now every call is answered and I've doubled my bookings."
— Jake R., Plumbing Pro, Phoenix AZ
```

### Section 8: Final CTA

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Emerald gradient background]                                         │
│                                                                        │
│     Ready to fill your calendar?                                       │
│     Set up in under 10 minutes. No credit card required.              │
│                                                                        │
│              [ Start Free Setup ]                                      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pro Pricing Page (`/pros/pricing`)

### Layout

```
Headline: "Simple, transparent pricing"
Subheadline: "All plans include AI call answering, CRM, and scheduling."

┌─────────────┐  ┌─────────────────┐  ┌─────────────┐
│   STARTER   │  │      PRO        │  │     MAX     │
│  $19.99/mo  │  │   $39.99/mo     │  │  $99.99/mo  │
│             │  │  14-day trial   │  │             │
│ 100 min     │  │  300 min        │  │ 750 min     │
│ 200 SMS     │  │  600 SMS        │  │ 1500 SMS    │
│ 300 contacts│  │  1000 contacts  │  │ 3000 contacts│
│             │  │  ✓ Transcripts  │  │ ✓ All Pro   │
│             │  │  ✓ After-hours  │  │ ✓ CRM int.  │
│             │  │  ✓ Summaries    │  │ ✓ API access│
│             │  │                 │  │             │
│ [Get Start] │  │[Start Free Trial]│ │ [Get Started]│
└─────────────┘  └─────────────────┘  └─────────────┘
                  ↑ Most Popular (badge)

[Full Feature Comparison Table — expandable]

FAQ Section:
- "Can I change plans later?"
- "What counts as a call minute?"
- "Do I need a credit card for the trial?"
- "Can I cancel anytime?"
```

**Design Notes:**
- Pro plan highlighted with emerald border + "Most Popular" badge
- Feature comparison table: collapsible, toggleable, clear checkmarks
- FAQ: accordion style
- No monthly/annual toggle yet (monthly only currently)

---

## 6. Categories Page (`/categories`)

### Layout

```
Headline: "Browse service categories"
Subheadline: "Find the right pro for any job"

[SearchBar: "Search categories..."]

Category Grid (4 columns, 3+ rows):
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│[Plumbing]│ │[Electric]│ │[ HVAC  ]│ │[Cleaning]│
│ 245 pros │ │ 189 pros │ │ 132 pros│ │ 312 pros │
├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤
│[  Pest  ]│ │[Landscap]│ │[Roofing]│ │[Painting]│
│  98 pros │ │ 156 pros │ │  87 pros│ │ 143 pros │
├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤
│[Garage  ]│ │[Property]│ │[Windows]│ │[General ]│
│  72 pros │ │ 201 pros │ │  65 pros│ │ 278 pros │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 7. Help Center (`/help`)

### Layout

```
Headline: "How can we help?"
[SearchBar: "Search help articles..."]

Topic Cards:
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 📅 Bookings  │ │ 💰 Payments  │ │ 👤 Account   │
│ Manage your  │ │ Billing,     │ │ Profile,     │
│ appointments │ │ receipts,    │ │ settings,    │
│              │ │ refunds      │ │ security     │
└──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ ⭐ Reviews   │ │ 📞 Contact   │ │ 🛡️ Safety   │
│ Leave and    │ │ Reach our    │ │ Verification │
│ manage       │ │ support team │ │ and trust    │
│ reviews      │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘

Popular Articles:
- How do I cancel a booking?
- How do I get a refund?
- How are pros verified?
- How do I update my payment method?
```

---

## 8. Content Guidelines for Marketing Copy

### Headlines

| Rule | Example |
|------|---------|
| Start with action or benefit | "Find trusted pros near you" |
| Keep under 8 words | "Home services, handled." |
| No technical jargon | Not "AI-powered NLP call routing" |
| Specific > generic | "Book a plumber in 2 minutes" > "Book services fast" |

### Body Copy

| Rule | Example |
|------|---------|
| One idea per paragraph | Short, scannable paragraphs |
| Active voice | "Our AI answers your calls" not "Calls are answered" |
| Second person ("you/your") | "Your calendar fills up automatically" |
| Concrete numbers | "78% of callers move on" not "most callers" |

### CTAs

| Rule | Example |
|------|---------|
| Start with a verb | "Find", "Start", "Book", "Get" |
| 2–4 words max | "Start Free Setup" |
| Create urgency without pressure | "Get started" not "Don't miss out!" |
| Match the section context | Hero: "Find a Pro", Pricing: "Start Free Trial" |

---

## 9. SEO Content Requirements Per Marketing Page

| Page | H1 | Target Keywords | Schema |
|------|-----|----------------|--------|
| `/` | "Home services, handled." | home services near me, find handyman, book plumber | WebSite, SearchAction |
| `/categories` | "Browse service categories" | service categories, home repair services | ItemList |
| `/categories/[slug]` | "Find [Category] pros near you" | [category] near me, [category] services | Service, FAQPage |
| `/pros` | "Never miss a call again" | AI receptionist, answering service for contractors | SoftwareApplication |
| `/pros/pricing` | "Simple, transparent pricing" | handyman software pricing, AI phone answering cost | Product, Offer |
| `/help` | "How can we help?" | handycall help, service booking help | FAQPage |
