# Frontend Design Patterns & Examples

## Color Palettes

### Modern Professional
```
Primary: #2563eb (blue)
Secondary: #7c3aed (purple)
Accent: #ec4899 (pink)
Background: #f8fafc
Dark Background: #0f172a
Text: #1e293b
```

### Warm & Inviting
```
Primary: #d97706 (amber)
Secondary: #f59e0b (orange)
Accent: #f97316 (orange-600)
Background: #fffbeb
Dark Background: #1f1a13
Text: #78350f
```

### Tech/Dark
```
Primary: #00d9ff (cyan)
Secondary: #9d00ff (purple)
Accent: #ff006e (magenta)
Background: #0a0e27
Dark Background: #16213e
Text: #e0e0e0
```

## Typography Systems

### Classic
```
Headings: Georgia or Garamond (serif)
Body: -apple-system, BlinkMacSystemFont, Segoe UI (sans)
Mono: SF Mono, Monaco, monospace
```

### Modern
```
Headings: Inter, Poppins
Body: Inter, Helvetica Neue
Mono: Fira Code, Menlo
```

### Bold
```
Headings: Space Grotesk, Syne
Body: Inter, Work Sans
Mono: IBM Plex Mono
```

## Interactive Element Patterns

### Button Styles
- **Solid**: Full background color, white text, hover state darkens color
- **Outline**: Transparent background, colored border, hover fills with light background
- **Ghost**: No background/border, colored text, hover has subtle background
- **Gradient**: Gradient background, smooth hover transform, shadow on hover

### Hover States
- Subtle shadow increase
- Color shift (10-20% lighter/darker)
- Scale transform (1.02-1.05)
- Underline appear/grow
- Background color transition

### Focus States
- Clear focus ring (minimum 3px, high contrast)
- Outline style consistent across all interactive elements
- Color: contrasting with both background and element

### Loading States
- Animated spinner/skeleton
- Pulse or shimmer effect
- Disabled state styling
- Clear feedback message

## Animation Techniques

### Transitions
```
Recommended timing: 150ms-300ms
Easing: ease-in-out, cubic-bezier(0.4, 0, 0.2, 1)
Properties: color, background-color, transform, opacity
```

### Entrance Animations
- Fade-in: opacity 0 → 1
- Slide-in: transform translateX/Y
- Scale-up: transform scale(0) → scale(1)
- Stagger children: delay each by 50-100ms

### Micro-interactions
- Icon changes on hover
- Text reveals on interaction
- Smooth number transitions
- Animated checkmarks
- Progress indicators

## Layout Patterns

### Card Components
- Rounded corners (8-16px)
- Subtle shadow or border
- Hover elevation (shadow increase, scale, color)
- Consistent padding (16-24px)
- Clear hierarchy within card

### Navigation
- Sticky header with backdrop blur
- Clear active state indicator
- Smooth transitions between sections
- Mobile: Hamburger menu with animated lines
- Desktop: Horizontal bar with underline indicator

### Forms
- Clear label positioning (above, not inside)
- Distinctive focus states
- Error states with icons
- Success states with checkmarks
- Input validation feedback (real-time if possible)

### Grid Layouts
- Mobile: 1 column
- Tablet: 2-3 columns
- Desktop: 3-4+ columns
- Gap: 16-24px between items
- Responsive with CSS Grid or Flexbox

## Accessibility Checklist

- [ ] Color contrast ≥ 4.5:1 for normal text, 3:1 for large text
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicators visible and clear
- [ ] Semantic HTML (nav, main, article, section)
- [ ] ARIA labels where needed
- [ ] Alt text for images
- [ ] Form labels associated with inputs
- [ ] Heading hierarchy logical (h1 → h2 → h3)

## Performance Considerations

- Use CSS animations instead of JavaScript when possible
- Optimize images and use modern formats (WebP with fallbacks)
- Lazy load images and components
- Minimize layout thrashing
- Use will-change sparingly for animated elements
