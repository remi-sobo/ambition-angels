export type Donor = {
  slug: string
  name: string
  fullName: string
  gave: boolean
  gaveAmount?: string
  gaveYear?: string
  personalNote: string
  askFocus: 'donor' | 'cultivator'
  highlightTier: string
  softCommitNote?: string
}

export const donors: Donor[] = [
  {
    slug: 'andy',
    name: 'Andy',
    fullName: 'Andy Poppink',
    gave: false,
    personalNote: 'We connected in March and your perspective on what teens actually need, especially the confidence piece, shaped how we think about what we build next.',
    askFocus: 'cultivator',
    highlightTier: '$25,000',
    softCommitNote: "You mentioned being open to contributing and thinking through some introductions. I'd love to take you up on both."
  }
]

export function getDonorBySlug(slug: string): Donor | undefined {
  return donors.find((d) => d.slug === slug)
}
