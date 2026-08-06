export type Campaign = {
  slug: string;
  title: string;
  client: string;
  category: string;
  tier: "Basic" | "Standard" | "Premium" | "Platinum";
  term: string;
  cover: string;
  video?: string;
  description: string;
};

// Add new campaigns as new records here. The home "Recently on screen" row,
// the footer tiles, and the /campaigns page all read from this list.
export const campaigns: Campaign[] = [
  {
    slug: "in-house-motion-ad",
    title: "KCA Motion Ad 1",
    client: "In-house demo creative",
    category: "Demo",
    tier: "Platinum",
    term: "On screen now",
    // Replace this cover with a still from the video (or a campaign screenshot)
    // at public/images/campaigns/in-house-motion-ad-cover.webp when available.
    cover: "/images/daytime-billboard.webp",
    video: "/videos/KCA Motion Ad 1.mp4",
    description:
      "An in-house motion ad produced to show the screen's full-HD LED playback in real traffic. It swaps with client campaigns throughout the loop.",
  },
];
