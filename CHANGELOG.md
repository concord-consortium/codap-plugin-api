# Changelog

## 0.2.0

### Breaking

Each of these changes what an existing caller sees, which is why this is a minor bump rather than a
patch: for a `0.x` package npm's caret resolves `^0.1.9` to `<0.2.0`, so a consumer picks these up
only by moving to `^0.2.0` deliberately, rather than silently on their next install.

- **A callback passed to `sendRequest` is now invoked exactly once, on every outcome**: with the
  response on success, and with `undefined` when the request failed. Previously a request that took
  longer than iframe-phone's 2s timer invoked the callback twice — once with `undefined` when the
  timer expired, and again with the real reply when it arrived — and on failures where nothing ever
  replied it was not invoked at all. A callback written as `result.success` therefore threw a
  `TypeError` at the 2s mark before succeeding normally, and a callback relying on being told about
  failure never was. Callbacks now need to handle `undefined`, which is the shape of a failure.
- **The callback parameter is typed, so a callback that cannot handle a failure no longer compiles.**
  `sendRequest`'s second parameter was `any`, which accepted `(result: IResult) => result.success` —
  the shape that throws a `TypeError` the moment a request fails. It is now `RequestCallback`
  (exported), whose response parameter admits `undefined`. This is the one change here that breaks a
  build rather than a run, which is the point: the contract above is what changed, and a compile error
  names every callback that no longer matches the expected signature, at the moment of upgrading,
  instead of leaving each one to throw on a failure path that may be rare in testing and common in
  use. A callback that already handled absence needs nothing; one that did not needs its parameter
  widened to `(result?: IResult)`.

  The required shape follows from the message. CODAP answers a batched request — an array of requests
  — with an array of results, so that case takes `BatchRequestCallback` (also exported) and passing a
  single-result callback with an array message, or the reverse, does not compile. A callback can
  therefore never be handed a response it cannot read: previously `sendRequest([a, b], cb)` compiled
  and gave `cb` an array, where reading `result.success` yielded `undefined` and a successful batch
  looked like a failed one.
- **A failed request rejects with an `Error`**, where it previously rejected with a string. Anything
  matching on the rejection value (`error.startsWith(...)`, `error === "..."`) needs updating, and
  `error.message` is where the text now lives — note that `String(error)` prefixes it with `Error: `.
  Some of the text changed too: a request that outlives its deadline now reports
  `sendRequest: CODAP request exceeded 60000ms: …` rather than
  `handleResponse: CODAP request timed out: …`, which is reserved for the handshake.
- **`sendRequest` rejects on paths that previously never settled at all.** With no connection —
  before `initializePlugin()` or after `destroy()` — it used to return a promise that stayed pending
  forever, a silent no-op. It now rejects. Since the documented pattern of passing a callback and
  discarding the promise leaves nothing attached to observe that, an unhandled rejection appears
  where nothing happened before. Attach a `.catch`, even when the callback is doing the real work.
- **An exception thrown while `init()` finishes no longer prevents it from settling.** Merging the
  saved state CODAP returned, and then `stateHandler` and the callback, all ran before the handshake's
  promise was resolved, so a throw from any of them left `initializePlugin()` pending forever with the
  exception discarded. A saved state carrying a throwing getter was enough to do it. They now run
  after it settles, and what they throw is reported the way a request callback's exception is. Note
  that a merge which throws partway leaves the interactive state partly updated, so a plugin that
  cares should treat the uncaught error as meaning `getInteractiveState()` may be incomplete.
