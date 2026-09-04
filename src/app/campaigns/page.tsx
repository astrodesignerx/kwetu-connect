import type { Metadata } from "next";
import CampaignTheater from "@/components/CampaignTheater";

export const metadata: Metadata = {
  title: "Recently on Screen — Campaigns on Our Eldoret LED Billboard",
  description:
    "Campaigns running now and recently on Kwetu Connect's LED billboard on Kisumu Ndogo Road, Eldoret — with real motion creative from the screen.",
  alternates: { canonical: "/campaigns" },
};

export default function CampaignsPage() {
  return (
    <>
      <section className="relative pt-[calc(7rem+30px)] lg:pt-[calc(9rem+30px)] pb-10 lg:pb-12 bg-ink text-white overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-[2rem] xs:text-[2.5rem] sm:text-5xl lg:text-[4.5rem] font-extrabold leading-tight tracking-[-0.02em] mb-6">
              Recently on <span className="italic text-brand-500">screen</span>
            </h1>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed max-w-2xl">
              Campaigns running now and recently on our LED billboard at Kisumu
              Ndogo Road, Eldoret.
            </p>
          </div>
        </div>
      </section>

      <section className="pt-10 lg:pt-12 pb-20 lg:pb-24 bg-ink overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <CampaignTheater />
        </div>
      </section>
    </>
  );
}
