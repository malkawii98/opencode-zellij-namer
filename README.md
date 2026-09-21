# Gemini Zellij Namer — OpenCode V2

A fork of [24601/opencode-zellij-namer](https://github.com/24601/opencode-zellij-namer), ported to the **OpenCode V2 terminal plugin API**. Generates short, meaningful task names with Gemini and updates the Zellij tab containing the OpenCode pane.

Examples: `Checkout bug repair`, `Tafseel SSH / Coolify`, `Fork Gemini Zellij Namer`.

## What changed

- Runs in the **terminal client**, where `ZELLIJ_SESSION_NAME` and `ZELLIJ_PANE_ID` refer to the actual terminal. Works with V2's shared background server.
- Reads the currently displayed OpenCode session's user requests and supporting tool/file metadata. Other sessions on the shared server cannot rename this terminal's tab.
- Calls Gemini directly for task names. Does not copy OpenCode session titles.
- Keeps up to five recent user requests, independently of tool noise; preserves Unicode, proper names, and acronyms.
- Combines multiple OpenCode panes in a tab as `Task A | Task B`, ordered left-to-right, then top-to-bottom.
- Targets a stable Zellij tab ID without switching focus. Rechecks pane membership every five seconds.
- Aborts Gemini after 15 seconds; retries failures with 30-second to five-minute backoff.
- Records successful names, fallback reasons, load/unload, and rename errors in per-pane JSONL logs. API keys are redacted; full prompts aren't logged.
- Cleans up timers, pending requests, and owned pane state on unload.

## Requirements

- OpenCode **V2** (tested with 2.0.12).
- Zellij with `list-panes -t -j` and `rename-tab --tab-id` (tested with 0.45.1).
- Bun for building and testing.
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` exported in the terminal that launches OpenCode.

## Install from this fork

```sh
git clone https://github.com/malkawii98/opencode-zellij-namer.git
cd opencode-zellij-namer
bun install --frozen-lockfile
bun run install:local
```

The installer writes two tiny entrypoints under `~/.config/opencode/plugins/zellij-namer/` (or `$XDG_CONFIG_HOME/opencode/plugins/zellij-namer/`). These point to this checkout's built `dist/index.js` and `dist/tui.js`. Keep the checkout in place. This directory-discovery installation was verified in live V2 terminals; no `cli.json` edit is needed.

The server entrypoint is a no-op. All naming runs in the terminal plugin. Restart the OpenCode terminal client if discovery does not reload automatically. Remove/disable an older namer to avoid competing updates. Keep its source as a backup outside auto-discovered `.ts` plugin paths.

The scoped package name is reserved for this fork; this README does not assume an npm release exists.

## Configuration

Export settings in the terminal that starts OpenCode:

```sh
export OPENCODE_ZN_MODEL=gemini-3.5-flash-lite
export OPENCODE_ZN_COOLDOWN_MS=300000
export OPENCODE_ZN_TIMEOUT_MS=15000
export OPENCODE_ZN_INSTRUCTIONS='Keep names concrete and preserve project acronyms.'
```

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | required | Gemini credential, read locally by the CLI |
| `OPENCODE_ZN_MODEL` | `gemini-3.5-flash-lite` | Gemini model |
| `OPENCODE_ZN_COOLDOWN_MS` | `300000` | Minimum time between successful AI naming calls for a session |
| `OPENCODE_ZN_TIMEOUT_MS` | `15000` | Abort deadline for Gemini |
| `OPENCODE_ZN_DEBOUNCE_MS` | `2000` | Cached session-check interval |
| `OPENCODE_ZN_INSTRUCTIONS` | empty | Additional naming guidance |
| `OPENCODE_ZN_USE_AGENTS_MD` | `1` | Set to `0` to skip the current directory's `## Naming` / `## Session Naming` section |
| `OPENCODE_ZN_ZELLIJ` | auto-detected | Override the Zellij executable |

The first available user request is named immediately. Further changed requests are processed after cooldown. Unchanged requests do not trigger repeated successful AI calls. A fallback does not mark an input successful, so it is retried after backoff. On failure an existing name is retained, or a short user-request excerpt is used until Gemini recovers. On resume, the last five user messages are fetched independently of the UI's truncated transcript; while user messages are absent from the cache, that bounded history is refreshed at most every 30 seconds.

Logs are at `os.tmpdir()/opencode-zellij-names/<encoded-zellij-session>/<pane-id>.log`. On macOS:

```sh
tail -n 20 "$TMPDIR/opencode-zellij-names/work/$ZELLIJ_PANE_ID.log"
```

Look for `event: loaded`, then `event: decision` with `source: gemini`, followed by `event: renamed`. A fallback includes `reason`. Logs rotate after 1 MiB, retaining one previous file.

### Data sent to Gemini

Up to five recent user requests (800 characters each), the directory basename, the previous generated name, and up to ten recent tool names / changed-file basenames. Tool arguments, file contents, and assistant reasoning are not included. Requests can contain sensitive text; the naming API uses your configured Gemini credential.

## Development

```sh
bun run typecheck
bun test
bun run build
```

`src/tui.ts` is the V2 implementation. `src/tui.test.ts` exercises the actual controller, including navigation races, cooldown, timeout cancellation, fallback recovery, and multi-pane naming. `src/index.ts` is a no-op server companion. The upstream implementation is retained at `src/v1.ts` / package export `./v1`; its original documentation is in [README-v1.md](README-v1.md).

MIT license; upstream copyright and license retained.
