// The 1080×1080 Facebook card, as one HTML page per card, rendered to PNG with Playwright.

import { readFile } from "node:fs/promises";

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function dataUri(url) {
  try {
    if (!url.startsWith("http")) {
      return `data:image/jpeg;base64,${(await readFile(url)).toString("base64")}`;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

const initials = (club) =>
  club
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/**
 * @param card { title: [plain, red], watermark, eyebrow, dateLine, rows, footnote }
 *   rows: { rank, big, small, names: (string | [name, score])[], club, match, logo }
 */
export async function cardHtml(card, ncuLogoPath) {
  const ncu = await dataUri(ncuLogoPath);
  const logos = new Map();
  for (const r of card.rows) if (r.logo && !logos.has(r.logo)) logos.set(r.logo, await dataUri(r.logo));
  const highlightFirst = card.rows.length > 0 && !card.rows[0].rank.startsWith("=");
  const rows = card.rows
    .map((r, i) => {
      const logo = r.logo && logos.get(r.logo);
      const names = r.names
        .map((n) =>
          Array.isArray(n)
            ? `<div class="nm">${esc(n[0])} <span class="sc">${esc(n[1])}</span></div>`
            : `<div class="nm">${esc(n)}</div>`,
        )
        .join("");
      return `<div class="row${i === 0 && highlightFirst ? " top" : ""}">
  <div class="rk">${esc(r.rank)}</div>
  <div class="rn"><div class="big">${esc(r.big)}</div>${r.small ? `<div class="sm">${esc(r.small)}</div>` : ""}</div>
  <div class="lg">${logo ? `<img src="${logo}">` : `<span>${esc(initials(r.club))}</span>`}</div>
  <div class="tx">${names}<div class="sub"><b>${esc(r.club)}</b> · ${esc(r.match)}</div></div>
</div>`;
    })
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;position:relative;
 background:radial-gradient(1200px 800px at 85% 10%,#1f3a8a 0%,#16245e 45%,#121a4a 100%)}
.bar{position:absolute;top:0;left:0;right:0;height:14px;background:#d0312d}
.wm{position:absolute;right:-30px;top:70px;font-family:'Bebas Neue';font-size:300px;line-height:.85;
 color:rgba(255,255,255,.045);writing-mode:vertical-rl;letter-spacing:4px}
.crest{position:absolute;left:64px;top:76px;width:150px;height:150px;border-radius:50%;background:#fff;
 display:flex;align-items:center;justify-content:center;overflow:hidden}
.crest img{width:132px}
.ht{position:absolute;left:224px;top:62px;white-space:nowrap}
.eb{font-size:21px;font-weight:700;letter-spacing:5px;color:#a9b4dc}
h1{font-family:'Bebas Neue';font-weight:400;font-size:102px;line-height:.95;margin-top:2px}
h1 span{color:#d0312d}
.dt{font-size:21px;font-weight:600;color:#a9b4dc;margin-top:6px}
.list{position:absolute;left:64px;right:64px;top:258px;bottom:108px;display:flex;flex-direction:column;gap:12px}
.row{flex:1;min-height:0;border-radius:12px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.1);
 display:flex;align-items:center;padding:0 24px 0 30px}
.row.top{background:linear-gradient(90deg,#c22f2f,#a52a35);border-color:rgba(255,255,255,.18)}
.rk{flex:none;font-family:'Bebas Neue';font-size:50px;width:70px;color:#a9b4dc}
.top .rk{color:#fff}
.rn{flex:none;width:196px}
.big{font-family:'Bebas Neue';font-size:80px;line-height:.9}
.sm{font-size:14px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#a9b4dc;margin-top:4px}
.top .sm{color:#ffd9d6}
.lg{width:90px;height:90px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;
 overflow:hidden;flex:none;margin-right:26px;color:#16245e;font-family:'Bebas Neue';font-size:36px}
.lg img{width:78px;height:78px;object-fit:contain}
.tx{min-width:0}
.nm{font-size:28px;font-weight:800;line-height:1.18}
.sc{font-weight:600;color:#c3cbea;margin-left:4px}
.top .sc{color:#ffe1de}
.sub{font-size:19px;font-weight:600;color:#a9b4dc;margin-top:6px;line-height:1.25}
.sub b{color:#fff;font-weight:700}
.top .sub{color:#ffe1de}
.ft{position:absolute;left:64px;right:64px;bottom:38px;display:flex;justify-content:space-between;align-items:baseline}
.ft .o{font-size:18px;font-weight:800;letter-spacing:3.5px}
.ft .s{font-size:18px;font-weight:600;color:#a9b4dc}
.pair .nm{font-size:25px}
.pair .sub{font-size:17px;margin-top:4px}
</style></head><body class="${card.rows.some((r) => r.names.length > 1) ? "pair" : ""}">
<div class="bar"></div><div class="wm">${esc(card.watermark)}</div>
<div class="crest">${ncu ? `<img src="${ncu}">` : ""}</div>
<div class="ht"><div class="eb">${esc(card.eyebrow)}</div>
<h1>${esc(card.title[0])} <span>${esc(card.title[1])}</span></h1>
<div class="dt">${esc(card.dateLine)}</div></div>
<div class="list">${rows}</div>
<div class="ft"><div class="o">NORTHERN CRICKET UNION</div><div class="s">${esc(card.footnote)}</div></div>
</body></html>`;
}

/** Renders each { file, html } to a PNG at `file`. */
export async function renderPngs(pages) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
    for (const { file, html } of pages) {
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: file });
    }
  } finally {
    await browser.close();
  }
}
