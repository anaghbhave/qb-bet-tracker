# QB Bet Tracker

A 2026 season tracker comparing Jayden Daniels and Dak Prescott across QBR, passer
rating, total touchdowns, touchdown-to-interception ratio, and team wins. Whoever
leads more of the five categories at season's end wins the bet.

**Live: https://anaghbhave.github.io/qb-bet-tracker/**

Every number is read live from ESPN on page load — there are no editable fields and
nothing is stored. ESPN serves its stats endpoints with `Access-Control-Allow-Origin: *`,
so the page calls them straight from the browser and needs no server of its own: the
whole tracker is one static HTML file.

## Categories

| Category | Source |
| --- | --- |
| QBR | ESPN passing category, `QBR` |
| RTG | ESPN passing category, `RTG` |
| TD | passing `TD` + rushing `TD` |
| T:I | passing `TD` ÷ passing `INT` (rushing excluded) |
| W | athlete gamelog, wins in games he appeared in |

Two notes on the scoring, both covered by tests:

- Total touchdowns must add the passing and rushing columns. ESPN's `scoring`
  category has its own `TD` column, but it counts only touchdowns the player
  scored himself, so it misses every touchdown pass.
- Wins count only the games the quarterback actually appeared in, read from his
  game log rather than the team's record. Washington can win a game he sat out,
  and that win is not his — Daniels is 0-2-1 in his three games while the team
  is 1-3-1. The team's overall record is shown beside the number for context.
- The TD:INT ratio counts passing touchdowns only. Rushing scores say nothing
  about protecting the ball through the air, so they are excluded here — the TD
  category above still counts them.
- A clean sheet (touchdown passes, zero interceptions) is an infinite ratio and
  beats any quarterback who has thrown a pick. Two clean sheets are split by
  passing touchdown count. Zero touchdowns and zero picks is not a clean sheet.

## Layout

- `public/qb-bet-tracker.html` — the tracker, and the source of truth.
- `docs/index.html` — the copy GitHub Pages serves. Run `npm run sync:pages` after
  editing the tracker; a test fails if the two drift apart.

## Run locally

Open `public/qb-bet-tracker.html` in a browser — that is the whole app. To run the
Next/vinext shell that also wraps it:

```bash
npm install
npm run dev
```

`npm test` builds the site and runs the scoring tests.
