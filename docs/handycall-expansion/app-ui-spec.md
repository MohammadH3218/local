# HandyCall.ai — App UI Specification

> Key screen layouts, navigation patterns, state management, and interaction design for the expanded platform.

---

## 1. Navigation Patterns

### 1.1 Consumer Navigation (Marketing)

**Desktop:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo]  Find Services  Categories  How It Works          For Pros   Log In  │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Fixed to top, z-50, white background with subtle border-bottom
- Scrolls: add subtle shadow on scroll (shadow-sm)
- Logo: always links to `/`
- "For Pros" styled distinctly (outlined badge or muted color)

**Mobile:**
```
┌──────────────────────────────────┐
│ [Logo]            [Hamburger ☰] │
└──────────────────────────────────┘
→ Sheet slides from right:
  Find Services
  Categories
  How It Works
  ─────────
  For Pros
  Log In
```

### 1.2 Customer Portal Navigation

**Desktop:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo]     My Bookings   Messages   Payments   Account    🔔  [Avatar ▾]   │
└──────────────────────────────────────────────────────────────────────────────┘
```
- Horizontal tab-style nav (not sidebar — customer portal is simpler)
- Active tab: emerald underline + bold text
- NotificationBell with unread count badge
- ProfileDropdown on avatar click

**Mobile:**
```
Content area

┌──────────────────────────────────────────┐
│  📅        💬        💰        👤       │
│ Bookings  Messages  Payments  Account   │
└──────────────────────────────────────────┘
```
- Bottom tab bar (iOS-style), fixed to bottom
- Active: emerald icon + bold label
- Notification bell moves to top-right of content header

### 1.3 Pro Dashboard Navigation

**Desktop (Sidebar):**
```
┌────────────┬──────────────────────────────────────────────┐
│ [Logo]     │  Search...                    🔔  [Avatar]   │
│ HandyCall  ├──────────────────────────────────────────────┤
│            │                                              │
│ MAIN       │  [Content Area]                              │
│ ● Dashboard│                                              │
│ ○ Leads    │                                              │
│ ○ Schedule │                                              │
│ ○ Customers│                                              │
│            │                                              │
│ BUSINESS   │                                              │
│ ○ Invoices │                                              │
│ ○ Payments │                                              │
│            │                                              │
│ AI & COMMS │                                              │
│ ○ AI Setup │                                              │
│ ○ Reports  │                                              │
│            │                                              │
│ TEAM       │                                              │
│ ○ Members  │                                              │
│ ○ Settings │                                              │
└────────────┴──────────────────────────────────────────────┘
```
- Sidebar: 256px wide, fixed position, scrollable if needed
- Grouped sections with small uppercase labels
- Active item: emerald-50 background + emerald-600 left border + bold text
- Hover: slate-50 background
- Collapse to icon-only on narrow viewports (lg breakpoint)

**Mobile:**
```
┌──────────────────────────────────┐
│ [☰ Menu]  HandyCall    🔔 [Av] │
├──────────────────────────────────┤
│ [Content]                        │
└──────────────────────────────────┘
```
- Hamburger opens full-height slide-out drawer (same sidebar content)
- Backdrop overlay when open

---

## 2. Key Screen Wireframe Descriptions

### 2.1 Consumer: Search Results (`/search`)

```
┌──────────────────────────────────────────────────────────────┐
│ [Nav]                                                        │
├──────────────────────────────────────────────────────────────┤
│ SearchBar: [What do you need? ▾] [Location] [Search]        │
│                                                              │
│ Showing 24 plumbers in Austin, TX          Sort: Top Rated ▾│
│                                                              │
│ Filters:  ★ 4+  │  Within 10mi  │  Available Today  │  ...  │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [Photo] Mike's Plumbing              ★ 4.9 (127 reviews)│ │
│ │         Plumbing · Water Heaters                         │ │
│ │         ✓ Verified  ⚡ Responds in 15 min               │ │
│ │         "Excellent work, very fair pricing..."           │ │
│ │                    [Request Quote]  [View Profile]       │ │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ [Photo] A+ Electric                  ★ 4.7 (89 reviews) │ │
│ │         Electrical · Lighting                            │ │
│ │         ✓ Verified  📅 Next available: Tomorrow          │ │
│ │         "Professional and quick..."                      │ │
│ │                    [Request Quote]  [View Profile]       │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│                    [Load More Results]                        │
└──────────────────────────────────────────────────────────────┘
```

**Interaction:**
- Filter chips are toggleable (emerald fill when active)
- Sort dropdown: "Top Rated", "Most Reviews", "Fastest Response", "Nearest"
- Results update without page reload (client-side fetch)
- Infinite scroll or "Load More" button
- ProviderCards link to `/provider/[id]`
- "Request Quote" opens login gate if not authenticated

### 2.2 Consumer: Provider Profile (`/provider/[id]`)

```
┌──────────────────────────────────────────────────────────────┐
│ [Nav]                                                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ [Large Photo]  Mike's Plumbing & Heating                    │
│                ★ 4.9  ·  127 reviews  ·  Austin, TX         │
│                ✓ Licensed  ✓ Insured  ✓ Verified            │
│                                                              │
│                [ Request a Quote ]   [ Call Now ]            │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│                                                              │
│ About  │  Services  │  Reviews  │  Availability             │
│ ───────                                                      │
│                                                              │
│ [About Section]                                              │
│ "Family-owned plumbing business serving Austin since 2015.  │
│  We specialize in residential repairs, water heaters,       │
│  and bathroom remodels."                                     │
│                                                              │
│ Service Area: Austin, Round Rock, Cedar Park, Pflugerville  │
│                                                              │
│ [Services Section]                                           │
│ • Drain Cleaning — starting at $89                          │
│ • Water Heater Install — starting at $399                   │
│ • Leak Repair — starting at $75                             │
│ • Bathroom Remodel — get a quote                            │
│                                                              │
│ [Reviews Section]                                            │
│ ★★★★★ "Mike showed up on time and fixed everything..."     │
│ ★★★★★ "Very professional, fair pricing..."                 │
│ ★★★★☆ "Good work, took a bit longer than expected"         │
│                            [Show All 127 Reviews →]         │
│                                                              │
│ [Availability Section]                                       │
│ Next available: Tomorrow, Feb 27                             │
│ [Calendar widget showing available dates]                    │
│                                                              │
│ ─────────────────────────────────────────────────────────── │
│ Sticky bottom bar (mobile):                                  │
│ [ Request a Quote ]                                          │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Customer Portal: Bookings (`/account/bookings`)

