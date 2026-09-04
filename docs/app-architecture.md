# Make Video App

The app is a visual production surface for an agent-driven video project.
It does not replace planning in Codex or another coding agent. Its first scope
is asset preview, revision requests, timeline inspection, render previews,
caption editing, model selection, and QA.

## Architecture boundary

```text
App UI -> ProjectTransport -> REST adapter ------> Application service
Agent host -------------> MCP stdio or HTTP -----> Application service
Future web app -> ProjectTransport -> remote API -> Application service
```

GUI components must never call MCP, `fetch`, the filesystem, shell commands,
or model providers directly. Components depend only on the `ProjectTransport`
interface. The local browser implementation is `httpTransport`, which owns the
REST calls. Codex, Claude Code, and other agent hosts use MCP over stdio or
Streamable HTTP. Both adapters call the same application service.

The application service owns validation, path boundaries, version creation, and
atomic writes. A future remote backend must
be able to implement the same service contract. HTTP routes and MCP tools are
thin adapters around that contract, not separate business logic.

In development, Vite proxies REST calls to the HTTP server in `packages/mcp`;
that server also exposes the Streamable HTTP MCP endpoint and serves the built
app in production. Agent hosts normally spawn its stdio mode. A future remote
backend can implement the same transport and service contracts without changing
components or production rules.

## Workspace layout

The pnpm workspace keeps runtime boundaries explicit:

- `packages/app`: React/Vite editor shell and browser transports.
- `packages/contracts`: shared project and transport types.
Every package reports progress on stderr, never stdout. These functions run
inside the MCP server as well as behind the CLIs, and a stdio session owns stdout
for its JSON-RPC frames; a progress line written there corrupts the stream. The
one exception is the HTTP server printing its own address, which never runs in
stdio mode.

- `packages/project`: how a video project is located, read, and kept inside the
  repository. Every package that touches project files resolves configured paths
  through it, so the boundary that stops a configuration reaching the rest of the
  disk has one definition rather than seven. Each package still validates what it
  needs: source ingestion does not require a composition, the MCP service does.
- `packages/ai`: the unified media-generation command. Every generator takes a
  `MediaProvider` — the four model calls behind one replaceable interface — so
  the rules around them (output paths, overwrite refusal, provenance, prompt
  assembly, resume decisions) are exercised without spending anything.
- `packages/assets`: project scaffolding, canonical asset linking, preparation,
  and example project installation.
- `packages/audio`: audio preparation, narration timing, and deterministic UI
  sound effects; its build emits one `skills/make-video/scripts/audio.mjs`.
- `packages/qa`: deterministic media and timeline QA; its build emits one
  `skills/make-video/scripts/qa.mjs` entrypoint with mode arguments.
- `packages/render`: Remotion and FFmpeg rendering, including declared delivery
  variants; its build emits one `skills/make-video/scripts/render.mjs`
  entrypoint with mode arguments.
- `packages/series`: deterministic multi-episode plan verification and coverage
  records; its build emits one `skills/make-video/scripts/series.mjs` entrypoint
  with mode arguments.
- `packages/sources`: source ingestion, catalog validation, and human-readable
  source-list generation; its build emits one `skills/make-video/scripts/sources.mjs`
  entrypoint with mode arguments.
- `packages/mcp`: TypeScript MCP application service and adapters; its build
  emits one `skills/make-video/scripts/mcp.mjs` entrypoint with `stdio` and
  `http` modes.
- `packages/examples`: reusable media/source fixtures; user project state stays
  local and ignored.
- `skills/make-video/scripts`: generated skill entrypoints and production
  scripts; MCP source code does not live here.

The app keeps UI responsibilities separate: `packages/app/src/App.tsx` owns project
selection and editor state; `components/` owns the asset bin, preview,
inspector, and timeline; `lib/` contains presentation helpers. `main.tsx` only
boots React and the Astryx theme.

## MCP surface

The stdio and `/mcp` Streamable HTTP entries expose the same tools:

