import type { Metadata } from "next";
import { SearchPage } from "@/components/search-page";

export const metadata: Metadata = {
  title: "Search campsites",
  description: "Search Ontario campsites by location, date, equipment, amenities, operator, and availability.",
  alternates: {
    canonical: "/search",
  },
};

export default function Page() {
  return <SearchPage />;
}
