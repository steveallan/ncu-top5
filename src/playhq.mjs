// The cricket.com.au grassroots API behind play.cricket.com.au. No key needed, but Akamai turns
// away requests without a browser User-Agent.

const BASE = "https://grassrootsapiproxy.cricket.com.au";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

export const NCU_ORG_ID = "99136ece-5c32-ec11-981f-501ac52e1666";

async function get(path, attempt = 1) {
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}jsconfig=eccn:true`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (res.status === 204) return null;
  if (!res.ok) {
    if (attempt < 3 && res.status >= 500) return get(path, attempt + 1);
    throw new Error(`PlayHQ ${res.status} for ${path}`);
  }
  return res.json();
}

export async function currentSeason(orgId = NCU_ORG_ID) {
  const { seasons } = await get(`/fixturesladders/organisations/${orgId}/seasons`);
  return seasons.find((s) => s.isCurrentSeason) ?? seasons[0];
}

export async function grades(seasonId, orgId = NCU_ORG_ID) {
  const data = await get(
    `/fixturesladders/organisations/${orgId}/competition-seasons?seasonId=${seasonId}&responseModifier=includeGrades`,
  );
  const out = [];
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      if (Array.isArray(x.grades)) out.push(...x.grades.map((g) => ({ id: g.id, name: g.name })));
      Object.values(x).forEach(walk);
    }
  };
  walk(data);
  return [...new Map(out.map((g) => [g.id, g])).values()];
}

export async function gradeMatches(gradeId) {
  const data = await get(`/scores/grades/${gradeId}/matches`);
  return Array.isArray(data) ? data : (data?.matches ?? []);
}

export async function scorecard(matchId) {
  return get(`/scores/matches/${matchId}?responseModifier=includeScorecard`);
}