- `make_video_list_projects`
- `make_video_create_project`
- `make_video_get_project`
- `make_video_update_caption`
- `make_video_update_models`
- `make_video_request_image_revision` (starts a generation job)
- `make_video_set_cover`
- `make_video_ingest_sources`
- `make_video_get_sources`
- `make_video_build_source_catalog`
- `make_video_build_source_list`
- `make_video_get_plan`
- `make_video_save_plan`
- `make_video_prepare_generation`
- `make_video_build_storyboard`
- `make_video_validate_script`
- `make_video_build_timing`
- `make_video_generate`
- `make_video_get_generation_job`
- `make_video_render`
- `make_video_get_render_job`
- `make_video_qa`
- `make_video_get_qa_job`
- `make_video_get_timing_job`
- `make_video_get_source_job`
- `make_video_check_generation_readiness`
- `make_video_estimate_generation`
- `make_video_get_build_status`
- `make_video_get_deliverables`
- `make_video_deliver` (starts a delivery render job)
- `make_video_get_delivery_job`
- `make_video_list_series`
- `make_video_get_series`
- `make_video_verify_series`
- `make_video_build_series_coverage`

They also expose `make-video://projects` and one read-only project resource per
video. Tool handlers contain no filesystem rules; they delegate to
the shared MCP application service, just like the REST compatibility routes.

## Source of truth

Inspectable project files remain authoritative:

- `video.config.json` stores selected image, video, and voice models.
- `SCENE_INDEX.json` stores scene and caption timing plus optional scene content
  (`type`, titles, quotes, charts, maps, documents, and relationship data).
- `REMOTION_TIMELINE.json` stores absolute-frame Remotion effects for the FX
  track, including effect type, label, parameters, and scene association.
- `PROJECT_STATE.json` stores revision requests and UI-relevant production state.
- `COVER.json` stores the selected cover source without overwriting a rendered
  thumbnail.
- `VIDEO_PLAN.json` stores the host-agent-authored, source-referenced plan;
  MCP validates its source block references before writing it.
- `video.config.json.imageGeneration.assets` stores the deterministic image
  generation configuration materialized from that plan.
- `GENERATION_PLAN.json` stores the declared unit cost and expected latency of
  each paid asset; `GENERATION_ESTIMATE.json` is the priced report derived from
  it, and is rewritten on every estimate because it costs nothing to recompute.
- `public/<video-id>/images/generated/manifest.json` records each generated image
  as it is written, so an interrupted batch keeps its provenance and the next run
  can skip what is unchanged; `video/generated/operations.json` does the same for
  clips, recording each request before it is sent so an interrupted, possibly
  billed request is visible to the next run instead of being reissued silently.
- `DELIVERABLES.json` stores the declared delivery variants; every variant is a
  render of the same timeline, never a re-cut of the master. Delivery measures
  each file it writes and records whether it matches its declaration, and drops
  report entries for variants the project no longer declares.
- `SERIES_EPISODE.json` records which series episode a project was scaffolded
  from, so an episode stays traceable to its plan.
- `projects/<series-id>/series-plan.json` and `SERIES_BIBLE.json` store series
  structure and shared canon; `COVERAGE.md` is generated from them.
- Rendered media, QA reports, and `delivery-report.json` remain under
  `output/<video-id>/`.

Every project file is read through one JSON reader that names the file it could
not parse, and every CLI entrypoint reports a failure as a single line with a
non-zero exit rather than a stack trace through the minified bundle.

Browser state is limited to local preferences and provider keys. Model choices
are also saved to project configuration; local storage is not a second
production timeline or asset store.

## Initial surfaces

1. Asset browser with version history, selection, and edit requests.
2. Scene timeline with visual, narration, caption, and production status.
3. Video player for the cover image, preview video, and final video.
4. Caption editor with explicit save and narration-mismatch warnings.
5. Image and voice model selectors backed by a capability registry.
6. Outputs action to materialize the saved plan as `STORYBOARD.md`.
7. Outputs action to prepare image generation configuration from the saved plan.
8. Delivery variant list with per-variant render state and a pending-variant
   render action.

Cost is read the same way: `make_video_estimate_generation` prices a run from the
project's declared cost plan without contacting a provider, so a caller can say
what a paid step will cost before starting it.

Build status is a separate read: it compares output modification times against
the project files an output was built from, so the caller can rebuild only what a
change invalidated without probing or re-rendering anything.

Long-running generation and rendering operations use jobs. Starting an action
returns a job id; progress and completion are read separately so HTTP or MCP
calls never remain blocked for the duration of a render.

## Safety

- Never overwrite generated media; create a revision and select it explicitly.
- Provider keys entered in model settings stay in browser local storage and are
  never sent through REST or MCP. Server-side generation reads its own
  environment credentials.
- Scope every path to the selected video project.
- Keep paid generation separate from inspection and configuration actions.
