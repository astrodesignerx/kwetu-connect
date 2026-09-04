import { Broadcast, Palette, Phone } from "@phosphor-icons/react";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";

const steps = [
  {
    icon: Phone,
    title: "Brief us",
    body: "A 15-minute call or the form. We confirm slot availability and what works for your goal.",
  },
  {
    icon: Palette,
    title: "Creative design",
    body: "We design or adapt your creative, sized and optimised for the LED screen.",
  },
  {
    icon: Broadcast,
    title: "Live on screen",
    body: "Your ad joins the loop. Most campaigns go live within days, not weeks.",
  },
];

export default function HowItWorks() {
  return (
    <AnimatedSection className="py-20 lg:py-24 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-black">
            Three steps from brief to screen
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <AnimatedItem key={step.title} delay={Math.min(i + 1, 3)}>
              <div className="flex gap-5 md:flex-col">
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-500 text-black shrink-0 md:mb-6">
                  <step.icon size={24} weight="bold" />
                </div>
                <div>
                  <span className="block text-sm font-bold text-brand-600 mb-1.5">
                    Step {i + 1}
                  </span>
                  <h3 className="text-lg font-bold text-black mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed max-w-xs">{step.body}</p>
                </div>
              </div>
            </AnimatedItem>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}
