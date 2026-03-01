# HandyCall.ai — Image Style Guide & Prompt Packs

> Art direction and AI image generation prompts for marketing visuals. Consistent with brand identity.

---

## 1. Style Direction

### 1.1 Overall Aesthetic

**Style**: Clean vector-influenced illustration with subtle 3D depth. Think "Stripe illustrations meet Notion simplicity." Not photorealistic, not cartoonish — sophisticated and warm.

**Mood**: Professional trust, modern simplicity, human warmth.

**Visual Language**:
- Geometric simplicity with rounded corners
- Limited color palette per illustration (3–5 colors max)
- Soft shadows and subtle gradients (not flat, not hyper-3D)
- Negative space is a design element — don't fill every corner
- Human figures should be stylized/abstract (not photorealistic faces)

### 1.2 Color Foundation

All illustrations must use the HandyCall brand palette:

| Color | Hex | Role in Illustrations |
|-------|-----|----------------------|
| Emerald 600 | #059669 | Primary accent, highlights, key objects |
| Emerald 100 | #D1FAE5 | Light fills, backgrounds |
| Slate 900 | #0F172A | Dark elements, text, outlines |
| Slate 400 | #94A3B8 | Secondary elements, shadows |
| Slate 100 | #F1F5F9 | Light backgrounds, negative space |
| White | #FFFFFF | Base, clean areas |
| Amber 400 | #FBBF24 | Accent sparingly (notifications, stars) |

### 1.3 Illustration Sub-Styles

| Context | Sub-Style | Description |
|---------|-----------|-------------|
| **Hero / marketing** | Isometric scene | Angled 3D perspective, clean geometry, 1–2 characters |
| **Category icons** | Outlined icon + color fill | Consistent stroke weight, rounded caps, emerald fill areas |
| **Empty states** | Minimal line art | Simple, single-object, muted colors, friendly |
| **Feature highlights** | Spot illustration | Small, focused, supporting text — not dominating |

---

## 2. Do / Don't List

### DO

- Use clean geometric shapes with rounded corners
- Maintain consistent stroke weight (2–3px at display size)
- Use the brand emerald as the dominant accent
- Include whitespace / breathing room in compositions
- Use abstract/stylized human figures (simple body shapes, no detailed faces)
- Keep backgrounds simple (solid color or very subtle gradient)
- Use isometric perspective for scene illustrations
- Apply soft drop shadows (not harsh)
- Use flat or lightly textured surfaces
- Keep lighting direction consistent (top-left)

### DON'T

- Generate photorealistic human faces (uncanny valley risk)
- Use more than 5 colors per illustration
- Add "techy" circuit/neural-network/hologram motifs
- Use generic "AI glow" or lens flare effects
- Include cluttered backgrounds or futuristic cityscapes
- Use glossy/plastic-looking 3D rendering
- Add busy patterns or textures
- Show distorted hands or fingers (AI artifact)
- Use gradients that clash with the emerald palette
- Create compositions that feel "busy" — if in doubt, simplify

---

## 3. Prompt Templates

### 3.1 Base Prompt Structure

Every prompt should follow this structure:

```
[Subject description], [style keywords], [color specification], [composition notes], [quality modifiers]

--negative [negative prompt]
```

### 3.2 Style Keywords (Include in Every Prompt)

```
clean vector illustration, modern minimal design, geometric shapes, rounded corners,
soft shadows, emerald green (#059669) accent color, slate gray (#0F172A) dark elements,
white background, professional SaaS aesthetic, Dribbble quality
```

### 3.3 Quality Modifiers (Include in Every Prompt)

```
high quality, sharp details, clean lines, professional illustration, 4K resolution,
no text, no watermarks, centered composition
```

### 3.4 Negative Prompt (Include in Every Prompt)

```
photorealistic faces, detailed hands, cluttered background, neon colors, lens flare,
holographic effects, circuit board patterns, neural network visualization,
glossy plastic render, busy textures, clip art, cartoon style, anime,
stock photo, watermark, text overlay, multiple color schemes,
futuristic cityscape, glowing orbs, sparkles, AI slop
```

---

## 4. Prompt Packs

### 4.1 Hero Background / Hero Illustration

#### Option A: Isometric Scene (Recommended)

```
Isometric illustration of a small business workspace: a desk with a phone showing an incoming call
being answered by an AI assistant icon, a calendar with appointments filling in, and a notification
showing "New booking confirmed." A stylized person sitting nearby reviewing their tablet with
a satisfied expression. Clean vector illustration, modern minimal design, geometric shapes,
rounded corners, soft shadows. Primary color: emerald green (#059669). Secondary: slate gray.
White background with very subtle emerald gradient in corner. Professional SaaS aesthetic,
Dribbble quality, high resolution, no text.

--negative photorealistic faces, detailed hands, cluttered background, neon colors, lens flare,
holographic effects, circuit patterns, glossy plastic, busy textures, clip art, cartoon style
```

#### Option B: Abstract Communication Flow

