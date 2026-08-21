# Make Video Workbench

The Workbench is a visual production surface for an agent-driven video project.
It does not replace planning in Codex or another coding agent. Its first scope
is asset review, revision requests, timeline inspection, render previews,
caption editing, model selection, and QA.

## Architecture boundary

```text
Workbench UI -> Transport -> Application service -> Project files and jobs
                    |-> HTTP today
                    `-> MCP Apps later
```

GUI components must never call MCP, `fetch`, the filesystem, shell commands,
or model providers directly. Components depend only on the `WorkbenchTransport`
interface. The HTTP transport is the first implementation; an MCP Apps
transport can replace it without changing screens or production rules.

The application service owns validation, path boundaries, approval locks,
version creation, cost checks, and atomic writes. A future remote backend must
be able to implement the same service contract. HTTP routes and MCP tools are
thin adapters around that contract, not separate business logic.

## Source of truth

Inspectable project files remain authoritative:

- `video.config.json` stores selected image and voice models.
- `SCENE_INDEX.json` stores scene and caption timing.
- `CANDIDATES.json` stores media candidates and the selected version.
- `WORKBENCH.json` stores revision requests and UI-relevant production state.
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
