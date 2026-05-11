import { redirect } from "next/navigation";

// Legacy route — kept around because external links and earlier screenshots
// point here. Everything moved under /parks with a Networks / Parks tab pair.
export default function OperatorsRedirect() {
  redirect("/parks");
}
