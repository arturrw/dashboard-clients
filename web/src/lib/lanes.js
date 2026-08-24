/**
 * Splits a table's day into side-by-side lanes so overlapping blocks are all
 * visible instead of burying each other. Nothing is ever hidden: an admin can
 * only untangle a double-booking they can actually see.
 *
 * Items are grouped into clusters of connected overlaps; each cluster is
 * divided into as many lanes as it needs, greedily reusing a lane as soon as
 * its previous block has ended.
 *
 * A cluster is flagged as a real conflict only when two or more of its blocks
 * actually hold the table — a cancelled booking sharing a slot with its
 * replacement is normal, not a problem to solve.
 */
export function layoutLanes(items) {
  const sorted = [...items].sort((a, b) => a.start_min - b.start_min || b.end_min - a.end_min)
  const placed = []
  const clusters = []

  let bucket = []
  let laneEnds = []
  let clusterEnd = -Infinity
  let clusterId = 0

  const flush = () => {
    if (!bucket.length) return
    const lanes = Math.max(...bucket.map((p) => p.lane)) + 1
    const blocking = bucket.filter((p) => p.blocking).length
    for (const p of bucket) {
      p.lanes = lanes
      p.conflict = blocking > 1
    }
    clusters.push({
      id: clusterId++,
      start_min: Math.min(...bucket.map((p) => p.start_min)),
      end_min: Math.max(...bucket.map((p) => p.end_min)),
      lanes,
      blocking,
      conflict: blocking > 1
    })
    bucket = []
    laneEnds = []
    clusterEnd = -Infinity
  }

  for (const item of sorted) {
    if (item.start_min >= clusterEnd) flush()

    let lane = laneEnds.findIndex((end) => end <= item.start_min)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end_min)
    } else {
      laneEnds[lane] = item.end_min
    }

    const entry = { ...item, lane, lanes: 1, conflict: false, cluster: clusterId }
    bucket.push(entry)
    placed.push(entry)
    clusterEnd = Math.max(clusterEnd, item.end_min)
  }
  flush()

  return { placed, clusters, conflicts: clusters.filter((c) => c.conflict).length }
}

/** Horizontal slice of a column for one lane, with a hairline gap between. */
export const laneStyle = (lane, lanes) => ({
  left: `calc(${(lane / lanes) * 100}% + 3px)`,
  width: `calc(${100 / lanes}% - 6px)`
})
