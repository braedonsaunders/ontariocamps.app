import Link from "next/link";
import { Tent } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-24 text-center">
      <Tent size={48} className="text-forest-700 mx-auto" />
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">No such trailhead.</h1>
      <p className="mt-2 text-stone-600">
        The page you were looking for doesn&apos;t exist on ontariocamps.app.
      </p>
      <Link href="/" className="btn-primary mt-6">Back to the trail</Link>
    </div>
  );
}