```
Abstract illustration showing a flow: phone ringing icon on the left, connected by a smooth
curved emerald green line to a friendly AI assistant circle in the center, which branches into
three outcomes: calendar icon (booking), message bubble (SMS), and person icon (lead captured).
Minimal geometric shapes, clean vector style. Colors: emerald green (#059669), light emerald
(#D1FAE5), slate gray (#0F172A), white. Soft shadows, no texture. Professional SaaS marketing
illustration. Wide aspect ratio (16:9), centered composition.

--negative photorealistic, cluttered, neon, holographic, circuit board, 3D render, glossy,
busy patterns, dark theme
```

#### Option C: Split Hero (Customer + Pro)

```
Clean split illustration: left side shows a homeowner on their phone searching for services
with category icons floating around (wrench, lightning bolt, leaf, bug). Right side shows a
business owner at a desk with an AI assistant managing their phone calls, calendar filling up
with appointments. Divided by a subtle emerald green gradient line. Minimal geometric vector
style, rounded shapes, soft shadows. Colors: emerald (#059669), slate gray, warm white
background. Professional, modern, approachable. Wide format, balanced composition.

--negative photorealistic faces, detailed hands, cluttered, neon, dark theme, holographic,
circuit patterns, cartoon, anime
```

---

### 4.2 Category Icons / Illustrations

**Base template (replace `{SERVICE}` and `{ICON_ELEMENTS}`):**

```
Minimal vector icon illustration of {SERVICE}: {ICON_ELEMENTS}. Clean geometric shapes,
consistent 3px stroke weight, rounded line caps. Emerald green (#059669) as primary fill
with slate gray (#0F172A) outlines. Light emerald (#D1FAE5) background circle or soft
rounded square. No text. Centered, square format (1:1). Professional icon design,
consistent with a unified set.

--negative photorealistic, detailed, busy, gradient heavy, 3D, shadow heavy, text, watermark
```

#### Category-Specific Prompts:

**Plumbing:**
```
{SERVICE} = plumbing services
{ICON_ELEMENTS} = a pipe wrench crossed with a water pipe, small water droplet accent
```

**Electrical:**
```
{SERVICE} = electrical services
{ICON_ELEMENTS} = a lightning bolt inside a circle, with a small plug connector accent
```

**HVAC:**
```
{SERVICE} = HVAC heating and cooling
{ICON_ELEMENTS} = a snowflake on the left and flame on the right with air flow lines between them
```

**Cleaning:**
```
{SERVICE} = house cleaning services
{ICON_ELEMENTS} = a spray bottle with sparkle stars, next to a small house outline
```

**Pest Control:**
```
{SERVICE} = pest control extermination
{ICON_ELEMENTS} = a shield with a small bug silhouette crossed out, clean and minimal
```

**Landscaping:**
```
{SERVICE} = landscaping and lawn care
{ICON_ELEMENTS} = a stylized tree with rounded canopy next to lawn mower blade icon
```

**Garage Doors:**
```
{SERVICE} = garage door repair
{ICON_ELEMENTS} = a garage door outline with an upward arrow and a wrench tool accent
```

**Property Maintenance:**
```
{SERVICE} = general property maintenance
{ICON_ELEMENTS} = a house outline with a circular arrow (refresh/maintenance cycle) overlay
```

**Roofing:**
```
{SERVICE} = roofing services
{ICON_ELEMENTS} = a roof profile shape with shingle pattern and a hammer tool accent
```

**Painting:**
```
{SERVICE} = house painting
{ICON_ELEMENTS} = a paint roller with a subtle color swatch stripe in emerald green
```

---

### 4.3 Pro Dashboard Empty States

**Base template (replace `{CONTEXT}` and `{SCENE}`):**

```
Minimal illustration for an empty state in a SaaS dashboard: {SCENE}. Friendly and encouraging
tone. Muted color palette: light emerald (#D1FAE5), slate gray (#94A3B8), with a small emerald
(#059669) accent element. White background, centered, simple. No text. Suitable for small
display (200x200px effective). Clean vector line art style.

--negative photorealistic, complex, busy, dark, 3D render, cartoon, clipart
```

**Specific Empty States:**

| Context | Scene Description |
|---------|------------------|
| **No calls yet** | `{SCENE}` = "A phone handset resting peacefully on a pillow with a small clock icon and 'zzz' sleep marks. Suggests waiting but calm." |
| **No leads yet** | `{SCENE}` = "An empty inbox tray with a single sparkle above it, suggesting it's clean and ready. A small arrow pointing down into the tray." |
| **No appointments** | `{SCENE}` = "A blank calendar page with a plus icon in the center and a subtle emerald checkmark ready to appear." |
| **No knowledge items** | `{SCENE}` = "An open book with empty pages and a small pencil icon, suggesting content ready to be added." |
| **No messages** | `{SCENE}` = "Two empty speech bubbles overlapping slightly, with a small emerald dot suggesting a conversation about to begin." |
| **No payments** | `{SCENE}` = "A simple wallet outline, slightly open, with a small emerald coin peeking out." |
| **No team members** | `{SCENE}` = "Two abstract person outlines side by side with a plus icon between them." |

