# Effects & Animations

Collected animation and effect implementations for the Kwetu Connect site.

---

## scroll anima

Global smooth scroll with inertia — page glides to a gentle stop instead of halting instantly.

**Color adaptation**: No color-specific code. Drop into any project as-is.

**Library**: `lenis` (1.3.23)

**Component**: `src/components/SmoothScroll.tsx`

```tsx
"use client";

import { useEffect } from "react";
import Lenis from "lenis";

let lenisInstance: Lenis | null = null;

export function getLenis() {
  return lenisInstance;
}

export default function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.1,
      duration: 1.2,
      smoothWheel: true,
    });

    lenisInstance = lenis;

    const raf = (time: number) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      lenisInstance = null;
    };
  }, []);

  return null;
}
```

**Layout integration** (`src/app/layout.tsx`):

```tsx
import SmoothScroll from "@/components/SmoothScroll";

// Inside <body>:
<SmoothScroll />
<Navbar />
<main className="flex-1">{children}</main>
<Footer />
<FloatingButtons />
```

**CSS conflict fix** — must remove `scroll-behavior: smooth` from `html` in globals.css (it causes double-interpolation jitter with Lenis).

**Scroll-to usage** (e.g., hero arrow button):

```tsx
import { getLenis } from "@/components/SmoothScroll";

const lenis = getLenis();
if (lenis) {
  lenis.scrollTo("#target-id", { duration: 1.5 });
} else {
  document.getElementById("target-id")?.scrollIntoView({ behavior: "smooth" });
}
```

**Config**:
| Key | Value | Notes |
|-----|-------|-------|
| `lerp` | `0.1` | Higher values = floatier; lower = snappier but can jitter |
| `duration` | `1.2` | Momentum decay duration in seconds |
| `smoothWheel` | `true` | Smooth mouse wheel events |

---

## spotlight anima

Mouse-tracking radial gold glow that follows the cursor across dark card grids. Fades in on mouse enter, fades out on leave.

**Color adaptation**: Replace `rgba(237, 179, 71, …)` with the new project's accent color. For dark-themed cards, use the accent at 10–20% opacity. For light cards, use a darker shade at 5–10% opacity.

**Component**: `src/components/SpotlightHover.tsx`

```tsx
"use client";

import { useRef, useEffect, useState } from "react";

export default function SpotlightHover({ children }: { children: React.ReactNode }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, opacity: 0 });

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = section.getBoundingClientRect();
      setPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        opacity: 1,
      });
    };

    const handleMouseLeave = () => {
      setPosition((prev) => ({ ...prev, opacity: 0 }));
    };

    section.addEventListener("mousemove", handleMouseMove);
    section.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      section.removeEventListener("mousemove", handleMouseMove);
      section.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div ref={sectionRef} className="relative">
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-500"
        style={{
          opacity: position.opacity,
          background: `radial-gradient(500px circle at ${position.x}px ${position.y}px, rgba(237, 179, 71, 0.15), transparent 50%)`,
        }}
      />
      {children}
    </div>
  );
}
```

**Usage** — wrap a grid of dark cards (example from about page "Why Kwetu" section):

```tsx
{points.map((point) => (
  <AnimatedItem key={point.title} delay={...}>
    <SpotlightHover>
      <div className="relative group rounded-2xl border border-white/5 p-7 bg-[#111111] ...">
        {/* card content */}
      </div>
    </SpotlightHover>
  </AnimatedItem>
))}
```

**How it works**:
1. Wrapper `<div>` tracks mouse position via `mousemove` event
2. A `pointer-events-none` overlay `<div>` renders a radial gradient centered at cursor position
3. Opacity toggles between `0` and `1` on mouse enter/leave via `useState`
4. `transition-opacity duration-500` provides the fade-in/out
5. Gradient is a `500px` gold circle at 15% opacity, fading to transparent at 50% radius

**Config**:
| Key | Value | Notes |
|-----|-------|-------|
| Gradient size | `500px` | Radius of the spotlight glow |
| Opacity | `0.15` | Gold peak opacity (0–1) |
| Fade speed | `500ms` | Mouse enter/leave transition |
| Gold color | `rgba(237, 179, 71, …)` | Matches brand accent `#EDB347` |
| Gradient decay | `50%` | How quickly the glow falls off |

**Used on**:
- About page — "Why Kwetu" 6-card grid
- Home page — "Daily Impact" 3-column stats

---

## tilt anima

3D perspective tilt on hover with a gold radial gradient overlay that fades in. Cards lift, rotate, and glow.

