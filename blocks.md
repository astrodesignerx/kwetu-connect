# blocks

A portable collection of reusable UI block patterns for React + Tailwind projects.

---

## tilt cards

Side-by-side statement cards with 3D perspective tilt, gold radial glow overlay, and icon badges. Ideal for mission/vision pairs, value propositions, or any paired messaging.

**Animation**: [tilt anima](anima.md#tilt-anima) — `perspective`, `rotateX/Y`, gold `::before` overlay, border-color transition.
**Entry animation**: [AnimatedItem](anima.md) — staggered fade-up on scroll (delay 1 and 2).

### Outlook

```
┌──────────────────────┐  ┌──────────────────────┐
│  OUR MISSION    ↗     │  │  OUR VISION      ★   │
│                        │  │                       │
│  To connect businesses │  │  To become the most   │
│  and communities...    │  │  trusted outdoor...   │
│                        │  │                       │
└──────────────────────┘  └──────────────────────┘
   rounded-2xl border       rounded-2xl border
   bg-white shadow-sm       bg-white shadow-sm
```

- Two equal-width cards in a `md:grid-cols-2 gap-12`
- Each has a gold eyebrow label, an icon badge, and a serif paragraph
- Icons sit in a `rounded-full border border-[accent]/40 p-1.5` badge

### Code

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-12">
  {items.map((item, i) => (
    <AnimatedItem key={item.label} delay={i + 1}>
      <div className="mission-vision-card relative rounded-2xl border border-gray-200 bg-white shadow-sm h-full">
        <div className="relative z-10 p-10 h-full">
          <div className="flex items-start justify-between mb-4">
            <span className="text-xs font-semibold text-accent uppercase tracking-wider">
              {item.label}
            </span>
            <div className="rounded-full border border-accent/40 p-1.5">
              <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
            </div>
          </div>
          <p className="text-lg md:text-xl text-gray-700 leading-normal font-serif">
            {item.body}
          </p>
        </div>
      </div>
    </AnimatedItem>
  ))}
</div>
```

### CSS

```css
.mission-vision-card {
  perspective: 1000px;
  transform-style: preserve-3d;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.7s ease, border-color 0.7s ease;
}

.mission-vision-card:hover {
  transform: rotateX(-3deg) rotateY(3deg) translateY(-2px);
  box-shadow: 0 0 0 1px rgba(237, 179, 71, 0.4), 0 20px 40px rgba(0, 0, 0, 0.4);
  border-color: rgba(237, 179, 71, 0.4);
}

.mission-vision-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 20% 20%, rgba(237, 179, 71, 0.2), transparent 60%);
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
}

.mission-vision-card:hover::before {
  opacity: 1;
}
```

### Hover animation

| Property | Value | Notes |
|----------|-------|-------|
| `rotateX` | `-3deg` | Top edge tilts back |
| `rotateY` | `3deg` | Right edge tilts back |
| `translateY` | `-2px` | Subtle upward lift |
| `box-shadow` | `0 0 0 1px gold, 0 20px 40px black` | Gold ring + depth shadow |
| `border-color` | `gold 40%` | Transitions to gold over 0.7s |
| `::before` radial gradient | `circle at 20% 20%, gold 20% → transparent 60%` | Fades in over 0.5s |

### Icons

Two SVG icons used as badges, both inside `rounded-full border border-accent/40 p-1.5`:

**Mission icon** — diagonal arrow (growth / outward reach):
```svg
<svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M7 7h10v10" />
</svg>
```

**Vision icon** — star (aspiration / excellence):
```svg
<svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
</svg>
```

**Color adaptation**: Replace all `#EDB347`, `#A97316`, and `gold` references with the new project's accent color. Use the brighter shade for icons and `::before`, and the darker shade for eyebrow labels.

### Config

| Key | Value | Notes |
|-----|-------|-------|
| Layout | `md:grid-cols-2 gap-12` | Two equal cards, stacks on mobile |
| Card | `mission-vision-card rounded-2xl border border-gray-200 bg-white shadow-sm p-10` | White card with 3D hover |
| Content wrapper | `relative z-10` | Stays above `::before` overlay |
| Eyebrow | `text-xs font-semibold text-[dark-accent] uppercase tracking-wider` | Small bold label |
| Paragraph | `text-lg md:text-xl text-gray-700 leading-normal font-serif` | Serif body copy |
| Icon badge | `rounded-full border border-[accent]/40 p-1.5` | Gold-rimmed circle |
| Entry delay | `delay={1}` / `delay={2}` | Staggered fade-up |

### Dependencies

- [tilt anima](anima.md#tilt-anima) — CSS class for the card hover effect
- [AnimatedItem](anima.md) — scroll-triggered fade-up wrapper (or use any reveal component)
