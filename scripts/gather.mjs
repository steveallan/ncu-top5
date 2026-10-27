// Gathers the past week's NCU scorecards from PlayHQ and makes the four Top 5 cards, a draft
// caption and the approval issue's text.
//
//   node scripts/gather.mjs                 the week up to today (Sydney time)
//   TOP5_TODAY=2026-10-13 node scripts/...  the week up to a given day, for re-running a round
//
// Writes rounds/<season>/<round>/ (the PNGs, caption.txt, issue.md, shown.json) and prints that
// folder.
//
// A two-day match is read in both of its weeks. Each innings counts in the week it ends, so a
// day-1 innings is on the cards straight away, and one still going at stumps waits for day 2 and
// is shown once, whole. shown.json records the innings each week used, so none is used twice.

import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentSeason, gradeMatches, grades, scorecard } from "../src/playhq.mjs";
import { batting, bowling, clubName, fielding, gradeLabel, partnerships, setExcluded } from "../src/top5.mjs";
import { cardHtml, renderPngs } from "../src/cards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WINDOW_DAYS = 7;

const sydneyToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function dateLine(days) {
  const d = [...new Set(days)].sort().map((iso) => new Date(`${iso}T00:00:00Z`));
  const day = (x) => x.toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });
  const month = (x) => x.toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" });
  const a = d[0], b = d[d.length - 1];
  if (d.length === 1) return `${day(a)} ${a.getUTCDate()} ${month(a)} ${a.getUTCFullYear()}`;
  const left = month(a) === month(b) ? `${day(a)} ${a.getUTCDate()}` : `${day(a)} ${a.getUTCDate()} ${month(a)}`;
  return `${left} – ${day(b)} ${b.getUTCDate()} ${month(b)} ${b.getUTCFullYear()}`;
}

/** Innings already used by an earlier week's cards this season (from each week's shown.json). */
async function shownBefore(seasonDir, from) {
  const ids = new Set();
  const weeks = await readdir(seasonDir).catch(() => []);
  for (const week of weeks) {
    const file = path.join(seasonDir, week, "shown.json");
    const shown = await readFile(file, "utf8").then(JSON.parse, () => null);
    if (shown && shown.today < from) shown.innings.forEach((id) => ids.add(id));
  }
  return ids;
}

const started = (inn) => (inn.oversBowled ?? 0) > 0 || (inn.runsScored ?? 0) > 0 || (inn.batting ?? []).length > 0;

/**
 * The innings of a scorecard that have ended: all of them once the match's last day has been
 * played, otherwise those all out, declared, or followed by an innings that has started.
 */
function endedInnings(card, matchOver) {
  const innings = [...(card.innings ?? [])].filter(started).sort((a, b) => a.inningsOrder - b.inningsOrder);
  if (matchOver) return innings;
  return innings.filter(
    (inn, i) => inn.inningsCloseType === "All Out" || inn.isDeclared || innings.slice(i + 1).some(started),
  );
}

/** "Round 4" → 4; finals and other names → -1. */
const roundNumber = (name) => Number(/^Round (\d+)$/.exec(name ?? "")?.[1] ?? -1);

const joinNames = (xs) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

