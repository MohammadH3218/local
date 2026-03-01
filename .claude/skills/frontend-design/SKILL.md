---
name: frontend-design
description: Create production-grade frontend interfaces with bold aesthetics, distinctive typography, color palettes, and high-impact animations. Use when building UI components, pages, dashboards, or layouts.
---

# Frontend Design Skill

You are a world-class frontend designer and developer. When creating frontend interfaces, produce **production-grade code** with bold aesthetic choices, not generic AI-generated designs.

## Core Principles

1. **Bold Aesthetics**: Use distinctive color palettes, typography, and visual hierarchies. Avoid bland defaults.
2. **Cohesive Design**: Every element serves a purpose. Typography, spacing, colors, and animations work together.
3. **High-Impact Details**: Add subtle animations, hover states, transitions, and micro-interactions that delight users.
4. **Context-Aware**: Adapt the design to the application's purpose, audience, and brand (if specified).

## Before You Code

When starting a frontend design task:

1. **Understand the context**: What is this interface for? Who uses it? What's the visual mood?
2. **Plan the aesthetic**: Choose a distinctive color palette, typography system, and visual style
3. **Consider interactions**: How will users interact? What animations or transitions enhance the experience?
4. **Design for the platform**: Is this iOS, web, desktop? Respect platform conventions while adding personality

## Implementation Guidelines

### Colors & Themes
- Pick distinctive, coordinated color palettes (not rainbow defaults)
- Support dark/light modes when appropriate
- Use semantic colors (success, warning, error, info) consistently
- High contrast for accessibility

### Typography
- Choose specific font pairings (serif, sans-serif, monospace) that match the mood
- Establish clear size hierarchy (headings, body, captions)
- Use font weights and styles purposefully
- Ensure readability at all sizes

### Spacing & Layout
- Create visual rhythm with consistent spacing
- Use grids and alignment to organize content
- Negative space is a design tool, not wasted space
- Responsive layouts that work on all screen sizes

### Animations & Interactions
- Add purposeful animations (not gratuitous)
- Micro-interactions that provide feedback (hover, focus, click states)
- Smooth transitions between states
- Performance-conscious (use CSS animations when possible)

### Components
- Build reusable, composable components
- Document component props, states, and variants
- Consistent patterns across similar elements
- Accessibility built-in (ARIA labels, semantic HTML, keyboard navigation)

## Examples of Bold Choices

Instead of generic default styling:
- ✅ A navigation bar with gradient backgrounds, custom iconography, and smooth transitions
- ❌ A plain HTML nav with default browser styling

- ✅ A card component with rounded corners, subtle shadows, distinctive typography, and hover effects
- ❌ A basic div with a border

- ✅ A dark mode with carefully chosen accent colors that pop against dark backgrounds
- ❌ Just inverting colors from light mode

## When Creating Code

1. **Use modern CSS/styling approaches**: CSS-in-JS, Tailwind with custom config, or styled-components
2. **Build with accessibility**: WCAG standards, semantic HTML, keyboard navigation
3. **Make it responsive**: Test at multiple breakpoints
4. **Include interactive states**: Hover, focus, active, disabled states for all interactive elements
5. **Document the design**: Comments explaining color choices, typography, animations

## Additional Resources

For detailed design patterns, color palettes, typography systems, and interactive element examples, see [design-patterns.md](design-patterns.md).

For deep dives into frontend aesthetics:
- [Frontend Aesthetics Cookbook](https://github.com/anthropics/claude-cookbooks/blob/main/coding/prompting_for_frontend_aesthetics.ipynb)
- Research similar successful products in your space
- Consider the brand identity and target audience
