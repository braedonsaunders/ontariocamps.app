// Client-safe preset locations. Kept in its own module so client components
// can import them without pulling in any server-only data-source code.

export const PRESET_LOCATIONS: Record<string, { lat: number; lng: number; label: string }> = {
  toronto: { lat: 43.6532, lng: -79.3832, label: "Toronto" },
  hamilton: { lat: 43.2557, lng: -79.8711, label: "Hamilton" },
  burlington: { lat: 43.3255, lng: -79.799, label: "Burlington" },
  kitchener: { lat: 43.4516, lng: -80.4925, label: "Kitchener–Waterloo" },
  ottawa: { lat: 45.4215, lng: -75.6972, label: "Ottawa" },
  london: { lat: 42.9849, lng: -81.2453, label: "London" },
  sudbury: { lat: 46.4917, lng: -80.993, label: "Sudbury" },
  kingston: { lat: 44.2312, lng: -76.481, label: "Kingston" },
  barrie: { lat: 44.3894, lng: -79.6903, label: "Barrie" },
  nobel: { lat: 45.4167, lng: -80.1, label: "Nobel" },
  thunder_bay: { lat: 48.3809, lng: -89.2477, label: "Thunder Bay" },
  windsor: { lat: 42.3149, lng: -83.0364, label: "Windsor" },
};