function caption(round, lists) {
  const leaders = (list) => list.rows.filter((r) => r.rank === lists.firstRank(list));
  const who = (r) => `${r.names.map((n) => (Array.isArray(n) ? n[0] : n)).join(" & ")}`;
  const lines = [`🏏 ${round} Top 5s are in!`, ""];
  const bat = leaders(lists.batting);
  if (bat.length)
    lines.push(
      `🔥 Top score: ${joinNames(bat.map((r) => `${who(r)} ${r.big} (${r.club} ${r.match.split(" v ")[0]})`))}`,
    );
  const bowl = leaders(lists.bowling);
  if (bowl.length)
    lines.push(
      `🎯 Best bowling: ${joinNames(bowl.map((r) => `${who(r)} ${r.big} (${r.club} ${r.match.split(" v ")[0]})`))}`,
    );
  const stand = leaders(lists.partnerships);
  if (stand.length)
    lines.push(
      `🤝 Biggest stand: ${joinNames(
        stand.map((r) => `${who(r)}, ${r.runs} for the ${r.small.replace(" wkt", "")} wicket (${r.club} ${r.match.split(" v ")[0]})`),
      )}`,
    );
  const field = leaders(lists.fielding);
  if (field.length) {
    const n = field[0].total;
    const word = field.every((r) => r.catches === r.total) ? (n === 1 ? "catch" : "catches") : n === 1 ? "dismissal" : "dismissals";
    lines.push(
      field.length > 3
        ? `🧤 Safe hands: ${field.length} fielders took ${n} ${word} each`
        : `🧤 Safe hands: ${joinNames(field.map((r) => who(r)))} with ${n} ${word}${field.length > 1 ? " each" : ""}`,
    );
  }
  lines.push(
    "",
    "Swipe through for the full Top 5 batting, bowling, partnerships and fielding 👉",
    "",
    "Figures from PlayHQ scorecards. Spotted something we missed? Let us know in the comments.",
    "",
    "#NCUcricket #grassrootscricket",
  );
  return lines.join("\n");
}

