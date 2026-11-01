// The allow-list of feeds the newspaper may draw from. Only these. Every one was checked to return a working RSS
// feed. To add a source, add it here: nothing else needs to change. `domains` limits which article pages the
// server may fetch for that source (a feed cannot make the server visit any other site).

export const NEWS_CATEGORIES = ['Tech & Innovation', 'Science & Space', 'Health & Environment', 'India & World'] as const
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]

export type FeedSource = {
  id: string
  name: string
  feedUrl: string
  domains: readonly string[]
  categoryHint: NewsCategory
  /** Keep only items whose title or text matches this (for broad feeds such as government press releases). */
  requireAny?: RegExp
  /** Most items taken from this source in one build, so no single source dominates. */
  maxItems: number
}

export const FEED_SOURCES: readonly FeedSource[] = [
  { id: 'nasa', name: 'NASA', feedUrl: 'https://www.nasa.gov/feed/', domains: ['nasa.gov'], categoryHint: 'Science & Space', maxItems: 4 },
  { id: 'nasa-science', name: 'NASA Science', feedUrl: 'https://science.nasa.gov/feed/', domains: ['nasa.gov'], categoryHint: 'Science & Space', maxItems: 4 },
  { id: 'esa', name: 'European Space Agency', feedUrl: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science', domains: ['esa.int'], categoryHint: 'Science & Space', maxItems: 3 },
  { id: 'snexplores', name: 'Science News Explores', feedUrl: 'https://www.snexplores.org/feed', domains: ['snexplores.org', 'sciencenewsforstudents.org'], categoryHint: 'Tech & Innovation', maxItems: 5 },
  { id: 'sciencedaily', name: 'ScienceDaily', feedUrl: 'https://www.sciencedaily.com/rss/top/science.xml', domains: ['sciencedaily.com'], categoryHint: 'Tech & Innovation', maxItems: 4 },
  { id: 'who', name: 'World Health Organization', feedUrl: 'https://www.who.int/rss-feeds/news-english.xml', domains: ['who.int'], categoryHint: 'Health & Environment', maxItems: 2 },
  {
    id: 'pib', name: 'Press Information Bureau, India', feedUrl: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', domains: ['pib.gov.in'],
    categoryHint: 'India & World', maxItems: 4,
    requireAny: /\b(science|scientific|technolog|ISRO|space|satellite|research|innovation|startup|digital|AI|artificial intelligence|energy|solar|climate|environment|health|agricultur|biotech|semiconductor|laborator|discover)/i,
  },
]
