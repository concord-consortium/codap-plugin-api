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
- `init()` still fails fast: the handshake rejects as soon as nothing answers it, so a plugin
  loaded outside CODAP finds out in seconds rather than after the full request timeout.

### Added

- `codapInterface.getRequestTimeout()` and `codapInterface.setRequestTimeout(ms)`.

### Fixed

- **Request failures inside the bundled helpers are reported rather than thrown.** `selectSelf`,
  `createCollectionFromAttribute` and `ensureUniqueCollectionName` read `.success` off the
  response, so a request that went unanswered previously surfaced as a `TypeError` — and, where the
  promise was discarded, an unhandled rejection. They now log a warning and return.
  `ensureUniqueCollectionName` still rejects, since a lookup that gets no answer says nothing about
  whether the name is free, but with a descriptive message rather than a `TypeError`.
- `stats.timeDiFirstReq` was never set; each data-interactive request overwrote
  `stats.timeCodapFirstReq` instead.
