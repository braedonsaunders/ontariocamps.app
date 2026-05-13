"use client";

import { useState, useCallback } from "react";
import { Star, Send, MessageSquare, ChevronDown, ChevronUp, User } from "lucide-react";
import type { SiteReview, ParkReview, SiteReviewAggregate, ParkReviewAggregate, SiteReviewInput, ParkReviewInput } from "@/lib/types";
import { SITE_RATING_ATTRS, PARK_RATING_ATTRS } from "@/lib/types";

// ─── Star display ────────────────────────────────────────────────────────────

function ratingNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function Stars({ value, size = 14 }: { value: number | string; size?: number }) {
  const rating = ratingNumber(value) ?? 0;
  return (
    <span className="inline-flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          className={i < Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-stone-300"}
        />
      ))}
    </span>
  );
}

function NumericRating({ value }: { value: number | string | null }) {
  const rating = ratingNumber(value);
  if (rating === null) return null;
  return (
    <span className="text-sm font-semibold text-stone-900 tabular-nums">
      {rating.toFixed(1)}
    </span>
  );
}

// ─── Aggregate display ───────────────────────────────────────────────────────

type AttributeRating = { label: string; value: number | null };

function AggregateBar({ label, value }: AttributeRating) {
  const rating = ratingNumber(value);
  if (rating === null) return null;
  const pct = (rating / 5) * 100;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-stone-600 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <NumericRating value={rating} />
    </div>
  );
}