- **An exception thrown by a request callback is rethrown as an uncaught error** rather than being
  swallowed. The request has already settled by the time its callback runs, so a throw from it is a
  bug in the callback rather than a failure of the request — but it must not escape into the stack
  that invoked it either. It is rethrown from a microtask: clear of iframe-phone's message listener
  (where a throw skipped that library's own bookkeeping), clear of the deadline timer, and clear of
  the promise executor (which discarded it silently once the promise had settled), while still
  reaching `window.onerror` and error reporters. This covers an `async` callback, whose throw
  arrives as a rejected return value that a `try`/`catch` around the call cannot see. The loudness
  is deliberate: a callback that throws on `undefined` is the `TypeError` described above, and it is
  the bug this release most wants consumers to find.
- **`createCollectionFromAttribute` reports whether the reorganization happened.** It ran on nested
  callbacks and returned the promise of its first request — the collection lookup — so it resolved
  while the steps that create the collection and move the attribute into it were still outstanding,
  and their failures reached the caller as nothing at all. It now awaits each step and resolves with
  an `IResult` for the last one it reached: the move on success, or the step CODAP refused. Two
  consequences for callers. The resolved value is different — previously the lookup's reply, which
  was `{success: false}` in the common case where no such collection existed yet. And **the promise
  can now reject**, where before an inner failure could never reject it, since it was the lookup's
  already-settled promise: an `await` with no `try`/`catch` that could not throw now can. Its
  declared return type narrows from `Promise<unknown>` to `Promise<IResult>`, which is
  source-compatible for anyone casting the result.
- **`ensureUniqueCollectionName` checks its attempt limit before issuing a lookup rather than after.**
  Callers using the documented entry point, `index = 0`, are unaffected: the candidates are still
  `collectionName` through `collectionName100` and the request count is unchanged. A caller passing an
  `index` above 100 directly now gets `undefined` without a request being issued, where it previously
  issued the lookup and returned the name if it was free.
- **A handshake that nothing answers now closes the connection**, and `init()`'s optional callback is
  invoked with `undefined` rather than being skipped. Such a handshake used to leave an endpoint
  behind that nothing was listening to, so every subsequent request was sent and then waited out the
  full deadline — a minute apiece for a plugin already told it was not running inside CODAP. Those
  requests are now refused at once. `init()` can be called again to retry, and it rejects with an
  `Error` like every other failure.

  **What counts as "nothing answers" is iframe-phone's own 2 second advisory window**, and that is
  not proof CODAP is absent: a CODAP that is alive but slow to complete the underlying "hello"
  exchange looks identical from here. The guess is not final, though. If that CODAP answers after
  all, its reply reopens the connection and requests resume, so being slow costs a plugin the
  handshake rather than the session; calling `init()` again also re-establishes it. The trade is
  deliberate — the alternative is a plugin loaded outside CODAP waiting a full minute per request to
  find out — and the handshake asks CODAP for far less work than the requests this release exists to
  stop failing.

  Only silence closes the connection, and every other way the handshake can fail leaves it open,
  because none of them says anything about whether CODAP is there: CODAP answering and declining,
  CODAP answering with no value, and the handshake message failing to send all leave a usable
  connection and fail only the handshake. Nor does silence close a connection CODAP has already been
  seen answering — a reply to any other request, or a notification, outranks it — so an `init()` that
  goes silent cannot close a connection an earlier one established, in either order. This matters for
  two overlapping `init()` calls, which React's StrictMode produces from a single effect.

### Changed

- **A request now waits up to 60 seconds for a CODAP response, rather than about 2 seconds.**
  iframe-phone's 2s timer reports that no reply has arrived yet; it does not cancel the request,
  and the real reply still arrives afterwards. Treating it as a failure meant a large request —
  creating several thousand items, say — was reported as failed while the result that was about to
  arrive was discarded. A plugin with its own "taking too long" UI tuned to the old ~2s rejection
  will now wait longer before its error path runs; `setRequestTimeout()` can restore a shorter
  deadline.
- `init()` still fails fast: the handshake rejects as soon as nothing answers it, so a plugin
  loaded outside CODAP finds out in seconds rather than after the full request timeout.
- A reply from CODAP carrying no value still fails the request immediately, as it did before, and is
  not left to wait out the new deadline. Keeping that took distinguishing it from iframe-phone's
  advisory timer, which reports itself the same way — with `undefined` — and differs only in a second
  argument the library passes for the timer alone. A `null` reply is treated the same way.
- `destroy()` now reports the connection as `closed`, so `getConnectionState()` is accurate after
  teardown and requests issued afterwards are refused rather than reaching a null connection.
  Calling `init()` again reconnects, as before.

### Added

- `codapInterface.getRequestTimeout()` and `codapInterface.setRequestTimeout(ms)`.
- `stats.countDiReqFailed`, the number of requests that failed, and `stats.countDiReqDeadlineExceeded`
  for the subset that ran out of time. `getStats()` previously reported no counter for either, while
  `countDiRplTimeout` counts iframe-phone's advisory probe — which fires for every request slower than
  2s and so is expected to be non-zero on a plugin doing bulk work. `countDiRplFail` now means only
  what its name says, a request CODAP answered and declined, rather than mixing those with failures.
  Every counter is documented in the published type declarations.

  The counters also reconcile now: `countDiReq` minus the three outcome counters is the number of
  requests still in flight. A batched request is answered with an array, which has no top-level
  `success`, so it was counted as a decline however it went — meaning every successful `init()`
  handshake reported one. It counts as the single request it was, successful only if every result in
  it succeeded.

### Fixed

- **Request failures inside the bundled helpers are reported rather than thrown.** `selectSelf`,
  `createCollectionFromAttribute` and `ensureUniqueCollectionName` read `.success` off the
  response, so a request that went unanswered previously surfaced as a `TypeError` — and, where the
  promise was discarded, an unhandled rejection. `selectSelf` now logs a warning, since it is
  fire-and-forget and has no caller waiting on an answer, and it no longer asks CODAP to select
  `component[undefined]` when the frame comes back without an id. The other two reject with a
  descriptive message: a lookup that gets no answer says nothing about whether the name is free or
  the collection exists, and that is the caller's to decide.
- A reply arriving after its request had already failed no longer marks the connection active or
  counts a success against it.
- `stats.timeDiFirstReq` was never set; each data-interactive request overwrote
  `stats.timeCodapFirstReq` instead.
