import { layoutLanes, laneStyle } from '../src/lib/lanes.js'

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const booking = (id, start, end, blocking = true) => ({
  id, start_min: start, end_min: end, blocking, kind: 'booking'
})
const laneOf = (out, id) => out.placed.find((p) => p.id === id)

/* Back-to-back blocks share one lane: touching is not overlapping. */
let out = layoutLanes([booking('a', 600, 660), booking('b', 660, 720)])
check('adjacent blocks stay full width', out.placed.every((p) => p.lanes === 1), `lanes=${out.placed.map((p) => p.lanes)}`)
check('adjacent blocks are not a conflict', out.conflicts === 0)

/* A genuine overlap splits the column. */
out = layoutLanes([booking('a', 600, 700), booking('b', 660, 760)])
check('overlap splits into two lanes', out.placed.every((p) => p.lanes === 2))
check('overlap uses distinct lanes', laneOf(out, 'a').lane !== laneOf(out, 'b').lane,
  `a=${laneOf(out, 'a').lane} b=${laneOf(out, 'b').lane}`)
check('overlap is reported', out.conflicts === 1)
check('both blocks marked conflicting', out.placed.every((p) => p.conflict))

/* Three-way pile-up. */
out = layoutLanes([booking('a', 600, 720), booking('b', 620, 700), booking('c', 640, 760)])
check('triple overlap uses three lanes', out.placed.every((p) => p.lanes === 3), `lanes=${out.placed[0].lanes}`)
check('triple overlap lanes are unique', new Set(out.placed.map((p) => p.lane)).size === 3)

/* A freed lane is reused rather than growing the column. */
out = layoutLanes([booking('a', 600, 700), booking('b', 620, 660), booking('c', 665, 690)])
check('freed lane is reused', out.placed.every((p) => p.lanes === 2), `lanes=${out.placed[0].lanes}`)
check('reused lane keeps the same index', laneOf(out, 'b').lane === laneOf(out, 'c').lane,
  `b=${laneOf(out, 'b').lane} c=${laneOf(out, 'c').lane}`)

/* Separate clusters are sized independently. */
out = layoutLanes([booking('a', 600, 700), booking('b', 620, 720), booking('c', 800, 860)])
check('later cluster is not widened by an earlier clash', laneOf(out, 'c').lanes === 1,
  `c lanes=${laneOf(out, 'c').lanes}`)
check('only the clashing cluster is flagged', out.conflicts === 1 && !laneOf(out, 'c').conflict)

/* A cancelled booking still shows, but does not raise an alarm. */
out = layoutLanes([booking('cancelled', 600, 700, false), booking('replacement', 620, 720, true)])
check('cancelled booking stays visible in its own lane', out.placed.every((p) => p.lanes === 2))
check('cancelled overlap is not a conflict', out.conflicts === 0 && out.placed.every((p) => !p.conflict))

/* A booking dropped over a break is the case that started all this. */
out = layoutLanes([
  { id: 'brk', start_min: 900, end_min: 960, blocking: true, kind: 'break' },
  booking('over', 915, 990, true)
])
check('booking over a break shows both', out.placed.length === 2 && out.placed.every((p) => p.lanes === 2))
check('booking over a break is flagged', out.conflicts === 1)

/* Geometry: lanes tile the column without overlapping. */
const two = [laneStyle(0, 2), laneStyle(1, 2)]
check('lane 0 starts at the left edge', two[0].left === 'calc(0% + 3px)', two[0].left)
check('lane 1 starts at the midpoint', two[1].left === 'calc(50% + 3px)', two[1].left)
check('lanes share the width evenly', two.every((s) => s.width === 'calc(50% - 6px)'), two[0].width)
check('single lane spans the column', laneStyle(0, 1).width === 'calc(100% - 6px)')

const failed = results.filter((x) => !x.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length) process.exit(1)
