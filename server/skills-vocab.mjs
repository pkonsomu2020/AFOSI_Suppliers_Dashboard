// Mirrors src/lib/skills.ts's SK dictionary (id/name pairs only — the Node backend
// needs the vocabulary for CV extraction prompts, not the search synonyms, which stay
// a frontend-only concern since matching happens in the browser).
export const SKILL_VOCAB = [
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