```
┌──────────────────────────────────────────────────────────────┐
│ [Portal Nav: ... My Bookings(active) ...]                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ My Bookings                           [ Book a Service ]     │
│                                                              │
│ [Upcoming]  [Past]  [Cancelled]                              │
│ ──────────                                                   │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📅 Tomorrow, Feb 27 at 2:00 PM                          │ │
│ │                                                          │ │
│ │ Drain Cleaning                                           │ │
│ │ Mike's Plumbing · ★ 4.9                                 │ │
│ │                                                          │ │
│ │ Status: Confirmed ✓                                     │ │
│ │                                                          │ │
│ │ [View Details]  [Reschedule]  [Cancel]                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 📅 March 5 at 9:00 AM                                   │ │
│ │                                                          │ │
│ │ HVAC Annual Service                                      │ │
│ │ CoolAir Pros · ★ 4.7                                   │ │
│ │                                                          │ │
│ │ Status: Pending Confirmation ⏳                          │ │
│ │                                                          │ │
│ │ [View Details]  [Reschedule]  [Cancel]                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [Empty State for no bookings:]                               │
│ "No upcoming bookings. Ready to get something fixed?"        │
│                  [ Find a Pro ]                               │
└──────────────────────────────────────────────────────────────┘
```

### 2.4 Pro Dashboard Home (`/pros/dashboard`)