async function main() {
  const today = process.env.TOP5_TODAY || sydneyToday();
  const from = addDays(today, -(WINDOW_DAYS - 1));
  setExcluded(JSON.parse(await readFile(path.join(ROOT, "excluded.json"), "utf8")).names ?? []);
  const season = await currentSeason();
  const seasonDir = path.join(ROOT, "rounds", slug(season.name));
  const usedBefore = await shownBefore(seasonDir, from);
  console.log(`Season ${season.name}; matches played ${from} to ${today}`);

  const recent = [];
  for (const g of await grades(season.id)) {
    for (const m of await gradeMatches(g.id)) {
      const days = (m.matchSchedule ?? []).map((s) => s.startDateTime.slice(0, 10)).sort();
      const thisWeek = days.filter((d) => d >= from && d <= today);
      if (thisWeek.length) recent.push({ ...m, gradeName: g.name, thisWeek, over: days.at(-1) <= today });
    }
  }

  const cards = [];
  const unscored = [];
  const unfinished = [];
  let heldOver = 0;
  for (const m of recent) {
    const card = await scorecard(m.id);
    const scored = (card?.innings ?? []).some((i) => (i.batting ?? []).length > 0);
    const label = `${gradeLabel(m.gradeName)}: ${m.teams.map((t) => clubName(t.displayName)).join(" v ")} (${m.status})`;
    if (!scored) {
      if (!/abandon|cancel|forfeit|bye/i.test(`${m.status} ${m.resultText ?? ""}`)) unscored.push(label);
      continue;
    }
    if (m.over && /progress|stumps/i.test(m.status ?? "")) unfinished.push(label);
    const ended = endedInnings(card, m.over);
    heldOver += (card.innings ?? []).filter(started).length - ended.length;
    const innings = ended.filter((inn) => !usedBefore.has(inn.id));
    if (innings.length) cards.push({ ...card, innings, playDays: m.thisWeek });
  }
  console.log(
    `${recent.length} matches in the week, ${cards.length} with innings to show, ${unscored.length} not yet scored, ` +
      `${heldOver} innings held over to next week`,
  );
  if (cards.length === 0) {
    console.log("Nothing to make cards from this week.");
    return;
  }

  // The latest round scheduled this week, scored or not: a two-day round's second week is named
  // for the one-day round played alongside it, so consecutive weeks never share a name (or a
  // folder, or an issue), even when that one-day round is washed out.
  const rounds = new Map();
  for (const m of recent) rounds.set(m.round?.name, (rounds.get(m.round?.name) ?? 0) + 1);
  const round =
    [...rounds].sort((a, b) => roundNumber(b[0]) - roundNumber(a[0]) || b[1] - a[1])[0][0] ?? "This week";
  const when = dateLine(cards.flatMap((c) => c.playDays));

  const lists = {
    batting: batting(cards),
    bowling: bowling(cards),
    partnerships: partnerships(cards),
    fielding: fielding(cards),
    firstRank: (list) => list.rows[0]?.rank,
  };

  const dir = path.join(seasonDir, slug(round));
  await mkdir(dir, { recursive: true });
  const short = round.replace(/^Round /, "R");
  const specs = [
    ["batting", ["TOP", "BATTERS"], "RUNS"],
    ["bowling", ["TOP", "BOWLERS"], "WKTS"],
    ["partnerships", ["TOP", "PARTNERSHIPS"], "STANDS"],
    ["fielding", ["TOP", "FIELDERS"], "CATCH"],
  ];
  const pages = [];
  const files = [];
  for (const [key, title, watermark] of specs) {
    const list = lists[key];
    if (!list.rows.length) continue;
    const extra = list.alsoLevel ? `${list.alsoLevel} more also on ${list.rows.at(-1).big} · ` : "";
    const file = `NCU ${short} Top 5 ${key[0].toUpperCase()}${key.slice(1)}.png`;
    files.push(file);
    pages.push({
      file: path.join(dir, file),
      html: await cardHtml(
        {
          title,
          watermark,
          eyebrow: `${round.toUpperCase()} · TOP 5`,
          dateLine: `${extra}${when}`,
          rows: list.rows,
          footnote: key === "fielding" ? "Figures from PlayHQ scorecards" : "Figures from PlayHQ scorecards · * not out",
        },
        path.join(ROOT, "assets", "ncu-logo.jpg"),
      ),
    });
  }
  await renderPngs(pages);

  const text = caption(round, lists);
  await writeFile(path.join(dir, "caption.txt"), text);

  const checks = [
    ...unscored.map((u) => `Not scored yet in PlayHQ — ${u}`),
    ...unfinished.map((u) => `Last day played but not finished in PlayHQ — ${u}`),
    ...lists.partnerships.doubts,
    ...Object.entries(lists)
      .filter(([, l]) => l.rows)
      .flatMap(([k, l]) => l.rows.filter((r) => JSON.stringify(r.names).includes("Private player")).map((r) => `${k}: a private player (${r.club}, ${r.big}) is shown as "Private player"`)),
  ];
  const rel = path.relative(ROOT, dir).split(path.sep).join("/");
  const repo = process.env.GITHUB_REPOSITORY;
  const ref = process.env.GITHUB_REF_NAME || "main";
  const img = (f) =>
    repo ? `https://github.com/${repo}/blob/${ref}/${rel}/${encodeURIComponent(f)}?raw=true` : `${encodeURIComponent(f)}`;
  const issue = [
    `<!-- top5:dir=${rel} -->`,
    `**${round} Top 5** — ${when}. ${cards.length} scorecards read${unscored.length ? `, ${unscored.length} not yet scored` : ""}` +
      `${heldOver ? `; ${heldOver} two-day innings still going at stumps wait for next week` : ""}.`,
    "",
    "To post: check the cards and the caption, edit the caption below if you want to (keep the two marker lines), then add the **approved** label. The cards go up as one album on the NCU Page and the link is added here.",
    "",
    checks.length ? `### Check before posting\n${checks.map((c) => `- ${c}`).join("\n")}\n` : "",
    "### Caption",
    "<!-- caption:start -->",
    text,
    "<!-- caption:end -->",
    "",
    "### Cards",
    ...files.map((f) => `<img src="${img(f)}" width="540" alt="${f}">`),
  ].join("\n");
  await writeFile(path.join(dir, "issue.md"), issue);
  const shown = { today, innings: cards.flatMap((c) => c.innings.map((inn) => inn.id)) };
  await writeFile(path.join(dir, "shown.json"), JSON.stringify(shown, null, 2));
  await writeFile(path.join(ROOT, "rounds", "latest.json"), JSON.stringify({ dir: rel, round, when, files }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `dir=${rel}\ntitle=Top 5 — ${round} (${season.name})\n`);
  }
  console.log(`Wrote ${rel}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
