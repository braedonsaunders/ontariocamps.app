import type { Metadata } from "next";
import { SearchPage } from "@/components/search-page";

export const metadata: Metadata = {
  title: "Search campsites",
};

export default function Page() {
  return <SearchPage />;
}