```
┌────────────┬──────────────────────────────────────────────────┐
│ [Sidebar]  │  Dashboard                         🔔  [Profile]│
│            ├──────────────────────────────────────────────────┤
│            │                                                  │
│            │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────┐│
│            │  │ 📞 Calls  │ │ 🎯 Leads │ │ 📅 Jobs  │ │💰Rev││
│            │  │  47       │ │  12 new  │ │  8 this  │ │$2.4k││
│            │  │ this week │ │ +3 today │ │  week    │ │mo   ││
│            │  │ ▲ 15%     │ │          │ │          │ │▲ 8% ││
│            │  └──────────┘ └──────────┘ └──────────┘ └─────┘│
│            │                                                  │
│            │  Action Items                                    │
│            │  ┌────────────────────────────────────────────┐ │
│            │  │ ⚠ 3 new leads need follow-up    [Review →]│ │
│            │  │ 📅 2 appointments tomorrow       [View →] │ │
│            │  │ ❓ 1 flagged question            [Answer →]│ │
│            │  └────────────────────────────────────────────┘ │
│            │                                                  │
│            │  ┌─────────────────────┐ ┌─────────────────────┐│
│            │  │ Call Volume (7d)    │ │ Recent Activity      ││
│            │  │ [Bar Chart]         │ │ • Call from +1...    ││
│            │  │                     │ │ • Booking confirmed  ││
│            │  │                     │ │ • Payment received   ││
│            │  │                     │ │ • New lead captured  ││
│            │  └─────────────────────┘ └─────────────────────┘│
│            │                                                  │
└────────────┴──────────────────────────────────────────────────┘
```

### 2.5 Pro: Lead Inbox (`/pros/leads`)

```
┌────────────┬──────────────────────────────────────────────────┐
│ [Sidebar]  │  Leads (12 new)                     [+ Add Lead]│
│            ├──────────────────────────────────────────────────┤
│            │  [All] [New] [Contacted] [Booked] [Lost]        │
│            │  Search leads...                    Sort: Newest │
│            │                                                  │
│            │  ┌──────────────────────┬───────────────────────┐│
│            │  │ Lead List            │ Lead Detail           ││
│            │  │                      │                       ││
│            │  │ ● John Smith    NEW  │ John Smith            ││
│            │  │   Plumbing repair    │ +1 (512) 555-1234     ││
│            │  │   2h ago · AI call   │ john@email.com        ││
│            │  │                      │                       ││
│            │  │ ○ Sarah Johnson      │ Source: AI Inbound    ││
│            │  │   HVAC service       │ Quality: High 🟢      ││
│            │  │   Yesterday          │ Category: Plumbing    ││
│            │  │                      │                       ││
│            │  │ ○ Mike Peters        │ Call Recording:       ││
│            │  │   Electrical         │ [▶ 2:34] [Transcript]││
│            │  │   2 days ago         │                       ││
│            │  │                      │ AI Summary:           ││
│            │  │                      │ "Customer needs drain ││
│            │  │                      │  cleaning. Available  ││
│            │  │                      │  weekdays. Budget:    ││
│            │  │                      │  $100-200."           ││
│            │  │                      │                       ││
│            │  │                      │ [Follow Up] [Book Job]││
│            │  │                      │ [Mark as Lost]        ││
│            │  └──────────────────────┴───────────────────────┘│
└────────────┴──────────────────────────────────────────────────┘
```

**Interaction:** Master-detail layout. Click lead on left → detail on right. Mobile: full-screen list, tap → detail page.

### 2.6 Pro: AI Settings (`/pros/ai-settings`)

