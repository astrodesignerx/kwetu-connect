import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import AnimatedSection from "@/components/AnimatedSection";
import AnimatedItem from "@/components/AnimatedItem";
import CampaignCard from "@/components/CampaignCard";
import { campaigns } from "@/data/campaigns";

export default function RecentCampaigns() {
  const featured = campaigns.slice(0, 3);

  return (
    <AnimatedSection className="py-20 lg:py-24 bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-12">
          <div>
            <h2 className="text-3xl sm:text-4xl lg:text-[3.5rem] font-bold leading-tight tracking-[-0.02em] text-white">
              Recently on screen
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed mt-4 max-w-xl">
              Campaigns running now and recently on our LED billboard at Kisumu
              Ndogo Road.
            </p>
          </div>
          <Link
            href="/campaigns"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-brand-400 transition-colors no-underline mt-6 sm:mt-0 shrink-0"
          >
            View all campaigns
            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((campaign, i) => (
            <AnimatedItem key={campaign.slug} delay={Math.min(i + 2, 4)}>
              <CampaignCard campaign={campaign} />
            </AnimatedItem>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}