---

### 4.4 Customer Portal Empty States

| Context | Scene Description |
|---------|------------------|
| **No bookings** | "A small house outline with an open door and a welcome mat, with a magnifying glass suggesting searching for services." |
| **No subscriptions** | "A circular refresh/repeat arrow icon with a calendar in the center, in muted tones suggesting it's inactive but ready." |
| **No payment history** | "A receipt paper, blank, with a small checkmark watermark in very light emerald." |
| **No reviews given** | "A single star outline with a pencil icon, suggesting a review is ready to be written." |

---

### 4.5 App Store Promo Images (Optional)

#### Screenshot Mockup Background

```
Clean device mockup background for app store screenshots: subtle gradient from white to very
light emerald (#D1FAE5) at bottom. Minimal geometric shapes (circles, rounded rectangles)
floating as decoration in light slate gray (#E2E8F0). Professional, modern, uncluttered.
Space for device screenshot overlay in center. Wide format (1290x2796px portrait for App Store).

--negative text, logos, busy, dark, patterns, textures, photorealistic
```

#### Promo Banner

```
Wide promotional banner for HandyCall AI receptionist app: abstract representation of a phone
call being intelligently routed — smooth emerald curves connecting a phone icon to calendar,
message, and contact icons. Isometric minimal style. Colors: emerald green (#059669),
white, light emerald (#D1FAE5). Professional SaaS banner, clean and modern. Aspect ratio 16:9.

--negative photorealistic faces, cluttered, neon, holographic, dark theme, text
```

---

## 5. Composition Notes

### 5.1 Lighting

- **Direction**: Top-left (consistent across all illustrations)
- **Style**: Soft ambient light, no harsh directional shadows
- **Shadows**: Soft, diffused, offset 4–8px down and right at 10–15% opacity

### 5.2 Depth & Perspective

- **Hero scenes**: Isometric (30° angle) for 3D depth without vanishing points
- **Icons**: Flat or 2.5D (slight perspective, single shadow layer)
- **Empty states**: Flat/2D, minimal depth

### 5.3 Background Simplicity

| Context | Background |
|---------|-----------|
| Hero illustrations | White or very subtle gradient (white → #F0FDF4) |
| Category icons | Emerald-tinted circle or rounded square (#D1FAE5) |
| Empty states | Pure white or transparent |
| Feature spots | White with light geometric accent shapes |

### 5.4 Figure Style

When human figures appear:
- Abstract/geometric body shapes (rounded rectangles for torso, circles for head)
- No facial details — dot eyes at most, or completely featureless
- Diverse body proportions (vary shapes/sizes)
- Clothing suggested by color blocks, not detail
- Hands shown as simple rounded shapes (mitten-style, not fingers)

---

## 6. Guidance: Keeping Images "Non-Sloppy"

### 6.1 Quality Checklist

Before accepting any generated image:

- [ ] **Color match**: Does it use the brand palette (emerald + slate + white)?
- [ ] **Simplicity**: Can you describe the image in one sentence?
- [ ] **Consistency**: Would it look like it belongs next to the other illustrations?
- [ ] **No artifacts**: Are there any weird hands, distorted text, or melted shapes?
- [ ] **Clean edges**: Are outlines crisp and consistent in weight?
- [ ] **Whitespace**: Is there sufficient breathing room?
- [ ] **Brand fit**: Does it feel professional and trustworthy?
- [ ] **No AI clichés**: No circuit boards, hologram effects, or glowing neural patterns?

### 6.2 Generation Tips

1. **Generate at high resolution** (2048px+ minimum side), then downscale
2. **Generate multiple variations** (4–8) and pick the cleanest one
3. **Use inpainting** to fix specific artifacts rather than regenerating
4. **Run through upscaler** for final output if edges are soft
5. **Keep the negative prompt** — it prevents the most common AI art problems
6. **Vector conversion**: For icons, consider running through an image-to-SVG tool (Vectorizer.ai, Illustrator trace) for crisp, scalable output
7. **Test at small sizes**: Icons and empty states must read clearly at 48px and 200px respectively
8. **Consistent set generation**: Generate category icons in one batch with the same seed/style settings to maintain visual consistency

### 6.3 File Naming Convention

```
hero-isometric-v1.png
hero-abstract-flow-v1.png
category-plumbing.svg
category-electrical.svg
category-hvac.svg
empty-no-calls.svg
empty-no-leads.svg
empty-no-appointments.svg
promo-app-store-bg.png
promo-banner-16x9.png
```

Store in: `/public/images/illustrations/`

---

## 7. Recommended Tools

| Tool | Use Case |
|------|----------|
| **Midjourney v6** | Hero illustrations, scene illustrations (best quality) |
| **DALL-E 3** | Icons, simpler compositions, easy iteration |
| **Ideogram** | Text-free illustrations, consistent style |
| **Recraft** | Icon sets, vector-style outputs |
| **Vectorizer.ai** | PNG → SVG conversion for icons |
| **Figma** | Final composition, adding text, layout proofs |