```
┌────────────┬──────────────────────────────────────────────────┐
│ [Sidebar]  │  AI & Communications                             │
│            ├──────────────────────────────────────────────────┤
│            │  [Voice] [Messaging] [Knowledge] [Test]          │
│            │  ─────────                                       │
│            │                                                  │
│            │  Voice Configuration                             │
│            │  ┌────────────────────────────────────────────┐ │
│            │  │ Greeting Tone                              │ │
│            │  │ [Professional ▾]                            │ │
│            │  │                                            │ │
│            │  │ Booking Mode                               │ │
│            │  │ ○ Propose available times                  │ │
│            │  │ ● Accept customer-suggested times          │ │
│            │  │                                            │ │
│            │  │ Call Handling Rules                        │ │
│            │  │ Business hours: Answer with AI             │ │
│            │  │ After hours:    [Take message ▾]           │ │
│            │  │ Overflow:       [Transfer to cell ▾]       │ │
│            │  │                                            │ │
│            │  │ Can discuss pricing: [✓]                   │ │
│            │  │ Handle emergencies:  [✓]                   │ │
│            │  │ Send SMS summary:    [✓]                   │ │
│            │  └────────────────────────────────────────────┘ │
│            │                                                  │
│            │  Phone Number                                    │
│            │  ┌────────────────────────────────────────────┐ │
│            │  │ Your AI number: +1 (512) 555-9876          │ │
│            │  │ Forward your business line to this number  │ │
│            │  │ [Setup Guide]                              │ │
│            │  └────────────────────────────────────────────┘ │
│            │                                                  │
│            │              [Test Call]    [Save Changes]       │
└────────────┴──────────────────────────────────────────────────┘
```

---

## 3. State Management Approach

### 3.1 Current Patterns (Maintain)

| Store | Technology | Scope |
|-------|-----------|-------|
| Auth state | Zustand (`auth-store.ts`) | Global: user, company, tokens, role |
| Admin company | Zustand (`admin-company-store.ts`) | Admin: selected company context |
| Onboarding | React Context | Onboarding wizard form state |
| Session | NextAuth cookies | Server-side session |

### 3.2 New Stores Needed

| Store | Technology | Purpose |
|-------|-----------|---------|
| **Customer profile** | Zustand | Customer account data, preferences, saved addresses |
| **Search state** | URL params + React state | Search query, filters, sort, results (no persistent store — URL is the source of truth) |
| **Notification state** | Zustand | Unread count, notification list, polling/WebSocket connection |
| **Messaging state** | Zustand | Open threads, message list, typing indicators |
| **Cart/booking flow** | React Context | Multi-step booking form state (ephemeral) |

### 3.3 Data Fetching Strategy

| Pattern | Use Case | Tool |
|---------|----------|------|
| **Server Components** | Marketing pages, SEO content, initial page data | Next.js fetch in RSC |
| **SWR/React Query** | Dashboard data, lists with pagination, polling | `useSWR` or `@tanstack/react-query` (recommend React Query) |
| **Real-time** | Notifications, messaging, appointment updates | WebSocket (future) or polling (initial) |
| **Optimistic updates** | Form submissions, status changes | React Query mutation with optimistic config |
| **URL state** | Search filters, pagination, sort | `useSearchParams` from Next.js |

### 3.4 Cache Strategy

```
React Query config:
- staleTime: 30s (dashboard data)
- staleTime: 5min (profile, settings)
- staleTime: 0 (notifications, messages — always fresh)
- gcTime: 10min (garbage collect unused queries)
- refetchOnWindowFocus: true (dashboard)
- refetchInterval: 30s (notifications count)
```

---

## 4. Form Patterns & Validation

### 4.1 Form Architecture

**Recommendation:** Use React Hook Form + Zod for all forms.

```typescript
// Example pattern
const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().regex(/^\+?1?\d{10}$/, "Invalid phone number"),
});

const form = useForm({ resolver: zodResolver(schema) });
```

### 4.2 Validation Rules

| Field Type | Validation | Error Message |
|-----------|-----------|---------------|
| Email | Valid email format | "Please enter a valid email address" |
| Password | 8+ chars, 1 uppercase, 1 number | "Password must be at least 8 characters with a number and uppercase letter" |
| Phone | E.164 or (XXX) XXX-XXXX | "Please enter a valid phone number" |
| ZIP code | 5 digits | "Please enter a valid ZIP code" |
| Required text | Non-empty, min 2 chars | "[Field name] is required" |
| Currency | Positive number, 2 decimal max | "Please enter a valid amount" |

