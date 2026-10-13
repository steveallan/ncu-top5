// Turns a week's PlayHQ scorecards into the four Top 5 lists: batting, bowling, partnerships and
// fielding. Pure — no fetching — so it can be run against saved scorecards.

const PRIVATE = "********";

/** People who have asked to be left off the cards (excluded.json); shown as "Private player". */
let excluded = new Set();
export function setExcluded(names) {
  excluded = new Set(names.map((n) => n.trim().toLowerCase()));
}

/** "Old Ignatians (Trundlers) A1" → "Old Ignatians (Trundlers)". */
export function clubName(teamName) {
  return teamName.replace(/\s+(\d(st|nd|rd|th)|[A-Z]\d)$/, "");
}

/** "A One Day Grade" → "A1"; "1st Grade" stays as it is. */
export function gradeLabel(gradeName) {
  const oneDay = gradeName.match(/^([A-Z]) One Day Grade$/);
  return oneDay ? `${oneDay[1]}1` : gradeName;
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? "th";
  return `${n}${s}`;
}

function oversText(overs) {
  return Number.isInteger(overs) ? String(overs) : overs.toFixed(1);
}

/** 7.3 overs as 45 balls, for comparing. */
function balls(overs) {
  const whole = Math.floor(overs + 1e-9);
  return whole * 6 + Math.round((overs - whole) * 10);
}

/** Every innings in the week's scorecards, with the context each card line needs. */
function inningsOf(cards) {
  const out = [];
  for (const card of cards) {
    for (const inn of card.innings ?? []) {
      const bat = card.teams.find((t) => t.id === inn.battingTeamId);
      const bowl = card.teams.find((t) => t.id !== inn.battingTeamId);
      if (!bat || !bowl) continue;
      const fullName = (team) => {
        const byId = new Map((team.players ?? []).map((p) => [p.participantId, p]));
        return (id, short) => {
          const name = short === PRIVATE ? PRIVATE : (byId.get(id)?.name ?? short);
          return name === PRIVATE || !name || excluded.has(name.toLowerCase()) ? "Private player" : name;
        };
      };
      const keepers = new Set(
        (bowl.players ?? [])
          .filter((p) => (p.roles ?? []).some((r) => String(r.name ?? r).toLowerCase().includes("keeper")))
          .map((p) => p.participantId),
      );
      const grade = gradeLabel(card.grade?.name ?? "");
      out.push({
        inn,
        matchId: card.id,
        batting: {
          club: clubName(bat.displayName),
          match: `${grade} v ${clubName(bowl.displayName)}`,
          logo: bat.owningOrganisation?.logoUrl ?? null,
          name: fullName(bat),
        },
        bowling: {
          club: clubName(bowl.displayName),
          match: `${grade} v ${clubName(bat.displayName)}`,
          logo: bowl.owningOrganisation?.logoUrl ?? null,
          name: fullName(bowl),
          keepers,
        },
      });
    }
  }
  return out;
}

/**
 * The top five by `key` (compared element by element, higher first), then `tiebreak` to order
 * equals. A sixth line is kept when it is level with the fifth; any more level with the fifth are
 * counted in `alsoLevel` rather than shown. Ranks are shared between equals ("=1").
 */
function topFive(items, key, tiebreak = () => 0) {
  const cmp = (a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  };
  const sorted = [...items].sort((a, b) => cmp(a, b) || tiebreak(a, b));
  let shown = sorted.slice(0, 5);
  const levelWithFifth = sorted.slice(5).filter((x) => shown.length === 5 && cmp(x, shown[4]) === 0);
  if (levelWithFifth.length === 1) shown = sorted.slice(0, 6);
  const alsoLevel = levelWithFifth.length > 1 ? levelWithFifth.length : 0;
  return {
    rows: shown.map((x) => {
      const first = sorted.findIndex((y) => cmp(x, y) === 0);
      const level = sorted.filter((y) => cmp(x, y) === 0).length > 1;
      return { ...x, rank: `${level ? "=" : ""}${first + 1}` };
    }),
    alsoLevel,
  };
}

export function batting(cards) {
  const items = [];
  for (const { inn, batting: side } of inningsOf(cards)) {
    for (const b of inn.batting ?? []) {
      if (/did not bat/i.test(b.dismissalType ?? "") || b.runsScored == null) continue;
      const notOut = /not out/i.test(b.dismissalType ?? "") || /retired/i.test(b.dismissalType ?? "");
      items.push({
        names: [side.name(b.participantId, b.playerShortName)],
        big: `${b.runsScored}${notOut ? "*" : ""}`,
        small: b.ballsFaced > 0 ? `${b.ballsFaced} balls` : "",
        club: side.club,
        match: side.match,
        logo: side.logo,
        runs: b.runsScored,
        notOut,
        balls: b.ballsFaced > 0 ? b.ballsFaced : 999,
      });
    }
  }
  return topFive(items, (x) => [x.runs, x.notOut ? 1 : 0], (a, b) => a.balls - b.balls);
}

