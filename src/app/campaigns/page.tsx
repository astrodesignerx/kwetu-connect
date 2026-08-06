import type { Metadata } from "next";
import CampaignCard from "@/components/CampaignCard";
import { campaigns } from "@/data/campaigns";

export const metadata: Metadata = {
  title: "Recently on Screen — Campaigns on Our Eldoret LED Billboard",
  description:
    "Campaigns running now and recently on Kwetu Connect's LED billboard on Kisumu Ndogo Road, Eldoret — with real motion creative from the screen.",
  alternates: { canonical: "/campaigns" },
};

export default function CampaignsPage() {
  return (
    <>
      <section className="relative py-[calc(7rem+30px)] lg:py-[calc(9rem+30px)] bg-black text-white overflow-hidden">
        <div
          className="absolute -top-[88px] left-0 right-0 bottom-0 bg-cover bg-center hero-bg"
          style={{ backgroundImage: "url('/images/hero-billboard.webp')" }}
        />
        <div className="absolute -top-[88px] left-0 right-0 bottom-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              Recently on screen
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              Campaigns running now and recently on our LED billboard at Kisumu
              Ndogo Road, Eldoret.
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24 bg-black">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <CampaignCard key={campaign.slug} campaign={campaign} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