### 4.3 Form UX Patterns

| Pattern | Behavior |
|---------|----------|
| **Inline validation** | Validate on blur, show error below field immediately |
| **Submit validation** | Re-validate all fields, scroll to first error |
| **Loading state** | Disable submit button, show spinner, prevent double-submit |
| **Success feedback** | Toast notification ("Changes saved") + optionally redirect |
| **Error feedback** | Toast notification (error variant) + inline field errors |
| **Unsaved changes** | Browser `beforeunload` warning if form is dirty |

---

## 5. Messaging UI

### 5.1 Customer Message Thread

```
┌──────────────────────────────────────────────────┐
│ ← Back to Messages    Mike's Plumbing            │
│                        Re: Drain cleaning job     │
├──────────────────────────────────────────────────┤
│                                                  │
│                              Hi! I'd like to     │
│                              schedule a drain     │ ← Customer (right, emerald)
│                              cleaning.   2:30 PM │
│                                                  │
│ Thanks for reaching out!                         │
│ I have availability tomorrow                     │ ← Pro (left, slate)
│ at 2 PM. Does that work?      2:35 PM           │
│                                                  │
│                              That works! Please  │
│                              confirm.   2:36 PM  │ ← Customer
│                                                  │
│ 📅 Booking confirmed:                            │
│ Tomorrow, Feb 27 at 2:00 PM                      │ ← System message (center, muted)
│ Drain Cleaning · $89                             │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Type a message...                    ] [Send →] │
└──────────────────────────────────────────────────┘
```

**Design:**
- Customer messages: right-aligned, emerald-50 background, rounded-lg
- Pro messages: left-aligned, slate-100 background, rounded-lg
- System messages: centered, muted text, no bubble
- Timestamps: below each message, `caption` size
- Input: sticky bottom, with send button

### 5.2 Pro Message View

Same layout but reversed (pro messages on right). Additional features:
- Quick reply templates (dropdown above input)
- Booking link insertion button
- Contact card in thread header (phone, email, last booking)

---

## 6. Notifications Center

### 6.1 Notification Bell (All Users)

```
┌────┐
│ 🔔 │ ← Badge with count (red circle, white text)
└────┘
  │
  ▼ (click → dropdown popover)
┌──────────────────────────────────────────────┐
│ Notifications                    Mark all read│
├──────────────────────────────────────────────┤
│ ● New booking confirmed                      │
│   Mike's Plumbing · Drain cleaning           │
│   2 minutes ago                              │
├──────────────────────────────────────────────┤
│ ● Payment received — $89.00                  │
│   From Sarah M.                              │
│   1 hour ago                                 │
├──────────────────────────────────────────────┤
│ ○ Appointment reminder                       │
│   Tomorrow at 2:00 PM                        │
│   Yesterday                                  │
├──────────────────────────────────────────────┤
│              [View All Notifications →]       │
└──────────────────────────────────────────────┘
```

**Design:**
- Popover width: 380px
- Max 5 items in dropdown, link to full page
- Unread: bold text + emerald dot indicator
- Read: normal weight + no dot
- Timestamps: relative ("2 minutes ago")

### 6.2 Notification Types

| Type | Icon | Customer | Pro |
|------|------|----------|-----|
| Booking confirmed | 📅 | ✓ | ✓ |
| Booking cancelled | ❌ | ✓ | ✓ |
| Booking reminder | ⏰ | ✓ | ✓ |
| New message | 💬 | ✓ | ✓ |
| Payment received | 💰 | — | ✓ |
| Payment charged | 💳 | ✓ | — |
| New lead | 🎯 | — | ✓ |
| Review received | ⭐ | — | ✓ |
| Usage warning | ⚠️ | — | ✓ |
| System update | 📢 | ✓ | ✓ |

---

## 7. Mobile-First Considerations

### 7.1 Touch Targets

