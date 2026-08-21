# Make Video Workbench

The Workbench is a visual production surface for an agent-driven video project.
It does not replace planning in Codex or another coding agent. Its first scope
is asset review, revision requests, timeline inspection, render previews,
caption editing, model selection, and QA.

## Architecture boundary

```text
Workbench UI -> Transport -> MCP Streamable HTTP -> Application service
Agent host ----------------> MCP stdio -----------> Application service
REST compatibility adapter ----------------------> Application service
```

GUI components must never call MCP, `fetch`, the filesystem, shell commands,
or model providers directly. Components depend only on the `WorkbenchTransport`
interface. The browser uses a Streamable HTTP MCP client hidden behind that
interface. Codex, Claude Code, and other local MCP hosts use the stdio adapter.
Both call the same application service.

The application service owns validation, path boundaries, approval locks,
version creation, cost checks, and atomic writes. A future remote backend must
be able to implement the same service contract. HTTP routes and MCP tools are
thin adapters around that contract, not separate business logic.

The frontend server owns the Streamable HTTP MCP endpoint and local filesystem
access; React components only call `WorkbenchTransport`. Agent hosts spawn the
stdio MCP server. A future remote backend can implement the same transport and
service contracts without changing components or production rules.

## Workspace layout

The pnpm workspace keeps runtime boundaries explicit:

- `packages/app`: React/Vite editor shell and browser transports.
- `packages/contracts`: shared project and transport types.
- `packages/ai`: AI SDK provider adapters and the unified media-generation
  command.
- `packages/mcp`: TypeScript MCP application service and adapters; its build
  emits one `skills/make-video/scripts/mcp.mjs` entrypoint with `stdio`,
  `http`, and `check` modes.
- `packages/examples`: reusable media/source fixtures; user project state stays
  local and ignored.
- `skills/make-video/scripts`: generated skill entrypoints and production
  scripts; MCP source code does not live here.

The app keeps UI responsibilities separate: `app/Workbench.tsx` owns project
selection and editor state; `components/` owns the asset bin, preview,
inspector, and timeline; `lib/` contains presentation helpers. `main.tsx` only
boots React and the Astryx theme.

## MCP surface

The stdio and `/mcp` Streamable HTTP entries expose the same tools:

- `make_video_list_projects`
- `make_video_get_project`
- `make_video_update_caption`
- `make_video_update_models`
- `make_video_request_image_revision`
- `make_video_set_cover`

They also expose `make-video://projects` and one read-only project resource per
video. Tool handlers contain no filesystem rules; they delegate to
the shared MCP application service, just like the REST compatibility routes.

## Source of truth

Inspectable project files remain authoritative:

- `video.config.json` stores selected image and voice models.
- `SCENE_INDEX.json` stores scene and caption timing.
- `REMOTION_TIMELINE.json` stores absolute-frame Remotion effects for the FX
  track, including effect type, label, parameters, and scene association.
- `CANDIDATES.json` stores media candidates and the selected version.
- `WORKBENCH.json` stores revision requests and UI-relevant production state.
- `COVER.json` stores the selected cover source without overwriting a rendered
  thumbnail.
- Rendered media and QA reports remain under `output/<video-id>/`.

Browser state is limited to presentation preferences. It must not become a
second production state.

## Initial surfaces

1. Asset browser with version history, selection, locking, and edit requests.
2. Scene timeline with visual, narration, caption, and production status.
3. Render-stage player for contact sheet, silent preview, mastered output,
   trailers, shorts, and QA.
4. Caption editor with explicit save and narration-mismatch warnings.
5. Image and voice model selectors backed by a capability registry.

Long-running generation and rendering operations use jobs. Starting an action
returns a job id; progress and completion are read separately so HTTP or MCP
calls never remain blocked for the duration of a render.

## Safety

- Never overwrite generated media; create a revision and select it explicitly.
- Never expose provider credentials to the browser.
- Never let a GUI action bypass approval or cost gates.
- Scope every path to the selected video project.
- Keep paid generation separate from inspection and configuration actions.
