import type { Operator } from "../types";

export type ProviderParkConfig = {
  provider: "campspot" | "letscamp";
  slug: string;
  name: string;
  region: string;
  vendorUrl: string;
};

export type OperatorConfig = Operator & {
  providerParks?: ProviderParkConfig[];
};

const ONTARIO_PARKS: OperatorConfig = {
  id: "ontario_parks", name: "Ontario Parks", vendor: "camis5",
  base_url: "https://reservations.ontarioparks.ca",
  booking_url: "https://reservations.ontarioparks.ca/create-booking/results",
  active: true,
};

const PARKS_CANADA: OperatorConfig = {
  id: "parks_canada", name: "Parks Canada", vendor: "pcrs",
  base_url: "https://reservation.pc.gc.ca",
  booking_url: "https://reservation.pc.gc.ca/create-booking/results",
  active: true,
};

const ST_LAWRENCE_PARKS: OperatorConfig = {
  id: "st_lawrence_parks", name: "Parks of the St. Lawrence", vendor: "camis5",
  base_url: "https://reservations.parks.on.ca",
  booking_url: "https://reservations.parks.on.ca/create-booking/results",
  active: true,
};

function gtc(id: string, name: string, host: string): OperatorConfig {
  return {
    id: `gtc_${id}`, name, vendor: "goingtocamp",
    base_url: `https://${host}`,
    booking_url: `https://${host}/create-booking/results`,
    active: true,
  };
}

export const OPERATORS: OperatorConfig[] = [
  ONTARIO_PARKS,
  PARKS_CANADA,
  ST_LAWRENCE_PARKS,
  gtc("lprca",        "Long Point Region CA",   "longpoint.goingtocamp.com"),
  gtc("stclair",      "St. Clair Region CA",    "stclair.goingtocamp.com"),
  gtc("otonabee",     "Otonabee Region CA",     "otonabee.goingtocamp.com"),
  gtc("npca",         "Niagara Peninsula CA",   "niagara.goingtocamp.com"),
  gtc("trca",         "Toronto and Region CA",  "camping.trca.ca"),
  gtc("grca",         "Grand River CA",         "www.grcacamping.ca"),
  gtc("upperthames",  "Upper Thames River CA",  "upperthames.goingtocamp.com"),
  gtc("maitland",     "Maitland Valley CA",     "maitlandvalley.goingtocamp.com"),
  gtc("catfish",      "Catfish Creek CA",       "catfishcreek.goingtocamp.com"),
  gtc("hca",          "Hamilton Conservation Authority", "hcareservations.ca"),
  {
    id: "campspot_saugeen",
    name: "Saugeen Valley Conservation Authority",
    vendor: "campspot",
    base_url: "https://www.campspot.com",
    booking_url: "https://www.campspot.com/book",
    active: true,
    providerParks: [
      {
        provider: "campspot",
        slug: "durham",
        name: "Durham Conservation Area",
        region: "Southwestern Ontario",
        vendorUrl: "https://www.campspot.com/book/durham",
      },
      {
        provider: "campspot",
        slug: "saugeenbluffs",
        name: "Saugeen Bluffs Conservation Area",
        region: "Southwestern Ontario",
        vendorUrl: "https://www.campspot.com/book/saugeenbluffs",
      },
    ],
  },
  {
    id: "campspot_rrca",
    name: "Raisin Region Conservation Authority",
    vendor: "campspot",
    base_url: "https://www.campspot.com",
    booking_url: "https://www.campspot.com/book",
    active: true,
    providerParks: [
      {
        provider: "campspot",
        slug: "charlottenburghpark",
        name: "Charlottenburgh Park",
        region: "Eastern Ontario",
        vendorUrl: "https://www.campspot.com/book/charlottenburghpark",
      },
    ],
  },
  {
    id: "letscamp_quinte",
    name: "Quinte Conservation",
    vendor: "letscamp",
    base_url: "https://letscamp.ca",
    booking_url: "https://letscamp.ca/camps",
    active: true,
    providerParks: [
      {
        provider: "letscamp",
        slug: "depot-lakes",
        name: "Depot Lakes Conservation Area",
        region: "Eastern Ontario",
        vendorUrl: "https://letscamp.ca/camps/depot-lakes",
      },
    ],
  },
  {
    id: "letscamp_lowerthames",
    name: "Lower Thames Valley Conservation Authority",
    vendor: "letscamp",
    base_url: "https://letscamp.ca",
    booking_url: "https://letscamp.ca/camps",
    active: true,
    providerParks: [
      {
        provider: "letscamp",
        slug: "big-bend",
        name: "Big Bend Conservation Area",
        region: "Southwestern Ontario",
        vendorUrl: "https://letscamp.ca/camps/big-bend",
      },
      {
        provider: "letscamp",
        slug: "cm-wilson",
        name: "C.M. Wilson Conservation Area",
        region: "Southwestern Ontario",
        vendorUrl: "https://letscamp.ca/camps/cm-wilson",
      },
    ],
  },
];

