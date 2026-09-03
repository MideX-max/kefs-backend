// Default authorized Facility Manager signature SVG/Data URI
export const DEFAULT_MANAGER_SIGNATURE = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='70' viewBox='0 0 220 70'><path d='M20,48 C35,20 45,15 52,40 C58,60 52,65 65,30 C75,10 85,25 90,45 C95,58 110,35 125,25 C140,15 150,45 165,35 C175,28 185,42 205,30' fill='none' stroke='%23111111' stroke-width='2.2' stroke-linecap='round'/><path d='M30,52 C60,48 110,46 195,50' fill='none' stroke='%23111111' stroke-width='1.8' stroke-linecap='round'/><circle cx='180' cy='32' r='2' fill='%23111111'/></svg>";

export const INITIAL_FLATS = [
  {
    id: "flat-1",
    name: "Azalea",
    block: "Block A",
    floor: "1st Floor",
    type: "2 Bedroom Executive Suite",
    status: "available",
    currentGuest: null,
    currentPassId: null,
    description: "Spacious master bedroom with pool view, modern kitchenette & fast Wi-Fi."
  },
  {
    id: "flat-2",
    name: "Beaumont",
    block: "Block B",
    floor: "2nd Floor",
    type: "3 Bedroom Penthouse Suite",
    status: "available",
    currentGuest: null,
    currentPassId: null,
    description: "Panoramic terrace overlooking the estate gardens with luxury fittings."
  },
  {
    id: "flat-3",
    name: "Charleston",
    block: "Block C",
    floor: "3rd Floor",
    type: "1 Bedroom Studio Suite",
    status: "available",
    currentGuest: null,
    currentPassId: null,
    description: "Cozy executive studio suitable for solo business travelers & short stays."
  },
  {
    id: "flat-4",
    name: "Darwin",
    block: "Block D",
    floor: "4th Floor",
    type: "2 Bedroom Premium Flat",
    status: "available",
    currentGuest: null,
    currentPassId: null,
    description: "Contemporary styling with private balcony and automated access."
  }
];

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
