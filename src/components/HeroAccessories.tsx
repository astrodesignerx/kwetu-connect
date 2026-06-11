import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";

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
        <div className="flex flex-row items-center gap-16 whitespace-nowrap animate-marquee w-max">
          {[...marqueeItems, ...marqueeItems].map((item, i) =>
            item.type === "text" ? (
              <span
                key={i}
                className="font-[family-name:var(--font-playfair)] text-base md:text-xl text-[#EDB347] leading-none"
              >
                {item.content}
              </span>
            ) : (
              <span
                key={i}
                className="text-base md:text-xl text-white leading-none"
              >
                {item.content}
              </span>
            )
          )}
        </div>
      </AnimatedItem>
    </AnimatedSection>
  );
}
