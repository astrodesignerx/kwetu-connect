import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import { Star } from "@phosphor-icons/react/ssr";

const marqueeItems = [
  { type: "text", content: "Local Focus" },
  { type: "icon", content: "★" },
  { type: "text", content: "Global Reach" },
  { type: "icon", content: "★" },
  { type: "text", content: "Book a Slot" },
  { type: "icon", content: "★" },
  { type: "text", content: "Local Focus" },
  { type: "icon", content: "★" },
  { type: "text", content: "Global Reach" },
  { type: "icon", content: "★" },
  { type: "text", content: "Book a Slot" },
  { type: "icon", content: "★" },
];

export default function HeroAccessories() {
  return (
    <AnimatedSection className="w-full bg-black h-[78px] flex items-center overflow-hidden">
      <AnimatedItem delay={1}>
        <div aria-hidden="true" className="flex flex-row items-center gap-16 whitespace-nowrap animate-marquee w-max">
          {[...marqueeItems, ...marqueeItems].map((item, i) =>
            item.type === "text" ? (
              <span
                key={i}
                className="font-display text-base md:text-xl text-brand-500 leading-none"
              >
                {item.content}
              </span>
            ) : (
              <Star
                key={i}
                size={16}
                weight="fill"
                className="w-4 h-4 md:w-5 md:h-5 text-white shrink-0 leading-none"
              />
            )
          )}
        </div>
      </AnimatedItem>
    </AnimatedSection>
  );
}
