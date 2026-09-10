// Default authorized Facility Manager signature SVG/Data URI
export const DEFAULT_MANAGER_SIGNATURE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='70' viewBox='0 0 220 70'><path d='M20,48 C35,20 45,15 52,40 C58,60 52,65 65,30 C75,10 85,25 90,45 C95,58 110,35 125,25 C140,15 150,45 165,35 C175,28 185,42 205,30' fill='none' stroke='%23111111' stroke-width='2.2' stroke-linecap='round'/><path d='M30,52 C60,48 110,46 195,50' fill='none' stroke='%23111111' stroke-width='1.8' stroke-linecap='round'/><circle cx='180' cy='32' r='2' fill='%23111111'/></svg>";

const BASE_CONFIGS = [
  {
    baseName: "Azalea",
    type: "2 Bedroom Executive Suite",
    description: "Spacious master bedroom with pool view, modern kitchenette & fast Wi-Fi."
  },
  {
    baseName: "Beaumont",
    type: "3 Bedroom Penthouse Suite",
    description: "Panoramic terrace overlooking the estate gardens with luxury fittings."
  },
  {
    baseName: "Charleston",
    type: "1 Bedroom Studio Suite",
    description: "Cozy executive studio suitable for solo business travelers & short stays."
  },
  {
    baseName: "Darwin",
    type: "2 Bedroom Premium Flat",
    description: "Contemporary styling with private balcony and automated access."
  }
];

const BLOCKS = ["A", "B", "C", "D", "E", "F"];
const UNITS = [1, 2, 3, 4, 5, 6];

function getFloorForUnit(unit) {
  if (unit <= 2) return "1st Floor";
  if (unit <= 4) return "2nd Floor";
  return "3rd Floor";
}

let flatCounter = 1;
export const INITIAL_FLATS = BASE_CONFIGS.flatMap(config =>
  BLOCKS.flatMap(block =>
    UNITS.map(unit => ({
      id: `flat-${flatCounter++}`,
      name: `${config.baseName} ${block}${unit}`,
      block: `Block ${block}`,
      floor: getFloorForUnit(unit),
      type: config.type,
      status: "available",
      currentGuest: null,
      currentPassId: null,
      description: config.description
    }))
  )
);

export const INITIAL_MANAGERS = [
  {
    id: "manager-001",
    name: "KSA Concierge Admin",
    role: "Apartment Manager",
    email: "ksaconciergeservices@gmail.com",
    password: "keffiapartmentadmin1",
    phone: "+234 704 362 3113",
    estateName: "KSA Concierge Services",
    estateAddress: "20B Keffi Street, off Awolowo Road, Ikoyi, Lagos",
    gateContact: "+234 704 362 3113",
    defaultSignature: DEFAULT_MANAGER_SIGNATURE,
    autoApprovalEnabled: true,
    strictIdCheck: true,
    notificationEmail: "ksaconciergeservices@gmail.com"
  },
  {
    id: "manager-002",
    name: "KSA Administrator",
    role: "Apartment Manager",
    email: "admin@keffi.com",
    password: "admin234",
    phone: "+234 704 362 3113",
    estateName: "KSA Concierge Services",
    estateAddress: "20B Keffi Street, off Awolowo Road, Ikoyi, Lagos",
    gateContact: "+234 704 362 3113",
    defaultSignature: DEFAULT_MANAGER_SIGNATURE,
    autoApprovalEnabled: true,
    strictIdCheck: true,
    notificationEmail: "admin@keffi.com"
  },
  {
    id: "manager-003",
    name: "KSA Manager",
    role: "Apartment Manager",
    email: "adminkef@keffi.com",
    password: "admin369",
    phone: "+234 704 362 3113",
    estateName: "KSA Concierge Services",
    estateAddress: "20B Keffi Street, off Awolowo Road, Ikoyi, Lagos",
    gateContact: "+234 704 362 3113",
    defaultSignature: DEFAULT_MANAGER_SIGNATURE,
    autoApprovalEnabled: true,
    strictIdCheck: true,
    notificationEmail: "adminkef@keffi.com"
  }
];
