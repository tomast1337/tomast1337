# telemetry

The cards on the profile README, rendered by [GlyphEngine](https://github.com/tomast1337/GlyphEngine) in CI.

```
github.ts   GitHub GraphQL  → Telemetry record
model.ts    the record, and what derives from it (streaks, heat levels)
cards.ts    record → GlyphEngine programs (main() draws the data, post() the words)
headless.ts program → one frame, no screen
svg.ts      frame → SVG (blocks as rects, box lines as strokes, the rest as text)
lastfm.ts   Last.fm         → top albums of the month
collage.ts  albums          → albums.jpg (real covers, 6 × 2)
main.ts     glue: record → one SVG per card, plus the collage
```

```sh
bun install
bun run preview                                  # fixture.json → preview/
GH_TOKEN=$(gh auth token) bun src/main.ts        # real data → out/
```

The workflow (`.github/workflows/telemetry.yml`) runs daily and force-pushes the SVGs to the `telemetry` branch.
