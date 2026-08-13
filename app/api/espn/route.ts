const ATHLETE_IDS = new Set(["4426348", "2577417"]);
const TEAM_SLUGS = new Set(["wsh", "dal"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const value = url.searchParams.get("value") ?? "";

  let upstreamUrl: string;
  if (kind === "athlete" && ATHLETE_IDS.has(value)) {
    upstreamUrl = `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${value}/stats`;
  } else if (kind === "team" && TEAM_SLUGS.has(value)) {
    upstreamUrl = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${value}`;
  } else {
    return Response.json({ error: "Unsupported ESPN request." }, { status: 400 });
  }

  try {
    const response = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return Response.json({ error: "ESPN did not return stats." }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Unable to reach ESPN", error);
    return Response.json({ error: "Unable to reach ESPN." }, { status: 502 });
  }
}
