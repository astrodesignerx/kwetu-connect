export type Campaign = {
  slug: string;
  title: string;
  client: string;
  category: string;
  tier: "Basic" | "Standard" | "Premium" | "Platinum";
  term: string;
  cover: string;
  video?: string;
  // Full-resolution copy used by the /campaigns theater and fullscreen
  // player. The 360p `video` stays as the lightweight preview for the
  // home marquee and filmstrip.
  videoHd?: string;
  description: string;
};

// Add new campaigns as new records here. The home "Recently on screen" row,
// the footer tiles, and the /campaigns page all read from this list.
// 6 on-screen adverts: 3 KCA Placeholders (1, 2, 5) + 3 client campaigns.
export const campaigns: Campaign[] = [
  {
    slug: "kca-placeholder-01",
    title: "KCA Placeholder 01",
    client: "Kwetu Connect",
    category: "House",
    tier: "Premium",
    term: "On screen now",
    cover: "/images/campaigns/kca-placeholder-01.webp",
    video: "/videos/recent/kca-placeholder-01.mp4",
    videoHd: "/videos/theater/kca-placeholder-01.mp4",
    description:
      "House placeholder creative running between client bookings — bold type and motion to keep the screen live.",
  },
  {
    slug: "kca-placeholder-02",
    title: "KCA Placeholder 02",
    client: "Kwetu Connect",
    category: "House",
    tier: "Premium",
    term: "On screen now",
    cover: "/images/campaigns/kca-placeholder-02.webp",
    video: "/videos/recent/kca-placeholder-02.mp4",
    videoHd: "/videos/theater/kca-placeholder-02.mp4",
    description:
      "House placeholder highlighting platform reach and booking availability when no client campaign fills the slot.",
  },
  {
    slug: "kca-placeholder-05",
    title: "KCA Placeholder 05",
    client: "Kwetu Connect",
    category: "House",
    tier: "Premium",
    term: "On screen now",
    cover: "/images/campaigns/kca-placeholder-05.webp",
    video: "/videos/recent/kca-placeholder-05.mp4",
    videoHd: "/videos/theater/kca-placeholder-05.mp4",
    description:
      "House placeholder with kinetic type and gold-black brand system — keeps dwell time high between paid campaigns.",
  },
  {
    slug: "elements-staffing",
    title: "Elements Staffing",
    client: "Elements Staffing & Nursingly",
    category: "Healthcare",
    tier: "Premium",
    term: "Recently on screen",
    cover: "/images/campaigns/elements-staffing.webp",
    video: "/videos/recent/elements-staffing.mp4",
    videoHd: "/videos/theater/elements-staffing.mp4",
    description:
      "Healthcare staffing campaign for Elements Staffing & Nursingly — running on the Kisumu Ndogo Road LED.",
  },
  {
    slug: "eagle-creek",
    title: "Eagle Creek",
    client: "Eagle Creek Kenya Limited",
    category: "Hospitality",
    tier: "Premium",
    term: "Recently on screen",
    cover: "/images/campaigns/eagle-creek.webp",
    video: "/videos/recent/eagle-creek.mp4",
    videoHd: "/videos/theater/eagle-creek.mp4",
    description:
      "Hospitality campaign for Eagle Creek Kenya Limited — full-screen motion creative on the Eldoret LED.",
  },
  {
    slug: "lacata-dairies",
    title: "Lacata Dairies",
    client: "Lacata Dairies",
    category: "FMCG",
    tier: "Premium",
    term: "Recently on screen",
    cover: "/images/campaigns/lacata-dairies.webp",
    video: "/videos/recent/lacata-dairies.mp4",
    videoHd: "/videos/theater/lacata-dairies.mp4",
    description:
      "FMCG campaign for Lacata Dairies — dairy brand motion spot in the recent on-screen loop.",
  },
];