export function SiteReviewAggregateDisplay({
  aggregate,
}: {
  aggregate: SiteReviewAggregate;
}) {
  if (aggregate.review_count === 0) return null;

  const attrs: AttributeRating[] = [
    { label: "Privacy", value: aggregate.rating_privacy },
    { label: "Cleanliness", value: aggregate.rating_cleanliness },
    { label: "Quietness", value: aggregate.rating_noise },
    { label: "Site size", value: aggregate.rating_site_size },
    { label: "Shade", value: aggregate.rating_shade },
    { label: "Cell service", value: aggregate.rating_cell_service },
  ].filter((a) => a.value !== null);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <Stars value={aggregate.rating_avg ?? 0} size={20} />
        <NumericRating value={aggregate.rating_avg} />
        <span className="text-sm text-stone-500">
          {aggregate.review_count} {aggregate.review_count === 1 ? "review" : "reviews"}
        </span>
      </div>
      {attrs.length > 0 && (
        <div className="space-y-2">
          {attrs.map((a) => (
            <AggregateBar key={a.label} {...a} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ParkReviewAggregateDisplay({
  aggregate,
}: {
  aggregate: ParkReviewAggregate;
}) {
  if (aggregate.review_count === 0) return null;

  const attrs: AttributeRating[] = [
    { label: "Facilities", value: aggregate.rating_facilities },
    { label: "Trails", value: aggregate.rating_trails },
    { label: "Beach / Water", value: aggregate.rating_beach },
    { label: "Privacy", value: aggregate.rating_privacy },
    { label: "Quietness", value: aggregate.rating_noise },
    { label: "Cell service", value: aggregate.rating_cell_service },
  ].filter((a) => a.value !== null);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <Stars value={aggregate.rating_avg ?? 0} size={20} />
        <NumericRating value={aggregate.rating_avg} />
        <span className="text-sm text-stone-500">
          {aggregate.review_count} {aggregate.review_count === 1 ? "review" : "reviews"}
        </span>
      </div>
      {attrs.length > 0 && (
        <div className="space-y-2">
          {attrs.map((a) => (
            <AggregateBar key={a.label} {...a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Review card ─────────────────────────────────────────────────────────────

function SubRatings({ review }: { review: SiteReview | ParkReview }) {
  const entries: Array<{ label: string; value: number | null }> = [];

  if ("cleanliness" in review) {
    for (const attr of SITE_RATING_ATTRS) {
      const v = (review as SiteReview)[attr.key];
      if (v !== null && v !== undefined) entries.push({ label: attr.label, value: v });
    }
  }
  if ("facilities" in review) {
    for (const attr of PARK_RATING_ATTRS) {
      const v = (review as ParkReview)[attr.key];
      if (v !== null && v !== undefined) entries.push({ label: attr.label, value: v });
    }
  }

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-600">
      {entries.map((e) => (
        <span key={e.label} className="inline-flex items-center gap-1">
          {e.label} <Stars value={e.value ?? 0} size={10} />
        </span>
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  siteName,
}: {
  review: SiteReview | ParkReview;
  siteName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = review.body.length > 280;
  const displayBody = isLong && !expanded ? review.body.slice(0, 280) + "..." : review.body;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center">
            <User size={12} />
          </span>
          <span className="text-sm font-medium text-stone-900">{review.author_handle}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Stars value={review.overall} size={12} />
          {review.visited_at && (
            <span className="text-xs text-stone-400">
              {new Date(review.visited_at + "T00:00:00Z").toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" })}
            </span>
          )}
        </div>
      </div>

      {siteName && (
        <div className="text-xs text-stone-500 mt-1">Site {siteName}</div>
      )}

      {review.title && (
        <div className="text-sm font-semibold text-stone-900 mt-2">{review.title}</div>
      )}

      <p className="text-sm text-stone-700 mt-1.5 leading-relaxed whitespace-pre-line">
        {displayBody}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-forest-700 hover:text-forest-800 mt-1 inline-flex items-center gap-0.5"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      <SubRatings review={review} />

      <div className="text-xs text-stone-400 mt-2">
        {new Date(review.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
      </div>
    </div>
  );
}

// ─── Review list ─────────────────────────────────────────────────────────────

export function SiteReviewList({
  reviews,
}: {
  reviews: SiteReview[];
}) {
  if (reviews.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-stone-500">
        <MessageSquare size={20} className="mx-auto mb-2 text-stone-400" />
        No reviews yet. Be the first to share your experience!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
    </div>
  );
}

export function ParkReviewList({
  reviews,
  siteReviews,
}: {
  reviews: ParkReview[];
  siteReviews?: Array<SiteReview & { site_name: string }>;
}) {
  const hasParkReviews = reviews.length > 0;
  const hasSiteReviews = siteReviews && siteReviews.length > 0;

  if (!hasParkReviews && !hasSiteReviews) {
    return (
      <div className="card p-6 text-center text-sm text-stone-500">
        <MessageSquare size={20} className="mx-auto mb-2 text-stone-400" />
        No reviews yet. Be the first to share your experience!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {hasParkReviews && (
        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-3">Park reviews</h3>
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
          </div>
        </div>
      )}
      {hasSiteReviews && (
        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-3">Recent campsite reviews</h3>
          <div className="space-y-3">
            {siteReviews!.map((r) => (
              <ReviewCard key={r.id} review={r} siteName={r.site_name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Interactive star input ──────────────────────────────────────────────────

function StarInput({
  value,
  onChange,
  size = 20,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <span className="inline-flex gap-0.5" onMouseLeave={() => setHovered(0)}>
      {Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        const active = n <= (hovered || value);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            className="p-0.5 transition-colors"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <Star
              size={size}
              className={active ? "fill-amber-400 text-amber-400" : "text-stone-300 hover:text-amber-300"}
            />
          </button>
        );
      })}
    </span>
  );
}

// ─── Review form ─────────────────────────────────────────────────────────────

type FormStatus = "idle" | "submitting" | "success" | "error";

function useReviewForm<T extends { id: string }>(
  endpoint: string,
  buildPayload: (data: Record<string, unknown>) => Record<string, unknown>,
) {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (data: Record<string, unknown>) => {
      setStatus("submitting");
      setError(null);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(data)),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to submit review");
        }
        setStatus("success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setStatus("error");
      }
    },
    [endpoint, buildPayload],
  );

  return { status, error, submit };
}

export function SiteReviewForm({ siteId }: { siteId: string }) {
  const [handle, setHandle] = useState("");
  const [overall, setOverall] = useState(0);
  const [attrs, setAttrs] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visitedAt, setVisitedAt] = useState("");

  const { status, error, submit } = useReviewForm(
    "/api/reviews/site",
    (data) => ({
      site_id: siteId,
      author_handle: data.author_handle,
      overall: data.overall,
      privacy: data.privacy || undefined,
      cleanliness: data.cleanliness || undefined,
      noise: data.noise || undefined,
      site_size: data.site_size || undefined,
      shade: data.shade || undefined,
      cell_service: data.cell_service || undefined,
      title: (data.title as string) || undefined,
      body: data.body,
      visited_at: (data.visited_at as string) || undefined,
    }),
  );

  if (status === "success") {
    return (
      <div className="card p-5 text-center">
        <div className="text-sm font-medium text-forest-700">Review submitted!</div>
        <p className="text-xs text-stone-500 mt-1">Thanks for sharing your experience.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (overall === 0 || !handle.trim() || !body.trim()) return;
        submit({ author_handle: handle, overall, ...attrs, title, body, visited_at: visitedAt });
      }}
      className="card p-5 space-y-4"
    >
      <div className="text-sm font-semibold text-stone-900">Write a review</div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Your name"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={40}
          required
          className="field max-w-[200px]"
        />
        <div className="flex items-center gap-2">
          <span className="label mb-0">Overall</span>
          <StarInput value={overall} onChange={setOverall} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {SITE_RATING_ATTRS.map((attr) => (
          <div key={attr.key} className="flex items-center gap-2">
            <span className="text-xs text-stone-600 w-16 shrink-0">{attr.label}</span>
            <StarInput
              value={attrs[attr.key] ?? 0}
              onChange={(v) => setAttrs((prev) => ({ ...prev, [attr.key]: v }))}
              size={16}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="field"
        />
        <input
          type="date"
          value={visitedAt}
          onChange={(e) => setVisitedAt(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="field"
          placeholder="When did you visit?"
        />
      </div>

      <textarea
        placeholder="Share your experience (10 characters minimum)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={10}
        maxLength={2000}
        rows={3}
        className="field resize-y"
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <button
        type="submit"
        disabled={status === "submitting" || overall === 0 || !handle.trim() || !body.trim()}
        className="btn-primary"
      >
        {status === "submitting" ? "Submitting..." : <><Send size={14} /> Submit review</>}
      </button>
    </form>
  );
}

export function ParkReviewForm({ parkId }: { parkId: string }) {
  const [handle, setHandle] = useState("");
  const [overall, setOverall] = useState(0);
  const [attrs, setAttrs] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visitedAt, setVisitedAt] = useState("");

  const { status, error, submit } = useReviewForm(
    "/api/reviews/park",
    (data) => ({
      park_id: parkId,
      author_handle: data.author_handle,
      overall: data.overall,
      facilities: data.facilities || undefined,
      trails: data.trails || undefined,
      beach: data.beach || undefined,
      privacy: data.privacy || undefined,
      noise: data.noise || undefined,
      cell_service: data.cell_service || undefined,
      title: (data.title as string) || undefined,
      body: data.body,
      visited_at: (data.visited_at as string) || undefined,
    }),
  );

  if (status === "success") {
    return (
      <div className="card p-5 text-center">
        <div className="text-sm font-medium text-forest-700">Review submitted!</div>
        <p className="text-xs text-stone-500 mt-1">Thanks for sharing your experience.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (overall === 0 || !handle.trim() || !body.trim()) return;
        submit({ author_handle: handle, overall, ...attrs, title, body, visited_at: visitedAt });
      }}
      className="card p-5 space-y-4"
    >
      <div className="text-sm font-semibold text-stone-900">Write a review</div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Your name"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          maxLength={40}
          required
          className="field max-w-[200px]"
        />
        <div className="flex items-center gap-2">
          <span className="label mb-0">Overall</span>
          <StarInput value={overall} onChange={setOverall} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
        {PARK_RATING_ATTRS.map((attr) => (
          <div key={attr.key} className="flex items-center gap-2">
            <span className="text-xs text-stone-600 w-20 shrink-0">{attr.label}</span>
            <StarInput
              value={attrs[attr.key] ?? 0}
              onChange={(v) => setAttrs((prev) => ({ ...prev, [attr.key]: v }))}
              size={16}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="field"
        />
        <input
          type="date"
          value={visitedAt}
          onChange={(e) => setVisitedAt(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className="field"
        />
      </div>

      <textarea
        placeholder="Share your experience (10 characters minimum)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        minLength={10}
        maxLength={2000}
        rows={3}
        className="field resize-y"
      />

      {error && <div className="text-xs text-red-600">{error}</div>}

      <button
        type="submit"
        disabled={status === "submitting" || overall === 0 || !handle.trim() || !body.trim()}
        className="btn-primary"
      >
        {status === "submitting" ? "Submitting..." : <><Send size={14} /> Submit review</>}
      </button>
    </form>
  );
}
