export interface SkillDef {
  name: string
  syn: string[]
}

export const SK: Record<string, SkillDef> = {
  MHPSS: { name: 'Mental health & psychosocial', syn: ['mental health', 'psychosocial', 'mhpss', 'counselling', 'counseling', 'wellness', 'trauma', 'wellbeing'] },
  GBV: { name: 'GBV prevention', syn: ['gbv', 'gender based violence', 'sgbv', 'violence against women'] },
  AYH: { name: 'Adolescent & youth health', syn: ['adolescent', 'youth health', 'srhr', 'reproductive health', 'menstrual', 'sexual health'] },
  FINLIT: { name: 'Financial literacy', syn: ['financial literacy', 'financial', 'savings', 'money management', 'budgeting', 'vsla'] },
  ENT: { name: 'Entrepreneurship', syn: ['entrepreneurship', 'enterprise', 'business', 'startup', 'incubation'] },
  CLIM: { name: 'Climate adaptation', syn: ['climate', 'adaptation', 'resilience', 'drought', 'climate change'] },
  ME: { name: 'M&E', syn: ['m&e', 'monitoring', 'evaluation', 'mel', 'baseline', 'endline'] },
  DATA: { name: 'Data analysis', syn: ['data analysis', 'data', 'spss', 'stata', 'kobo', 'statistics'] },
  DIG: { name: 'Digital skills', syn: ['digital', 'ict', 'computer', 'digital literacy'] },
  CURR: { name: 'Curriculum development', syn: ['curriculum', 'e learning', 'elearning', 'content development', 'course design'] },
  LEAD: { name: 'Leadership & governance', syn: ['leadership', 'governance', 'mentorship', 'civic'] },
  WASH: { name: 'WASH', syn: ['wash', 'water', 'sanitation', 'hygiene', 'borehole'] },
  AGRI: { name: 'Agribusiness', syn: ['agribusiness', 'agriculture', 'farming', 'agroecology', 'regenerative'] },
  PROP: { name: 'Proposal writing', syn: ['proposal', 'proposal writing', 'grant writing', 'resource mobilization', 'resource mobilisation', 'fundraising'] },
  TOT: { name: 'Facilitation / ToT', syn: ['tot', 'training of trainers', 'facilitation', 'participatory'] },
  DISAB: { name: 'Disability inclusion', syn: ['disability', 'pwd', 'inclusion', 'inclusive'] },
}

const N = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const has = (hay: string, needle: string) => (' ' + hay + ' ').includes(' ' + needle + ' ')

export const STOP = new Set([
  'and', 'the', 'for', 'of', 'in', 'on', 'with', 'to', 'an', 'eg', 'activity', 'session', 'sessions', 'e', 'g',
  // Generic role/occupation nouns — appear in almost every supplier's job title, so matching on
  // these alone (e.g. "consultant" in a search for "gender responsive consultant") produces false
  // positives against anyone whose title happens to contain the word, regardless of actual field.
  'consultant', 'consultants', 'consultancy', 'trainer', 'trainers', 'specialist', 'specialists',
  'advisor', 'advisors', 'adviser', 'advisers', 'coordinator', 'coordinators', 'facilitator', 'facilitators',
  'expert', 'experts', 'officer', 'officers', 'manager', 'managers', 'practitioner', 'practitioners',
  'provider', 'providers',
])

export const normalize = N
export const contains = has

export const tagMatches = (id: string, q: string) => {
  const skill = SK[id]
  if (!skill) return false
  return [skill.name, ...skill.syn].map(N).some((t) => t && (has(q, t) || (q.length >= 3 && has(t, q))))
}
