import type { Supplier } from './types'

export const TYPES: Supplier['type'][] = [
  'Trainer / Facilitator',
  'Consultant',
  'Researcher / Evaluator',
  'Service Provider',
  'Qualified Supplier',
  'Catering Company',
  'Other',
]

export const REGIONS = ['National', 'Nairobi', 'Coast', 'Central', 'Western', 'Nyanza', 'Rift Valley', 'Eastern', 'North Eastern']

/**
 * The known category/service taxonomy applicants pick from. Several names contain their own
 * commas (e.g. "ICT Equipment, Software, and Technical Support") — naively splitting the raw
 * "Category / Services Applying For" field on every comma fragments these into nonsense pieces.
 * Used by splitCategories() in importSuppliers.ts to split correctly instead.
 */
export const CATEGORIES = [
  'Airtime and Data Solutions', 'Barbing', 'Building Maintenance Services', 'CLEANING SERVICES',
  'Catering Services (Conferences & Meetings)', 'Catering Services (Corporate & Events)',
  'Catering Services (Institutional Catering)', 'Catering Services (Outdoor Events)',
  'Catering Services (Packed Meals)', 'Catering Services (Tea Breaks & Snacks)',
  'Catering Services (Workshops & Trainings)', 'Cleaning Materials and detergents', 'Communications',
  'Curriculum development & E-learning content development', 'Drinking Water Supply and Dispenser Services',
  'Enterprise Resource Planning (ERP)', 'Entrepreneurship', 'Event Management Services', 'Event organization',
  'FUMIGATION', 'Fire Safety and First Aid Equipment', 'Foodstuffs and Groceries',
  'GENERAL HARDWARE i.e ELECTRICALS', 'Hotel Accommodation and Conference Facilities',
  'Human Resource Training and Consultancy', 'ICT Equipment, Software, and Technical Support', 'Innovation',
  'Insurance Brokerage Services', 'Internet and Connectivity Services', 'Kitchenware and Catering Equipment',
  'LANDSCAPING.', 'Media, Photography, Videography, and Communications', 'Office Furniture and Interior Solutions',
  'Office Stationery and Supplies', 'PLUMBING', 'Pension Administration Services',
  'Printing, Branding, and Promotional Materials', 'Professional Consultancy Services',
  'Research, Monitoring, and Evaluation Services', 'Stakeholder Engagement',
  'Training and Capacity Building Services', 'Transport and Vehicle Hire Services', 'Travel Management Services',
  'WASH', 'borehole drilling and related works', 'sustainability.',
]

export const YEARS: Supplier['years'][] = ['Less than 1 year', '1–3 years', '4–6 years', '7–10 years', 'Over 10 years']

export const DOCS: Array<[keyof Supplier['docs'], string, string]> = [
  ['reg', 'Certificate of Registration', 'CR'],
  ['cv', 'CV / Resume', 'CV'],
  ['tax', 'Tax Compliance Certificate', 'TC'],
  ['prof', 'Professional Certificates', 'PC'],
]
