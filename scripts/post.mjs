// Posts an approved round's cards to the NCU Facebook Page as one album post, with the caption as
// it stands in the approval issue (so edits made there are what goes up).
//
//   ISSUE_BODY="$(cat rounds/.../issue.md)" node scripts/post.mjs
//
// Needs FB_PAGE_ID and FB_PAGE_TOKEN. With DRY_RUN=1 it checks everything and posts nothing;
// with CHECK_TOKEN=1 it only checks the token.
// Prints the post's link on success.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH = `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || "v23.0"}`;
const ORDER = ["Batting", "Bowling", "Partnerships", "Fielding"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function graph(pathname, body) {
  const res = await fetch(`${GRAPH}/${pathname}`, { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) fail(`Facebook said no (${res.status}): ${json.error?.message ?? JSON.stringify(json)}`);
  return json;
}

async function checkToken(pageId, token) {
  const me = await fetch(`${GRAPH}/${pageId}?fields=name&access_token=${token}`).then((r) => r.json());
  if (me.error) fail(`The token doesn't work for that Page: ${me.error.message}`);
  const debug = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`).then((r) => r.json());
  const d = debug.data ?? {};
  const expires = d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : "never";
  const scopes = d.scopes ?? [];
  console.log(`The token works for "${me.name}". It's a ${d.type ?? "?"} token, expires: ${expires}.`);
  console.log(`Permissions: ${scopes.join(", ") || "(couldn't read)"}`);
  if (scopes.length && !scopes.includes("pages_manage_posts")) fail("It's missing pages_manage_posts, so it can't post.");
}

async function main() {
  const pageId = process.env.FB_PAGE_ID;
  const token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) fail("FB_PAGE_ID and FB_PAGE_TOKEN must be set (repository secrets).");
  if (process.env.CHECK_TOKEN) return checkToken(pageId, token);

  const body = process.env.ISSUE_BODY ?? "";
  const dir = body.match(/<!-- top5:dir=(.+?) -->/)?.[1];
  const caption = body.match(/<!-- caption:start -->\r?\n([\s\S]*?)\r?\n<!-- caption:end -->/)?.[1]?.trim();
  if (!dir) fail("The issue has lost its top5:dir marker, so I can't tell which round to post.");
  if (!caption) fail("The caption markers are missing from the issue, so there's no caption to post.");

  const folder = path.join(ROOT, dir);
  const files = (await readdir(folder))
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => ORDER.findIndex((k) => a.includes(k)) - ORDER.findIndex((k) => b.includes(k)));
  if (!files.length) fail(`No cards in ${dir}.`);
  console.log(`Posting ${files.length} cards from ${dir}:\n${files.map((f) => `  ${f}`).join("\n")}\n\n${caption}\n`);

  if (process.env.DRY_RUN) {
    await checkToken(pageId, token);
    console.log("Dry run: nothing posted.");
    return;
  }

  // Upload each card unpublished, then publish them together as one post.
  const media = [];
  for (const f of files) {
    const form = new FormData();
    form.set("source", new Blob([await readFile(path.join(folder, f))], { type: "image/png" }), f);
    form.set("published", "false");
    form.set("access_token", token);
    const { id } = await graph(`${pageId}/photos`, form);
    media.push(id);
  }
  const post = new URLSearchParams({ message: caption, access_token: token });
  media.forEach((id, i) => post.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
  const { id } = await graph(`${pageId}/feed`, post);
  const [page, postId] = id.split("_");
  console.log(`https://www.facebook.com/${page}/posts/${postId}`);
}

main().catch((e) => fail(e.stack ?? String(e)));
