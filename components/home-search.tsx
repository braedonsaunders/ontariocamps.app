"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, MapPin, Calendar } from "lucide-react";
import { PRESET_LOCATIONS } from "@/lib/locations";

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function HomeSearch() {
  const router = useRouter();
  const [location, setLocation] = useState("toronto");
  const [start, setStart] = useState(todayPlus(30));
  const [end, setEnd] = useState(todayPlus(33));
  const [radius, setRadius] = useState(150);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const preset = PRESET_LOCATIONS[location];
    const sp = new URLSearchParams();
    if (preset) {
      sp.set("lat", String(preset.lat));
      sp.set("lng", String(preset.lng));
      sp.set("loc", location);
    }
    sp.set("radius_km", String(radius));
    sp.set("start_date", start);
    sp.set("end_date", end);
    router.push(`/search?${sp.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="card text-stone-900 p-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr_auto] shadow-xl ring-stone-300/50"
    >
      <div className="flex flex-col">
        <label className="label flex items-center gap-1.5"><MapPin size={12} /> Near</label>
        <select className="field" value={location} onChange={(e) => setLocation(e.target.value)}>
          {Object.entries(PRESET_LOCATIONS).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col">
        <label className="label flex items-center gap-1.5"><Calendar size={12} /> Check-in</label>
        <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="flex flex-col">
        <label className="label flex items-center gap-1.5"><Calendar size={12} /> Check-out</label>
        <input type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="flex flex-col">
        <label className="label">Within (km)</label>
        <input
          type="number"
          min={10}
          max={500}
          step={10}
          className="field"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
        />
      </div>
      <button type="submit" className="btn-primary self-end h-[38px]">
        <Search size={16} /> Search
      </button>
    </form>
  );
}