export function bowling(cards) {
  const items = [];
  for (const { inn, bowling: side } of inningsOf(cards)) {
    for (const b of inn.bowling ?? []) {
      if (!b.wicketsTaken) continue;
      items.push({
        names: [side.name(b.participantId, b.playerShortName)],
        big: `${b.wicketsTaken}/${b.runsConceded}`,
        small: `${oversText(b.oversBowled)} overs`,
        club: side.club,
        match: side.match,
        logo: side.logo,
        wickets: b.wicketsTaken,
        runs: b.runsConceded,
        balls: balls(b.oversBowled),
      });
    }
  }
  return topFive(items, (x) => [x.wickets, -x.runs], (a, b) => a.balls - b.balls);
}

export function fielding(cards) {
  const items = [];
  for (const { inn, bowling: side } of inningsOf(cards)) {
    for (const f of inn.fielding ?? []) {
      const catches = f.totalCatches ?? f.catches ?? 0;
      const stumpings = f.stumpings ?? 0;
      const runOuts = f.runOuts ?? (f.assistedRunOuts ?? 0) + (f.unassistedRunOuts ?? 0);
      const total = catches + stumpings + runOuts;
      if (!total) continue;
      const keeper = (f.wicketKeeperCatches ?? 0) > 0 || stumpings > 0 || side.keepers.has(f.participantId);
      const parts =
        stumpings || runOuts
          ? [catches && `${catches} ct`, stumpings && `${stumpings} st`, runOuts && `${runOuts} ro`].filter(Boolean)
          : [`${catches === 1 ? "catch" : "catches"}`];
      items.push({
        names: [side.name(f.participantId, f.playerShortName)],
        big: String(total),
        small: [...parts, keeper && "wk"].filter(Boolean).join(" · "),
        club: side.club,
        match: side.match,
        logo: side.logo,
        total,
        catches,
      });
    }
  }
  return topFive(items, (x) => [x.total, x.catches]);
}

/**
 * Partnerships, rebuilt from the fall of wickets: the two batters in at each wicket, the runs
 * added since the last one, and the stand still unbroken at the close. PlayHQ does not split a
 * stand between its two batters, so each batter's own innings is shown beside their name.
 *
 * A wicket that names a batter who should not be in — a retirement, a private player's
 * placeholder id, a scorer's slip — leaves the pair uncertain; those innings are listed in
 * `doubts` for checking, and their stands are still counted.
 */
export function partnerships(cards) {
  const items = [];
  const doubts = [];
  for (const { inn, matchId, batting: side } of inningsOf(cards)) {
    const order = (inn.batting ?? [])
      .filter((b) => (b.batInstance ?? 1) === 1 && !/did not bat/i.test(b.dismissalType ?? ""))
      .sort((a, b) => a.batOrder - b.batOrder);
    if (order.length < 2) continue;
    const label = (b) => `${side.name(b.participantId, b.playerShortName)}`;
    const score = (b) => `${b.runsScored}${/not out|retired/i.test(b.dismissalType ?? "") ? "*" : ""}`;
    const queue = [...order];
    const crease = [queue.shift(), queue.shift()];
    let prev = 0;
    let wicket = 0;
    let doubtful = false;
    const add = (runs, unbroken) => {
      if (runs <= 0 || crease.length < 2) return;
      const pair = [...crease].sort((a, b) => a.batOrder - b.batOrder);
      items.push({
        names: pair.map((b) => [label(b), score(b)]),
        big: `${runs}${unbroken ? "*" : ""}`,
        small: `${ordinal(wicket + 1)} wkt`,
        club: side.club,
        match: side.match,
        logo: side.logo,
        runs,
      });
    };
    for (const fw of [...(inn.fallOfWickets ?? [])].sort((a, b) => a.order - b.order)) {
      add(fw.runs - prev, false);
      prev = fw.runs;
      wicket++;
      const at = crease.findIndex((b) => b.participantId === fw.participantId);
      if (at >= 0 && fw.playerShortName !== PRIVATE) crease.splice(at, 1);
      else if (at >= 0) {
        // A private player's placeholder id matches any private player; take the one in first.
        crease.splice(at, 1);
      } else {
        doubtful = true;
        crease.pop();
      }
      if (queue.length) crease.push(queue.shift());
    }
    if ((inn.runsScored ?? 0) > prev) add(inn.runsScored - prev, true);
    if (doubtful) doubts.push(`${side.club} (${side.match}) — partnership pairs may be wrong: ${matchId}`);
  }
  return { ...topFive(items, (x) => [x.runs]), doubts };
}
