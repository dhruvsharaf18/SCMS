/**
 * Frontend-only product presentation layer.
 *
 * Maps each seeded product SKU to:
 *  - imagePath: served from /products/<SKU>.svg (local public asset, no remote URLs)
 *  - bullets: 3-5 short factual bullet points (material, audience, care/use)
 *
 * BACKEND RECOMMENDATION: Add `description` (text) and `image_url` (text, nullable)
 * fields to the Product schema so this layer can be driven by the API instead.
 *
 * HOW TO REPLACE WITH REAL PHOTOS: Drop a file named <SKU>.webp (or .png) into
 * frontend/public/products/ and update imagePath here. The SVG placeholder will
 * then be replaced automatically.
 */

export interface ProductPresentation {
  /** Absolute path from public root, e.g. "/products/RKT-001.svg" */
  imagePath: string
  /** Alt text for the image - describe the product neutrally */
  imageAlt: string
  /** 3-5 factual bullet points */
  bullets: string[]
}

const PRODUCT_PRESENTATION: Record<string, ProductPresentation> = {
  'RKT-001': {
    imagePath: '/products/RKT-001.svg',
    imageAlt: 'Yonex Astrox 88 badminton racket',
    bullets: [
      'High-modulus graphite frame for extra power and stability',
      'Head-heavy balance optimised for powerful smashes and net drops',
      'Weight: 3U (85-89 g), grip size G4 - suited to intermediate and advanced players',
      'String tension rated up to 30 lbs; supplied unstrung from stock',
      'Wipe clean with a dry cloth; avoid prolonged direct sunlight storage',
    ],
  },
  'RKT-002': {
    imagePath: '/products/RKT-002.svg',
    imageAlt: 'Wilson Pro Staff 97 v14 tennis racket',
    bullets: [
      'Braided graphite construction for exceptional feel and control',
      'Head size 97 sq in - preferred by baseline and serve-and-volley players',
      'Weight: 315 g strung; Grip 3 (4 3/8 in); 16 x 19 string pattern',
      'Suited to advanced players with a full or compact swing',
      'Do not use on abrasive surfaces; store in a padded bag away from heat',
    ],
  },
  'RKT-003': {
    imagePath: '/products/RKT-003.svg',
    imageAlt: 'Head Speed MP tennis racket',
    bullets: [
      'Graphene 360+ frame technology for energy transfer and stability',
      'Head size 100 sq in, 16 x 19 string pattern for power and spin',
      'Weight: 295 g unstrung; Grip 3 - suitable for all-court players',
      'Balanced swing weight suits club players seeking speed and control',
      'Avoid impacts with hard surfaces; re-grip tape annually for best feel',
    ],
  },
  'BAL-001': {
    imagePath: '/products/BAL-001.svg',
    imageAlt: 'Pressurised tennis balls, can of 3',
    bullets: [
      'Championship-grade pressurised felt balls for clay and hard courts',
      'Natural rubber core with premium felt cover for consistent bounce',
      'Suitable for recreational and tournament play at all levels',
      'Can of 3 - sealed until opening to preserve internal pressure',
      'Balls lose pressure over time; replace after 3-4 hours of active play',
    ],
  },
  'BAL-002': {
    imagePath: '/products/BAL-002.svg',
    imageAlt: 'Feather shuttlecocks, tube of 6',
    bullets: [
      'Tournament-grade goose feather shuttlecocks for indoor courts',
      'Speed 77 (medium, suited for temperatures 16-27 degrees C)',
      'Ideal for competitive club-level and tournament badminton',
      'Keep in original tube; store horizontally at room temperature',
      'Inspect feathers before play; retire when flight becomes unstable',
    ],
  },
  'BAL-003': {
    imagePath: '/products/BAL-003.svg',
    imageAlt: 'Padel balls, can of 3',
    bullets: [
      'Depressurised core design extends durability on padel courts',
      'High-quality rubber and felt covering for low bounce playability',
      'Suitable for all padel court surfaces - glass and artificial turf',
      'Can of 3 - ready to play straight from the can',
      'Replace when felt wears smooth or flight becomes unpredictable',
    ],
  },
  'SHO-001': {
    imagePath: '/products/SHO-001.svg',
    imageAlt: 'Asics Gel Court tennis shoes',
    bullets: [
      'GEL cushioning in the heel absorbs impact during lateral movement',
      'Non-marking rubber outsole approved for hard and clay courts',
      'AHAR+ compound outsole for extended durability at high-wear zones',
      'Suited to club and competitive players requiring court stability',
      'Hand wash only; air dry away from direct heat or sunlight',
    ],
  },
  'SHO-002': {
    imagePath: '/products/SHO-002.svg',
    imageAlt: 'Yonex Power Cushion badminton shoes',
    bullets: [
      'Power Cushion technology absorbs shock and converts energy for push-off',
      'Round Sole design enables smooth multi-directional movement on court',
      'Non-marking outsole safe for all indoor wooden and synthetic courts',
      'Suited to beginner through advanced indoor court players',
      'Wipe with a damp cloth; do not machine wash; air dry after use',
    ],
  },
  'ACC-001': {
    imagePath: '/products/ACC-001.svg',
    imageAlt: 'Overgrip pack of 3, white',
    bullets: [
      'Super-absorbent PU material wicks sweat for a secure hold',
      'Tacky finish provides confident grip in warm or humid conditions',
      'Thickness: 0.6 mm - compatible with all standard grip sizes',
      'Suited to tennis, badminton, squash and padel racket handles',
      'Replace grip when tackiness reduces or surface becomes smooth',
    ],
  },
  'ACC-002': {
    imagePath: '/products/ACC-002.svg',
    imageAlt: 'Terry cotton wrist sweatband, black',
    bullets: [
      'Premium terry cotton construction absorbs sweat effectively',
      'One-size elastic band fits wrist circumferences 14-20 cm',
      'Suitable for tennis, badminton, padel and general court sports',
      'Machine washable at 40 degrees C; tumble dry on low',
      'Replace when elastic loses stretch or fabric thins noticeably',
    ],
  },
  'ACC-003': {
    imagePath: '/products/ACC-003.svg',
    imageAlt: 'Thermal protective racket bag for 6 rackets',
    bullets: [
      'Thermal-lined main compartment protects strings from temperature changes',
      'Holds up to 6 rackets plus accessories in separate pockets',
      'Padded back panel and adjustable shoulder strap for comfortable carry',
      'Suitable for tennis, badminton and padel equipment',
      'Spot clean with a damp cloth; do not submerge; air dry before storage',
    ],
  },
  'APP-001': {
    imagePath: '/products/APP-001.svg',
    imageAlt: 'Champions Club dry-fit polo shirt',
    bullets: [
      '100% breathable polyester dry-fit fabric for temperature regulation',
      'Embroidered club badge on left chest; three-button placket',
      'Available in sizes XS-3XL (select variant at checkout)',
      'Suitable for court play, training and casual club wear',
      'Machine wash cold, gentle cycle; do not tumble dry or iron the badge',
    ],
  },
  'APP-002': {
    imagePath: '/products/APP-002.svg',
    imageAlt: 'Champions Club training shorts',
    bullets: [
      '4-way stretch woven fabric allows full range of athletic movement',
      'Elastic waistband with internal drawcord and two side pockets',
      'Available in sizes XS-3XL (select variant at checkout)',
      'Suitable for court sports, gym training and active club wear',
      'Machine wash cold; do not bleach or tumble dry on high heat',
    ],
  },
  'APP-003': {
    imagePath: '/products/APP-003.svg',
    imageAlt: 'Champions Club UV-protective sports cap',
    bullets: [
      'UPF 50+ fabric panel protects from UV exposure during outdoor play',
      'Structured 6-panel design with embroidered CC badge on front',
      'Adjustable back strap fits head circumference 54-60 cm',
      'Suited to tennis, padel, cricket net and general outdoor activity',
      'Hand wash only; reshape brim while wet and air dry',
    ],
  },
}

/**
 * Return the presentation data for a product SKU.
 * Falls back to a clean placeholder if the SKU has no mapping.
 */
export function getProductPresentation(sku: string): ProductPresentation {
  return (
    PRODUCT_PRESENTATION[sku] ?? {
      imagePath: '', // no image - caller renders placeholder icon
      imageAlt: 'Product image',
      bullets: [],
    }
  )
}
