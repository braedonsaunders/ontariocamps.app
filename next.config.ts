import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Park hero photos sourced from each operator's Camis/PCRS/GoingToCamp images CDN.
      { protocol: "https", hostname: "reservations.ontarioparks.ca" },
      { protocol: "https", hostname: "reservation.pc.gc.ca" },
      { protocol: "https", hostname: "*.goingtocamp.com" },
      { protocol: "https", hostname: "www.grcacamping.ca" },
      { protocol: "https", hostname: "camping.trca.ca" },
      // Operator marketing-site logos.
      { protocol: "https", hostname: "www.ontarioparks.ca" },
      { protocol: "https", hostname: "parks.canada.ca" },
      { protocol: "https", hostname: "www.grandriver.ca" },
      { protocol: "https", hostname: "trca.ca" },
      { protocol: "https", hostname: "npca.ca" },
      { protocol: "https", hostname: "www.scrca.on.ca" },
      { protocol: "https", hostname: "www.otonabeeconservation.com" },
      { protocol: "https", hostname: "www.lprca.on.ca" },
    ],
  },
};

export default nextConfig;
