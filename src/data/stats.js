import { TOPS, OUTERS, BOTTOMS, SHOES, ACCS, PRESETS } from './catalog.js'
import { LAWS } from './advice.js'
import { SOURCES } from './sources.js'

const platformCounts = SOURCES.reduce((counts, source) => {
  counts[source.platform] = (counts[source.platform] || 0) + 1
  return counts
}, {})

const statusCounts = SOURCES.reduce((counts, source) => {
  counts[source.status] = (counts[source.status] || 0) + 1
  return counts
}, {})

export const PROJECT_STATS = {
  sources: SOURCES.length,
  laws: LAWS.length,
  items: TOPS.length + OUTERS.length + BOTTOMS.length + SHOES.length + ACCS.length,
  presets: PRESETS.length,
  recentSources: SOURCES.filter((source) => source.tags?.includes('近期')).length,
  datedSources: SOURCES.filter((source) => source.publishedAt).length,
  platformCounts,
  statusCounts,
}