- All interactive elements: minimum 44×44px touch area
- Buttons: minimum height 44px, padding 12px horizontal
- List items: minimum height 48px
- Form inputs: minimum height 44px

### 7.2 Mobile-Specific UI Patterns

| Pattern | Desktop | Mobile |
|---------|---------|--------|
| **Navigation** | Horizontal nav / sidebar | Bottom tab bar / hamburger |
| **Data tables** | Full table with columns | Card list (stacked fields) |
| **Filters** | Sidebar or inline chips | Bottom sheet |
| **Detail panels** | Side panel (master-detail) | Full-screen page |
| **Dialogs** | Center modal | Full-screen or bottom sheet |
| **Date pickers** | Calendar popup | Native date input or full-screen calendar |
| **Search** | Inline search bar | Full-screen search overlay |

### 7.3 Gestures

| Gesture | Action |
|---------|--------|
| Swipe left on booking card | Reveal "Cancel" action |
| Swipe left on notification | Mark as read / dismiss |
| Pull down on list | Refresh content |
| Long press on message | Copy / reply menu |

---

## 8. Loading & Empty States

### 8.1 Loading Patterns

| Context | Pattern |
|---------|---------|
| **Page load** | Full-page skeleton (gray blocks matching layout) |
| **List loading** | 3–5 skeleton rows matching card height |
| **Button action** | Spinner replaces button text, button disabled |
| **Data refresh** | Subtle top progress bar (emerald, 2px) |
| **Image loading** | Gray placeholder → fade-in on load |

### 8.2 Empty State Template

```
┌──────────────────────────────────────────────┐
│                                              │
│            [Illustration]                    │
│                                              │
│         No [items] yet                       │
│                                              │
│   [Helpful description of what to do next]   │
│                                              │
│           [ Primary Action ]                 │
│                                              │
└──────────────────────────────────────────────┘
```

Every list/table view must have a designed empty state with:
1. Illustration (from image-prompts.md empty state set)
2. Title ("No calls yet", "No upcoming bookings")
3. Description (1 sentence, actionable)
4. CTA button (primary action to get started)

---

## 9. Error Handling UI

### 9.1 Error Types

| Error | Display |
|-------|---------|
| **Network error** | Toast: "Connection lost. Retrying..." + auto-retry |
| **401 Unauthorized** | Redirect to login with callback URL |
| **403 Forbidden** | Inline message: "You don't have permission to view this" |
| **404 Not Found** | Full-page 404 with illustration + "Go Home" link |
| **500 Server Error** | Toast: "Something went wrong. Please try again." + retry button |
| **Validation error** | Inline field errors (red text below field) |
| **Rate limit** | Toast: "Too many requests. Please wait a moment." |

### 9.2 Offline Support

- Detect online/offline status
- Show banner: "You're offline. Some features may be unavailable."
- Queue form submissions for retry when back online (optional, Phase 5)

---

## 10. Animation & Transition Spec

### 10.1 Page Transitions

| Transition | Duration | Easing |
|-----------|----------|--------|
| Route change (same layout) | 200ms | ease-out |
| Modal open | 200ms | ease-out (scale 0.95 → 1.0 + fade) |
| Modal close | 150ms | ease-in |
| Sheet slide-in | 300ms | ease-out |
| Sheet slide-out | 200ms | ease-in |
| Toast enter | 300ms | spring (slight overshoot) |
| Toast exit | 200ms | ease-in |

### 10.2 Micro-Interactions

| Element | Animation |
|---------|-----------|
| Button hover | Background color transition 150ms |
| Button press | Scale to 0.98, 100ms |
| Card hover | Translate Y -2px + shadow increase, 200ms |
| Toggle switch | Slide + color change, 200ms |
| Checkbox check | Scale bounce 0.8 → 1.1 → 1.0, 200ms |
| Loading spinner | Continuous rotation, 1s |
| Skeleton pulse | Opacity 0.5 → 1.0, 1.5s infinite |
| Notification badge | Scale in from 0, 300ms spring |

### 10.3 `prefers-reduced-motion`

All animations must respect the user's motion preference:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