**Color adaptation**: All gold references (`rgba(237, 179, 71, …)`) in `box-shadow`, `border-color`, and the `::before` radial gradient should be replaced with the new project's accent. The `static-card-hover` variant uses `rgba(0, 0, 0, …)` for a shadow effect — adjust to match card background contrast.

**Source**: `src/app/globals.css` — `.mission-vision-card` class

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

**Usage** — add `mission-vision-card relative` to any card element, wrap content in a `z-10` layer:

```tsx
<div className="mission-vision-card relative rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
  <div className="relative z-10">
    <span>Label</span>
    <span>Value</span>
  </div>
</div>
```

**How it works**:
1. `perspective: 1000px` sets up a 3D viewing space on the card
2. `transform-style: preserve-3d` allows children in 3D space
3. On hover: `rotateX(-3deg)` tilts top edge away, `rotateY(3deg)` tilts right edge away, `translateY(-2px)` lifts card 2 pixels
4. `box-shadow` adds depth plus a 1px gold ring that fades in over 0.7s
5. `border-color` transitions to gold over 0.7s
6. `::before` renders a radial gold gradient at top-left corner, opacity 0 → 1 over 0.5s
7. Content wrapper with `relative z-10` keeps text above the gradient overlay
8. `pointer-events: none` on `::before` prevents gradient from blocking clicks

**Variant — static-card-hover** (used on Static-vs-LED comparison):

```css
.static-card-hover::before {
  background: radial-gradient(circle at 20% 20%, rgba(0, 0, 0, 0.06), transparent 60%);
}

.static-card-hover:hover {
  border-color: rgba(0, 0, 0, 0.15);
}
```

Swaps the gold gradient for a subtle black shadow on light-background cards.

**Config**:
| Key | Value | Notes |
|-----|-------|-------|
| `perspective` | `1000px` | 3D depth — lower = more dramatic tilt |
| `rotateX` | `-3deg` | Top edge tilts back |
| `rotateY` | `3deg` | Right edge tilts back |
| `translateY` | `-2px` | Subtle upward lift |
| Overlay gradient | `circle at 20% 20%` | Gold glow position on card |
| Overlay opacity | `0.2` | Gold peak opacity on hover |
| Overlay fade | `0.5s ease` | Gradient reveal speed |
| Transform easing | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Spring-like overshoot |
| Box-shadow transition | `0.7s ease` | Slow fade-in for gold ring + depth |

**Used on**:
- About page — Mission and Vision cards
- Billboard page — Live Unit 01 specification cards (6-cell grid)

---

## greyscale anima

Hover-driven image reveal — card images start in black-and-white and bloom into color with a subtle zoom. On mobile, images display in full color by default.

**Source**: `src/app/about/page.tsx:182` and `src/app/page.tsx:226`

```tsx
<div className="relative rounded-2xl overflow-hidden min-h-[180px] sm:min-h-[220px] md:h-80 group">
  <div
    className="absolute inset-0 bg-cover bg-center md:grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-110"
    style={{ backgroundImage: `url('${image}')` }}
  />
  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/95 to-transparent" />
  <div className="relative h-full flex flex-col ...">
    {/* card label + icon */}
  </div>
</div>
```

**How it works**:
1. Card wrapper has `group` class to trigger child hover styles
2. Image `<div>` is absolutely positioned with `bg-cover bg-center`
3. `md:grayscale` applies the B&W filter on desktop only — mobile gets full color
4. `duration-700` provides a slow, deliberate transition
5. `group-hover:grayscale-0` removes the B&W filter on hover
6. `group-hover:scale-110` zooms the image 10% on hover
7. A gradient overlay (`from-black/95 to-transparent`) masks the bottom half of the image so card labels stay readable

**Color adaptation**: The grayscale filter is color-agnostic. Only the gradient overlay and text colors need adjustment — the `from-black/95` and `to-transparent` gradient may need tweaking for dark vs light card backgrounds.

**Config**:
| Key | Value | Notes |
|-----|-------|-------|
| Filter | `grayscale` | CSS filter: `grayscale(100%)` |
| Scale | `1.1` | 10% zoom on hover |
| Duration | `700ms` | Transition speed |
| Responsive | `md:grayscale` | Full color below 768px, B&W above |
| Gradient overlay | `from-black/95 to-transparent` | Masks bottom 50% for label readability |
| Group trigger | `group / group-hover` | Hover on card triggers image transition |

**Used on**:
- About page — "Who sees your brand?" audience cards (5 cells)
- Home page — "Who we work with" partner category cards (4 cells)
