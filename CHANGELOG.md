# Changelog

## 0.2.0

### Changed

- **A request now waits up to 60 seconds for a CODAP response, rather than about 2 seconds.**
  iframe-phone's 2s timer reports that no reply has arrived yet; it does not cancel the request,
  and the real reply still arrives afterwards. Treating it as a failure meant a large request —
  creating several thousand items, say — was reported as failed while the result that was about to
  arrive was discarded. A plugin with its own "taking too long" UI tuned to the old ~2s rejection
  will now wait longer before its error path runs; `setRequestTimeout()` can restore a shorter
  deadline.
- **A callback passed to `sendRequest` is now invoked exactly once, on every outcome**: with the
  response on success, and with `undefined` when CODAP did not respond. Previously a request that
  took longer than iframe-phone's 2s timer invoked the callback twice — once with `undefined` when
  the timer expired, and again with the real reply when it arrived. Callbacks written as
  `result.success` therefore threw a `TypeError` at the 2s mark before succeeding normally.
- **`sendRequest` rejects when there is no connection**, rather than leaving the promise pending
  forever. Calling it before `initializePlugin()` now reports a failure instead of doing nothing.
- **An exception thrown by a request callback is rethrown on a fresh task.** The request has
  already settled by the time its callback runs, so a throw from it is a bug in the callback rather
  than a failure of the request, and it must not escape into the stack that invoked it. Previously
  it did: on the reply path it propagated into iframe-phone's message listener, skipping that
  library's own bookkeeping, while on other paths it was discarded without a trace. It now reaches
  `window.onerror` and error reporters on every path, including from an `async` callback, whose
  throw a `try`/`catch` around the call cannot see.
- `init()` still fails fast: the handshake rejects as soon as nothing answers it, so a plugin
  loaded outside CODAP finds out in seconds rather than after the full request timeout.
- **`createCollectionFromAttribute` now reports whether the reorganization happened.** It ran on
  nested callbacks and resolved with the reply to its first request — the collection lookup — so it
  reported success while the steps that create the collection and move the attribute into it were
  still outstanding, and their failures reached the caller as nothing at all. It now awaits each
  step and resolves with an `IResult` for the last one it reached: the move on success, or the step
  CODAP refused. A request that goes unanswered rejects, as it does elsewhere in the helpers. Its
  declared return type changes from `Promise<unknown>` to `Promise<IResult>`.

### Added

- `codapInterface.getRequestTimeout()` and `codapInterface.setRequestTimeout(ms)`.

### Fixed

- **Request failures inside the bundled helpers are reported rather than thrown.** `selectSelf`,
  `createCollectionFromAttribute` and `ensureUniqueCollectionName` read `.success` off the
  response, so a request that went unanswered previously surfaced as a `TypeError` — and, where the
  promise was discarded, an unhandled rejection. `selectSelf` now logs a warning, since it is
  fire-and-forget and has no caller waiting on an answer. The other two reject with a descriptive
  message: a lookup that gets no answer says nothing about whether the name is free or the
  collection exists, and that is the caller's to decide.
- `stats.timeDiFirstReq` was never set; each data-interactive request overwrote
  `stats.timeCodapFirstReq` instead.
