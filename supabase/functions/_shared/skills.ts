// Mirrors the id → name pairs in src/lib/skills.ts (the browser app's skill
// dictionary). Duplicated here rather than imported across the Deno/browser
// boundary to keep each runtime's bundling independent. If a tag is added,
// renamed or removed in src/lib/skills.ts, update this list to match.
export const SKILL_VOCAB: { id: string; name: string }[] = [
  { id: 'MHPSS', name: 'Mental health & psychosocial' },
  { id: 'GBV', name: 'GBV prevention' },
  { id: 'AYH', name: 'Adolescent & youth health' },
  { id: 'FINLIT', name: 'Financial literacy' },
  { id: 'ENT', name: 'Entrepreneurship' },
  { id: 'CLIM', name: 'Climate adaptation' },
  { id: 'ME', name: 'M&E' },
  { id: 'DATA', name: 'Data analysis' },
  { id: 'DIG', name: 'Digital skills' },
  { id: 'CURR', name: 'Curriculum development' },
  { id: 'LEAD', name: 'Leadership & governance' },
  { id: 'WASH', name: 'WASH' },
  { id: 'AGRI', name: 'Agribusiness' },
  { id: 'PROP', name: 'Proposal writing' },
  { id: 'TOT', name: 'Facilitation / ToT' },
  { id: 'DISAB', name: 'Disability inclusion' },
]

export const SKILL_IDS = SKILL_VOCAB.map((s) => s.id)
