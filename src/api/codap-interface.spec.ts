import { codapInterface } from "./codap-interface";

// iframe-phone invokes the callback passed to `call()` with `undefined` when its hard-coded 2s
// timer expires, but it does NOT cancel the request or forget the callback — when CODAP finally
// replies it invokes the same callback a second time with the real value. These tests capture
// that callback so both invocations can be simulated.
const mockCall = jest.fn();

jest.mock("iframe-phone", () => ({
  IframePhoneRpcEndpoint: jest.fn().mockImplementation(() => ({
    call: (message: any, callback: (response: any) => void) => mockCall(message, callback)
  }))
}));

/** Captured before any test mutates it, so these tests don't restate the library's default. */
const kDefaultTimeout = codapInterface.getRequestTimeout();

/** The callback iframe-phone would hold for the nth request, in call order. */
function callbackAt(index: number): (response: any) => void {
  return mockCall.mock.calls[index][1];
}

/** The callback iframe-phone would hold for the most recent request. */
function lastCallback(): (response: any) => void {
  return callbackAt(mockCall.mock.calls.length - 1);
}

/** Resolves after pending microtasks flush, so promise settlement can be observed. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** A module instance with untouched connection state and stats. */
async function freshInterface() {
  jest.resetModules();
  mockCall.mockClear();
  return (await import("./codap-interface")).codapInterface;
}

async function initInterface() {
  mockCall.mockClear();
  const initPromise = codapInterface.init({ name: "test", title: "test" } as any);
  // satisfy the [updateFrame, getFrame] handshake
  lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
  await initPromise;
  mockCall.mockClear();
}

describe("codapInterface.sendRequest", () => {
  beforeEach(async () => {
    jest.useRealTimers();
    await initInterface();
  });

  it("resolves with the real response when it arrives after the advisory timeout", async () => {
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    const callback = lastCallback();

    callback(undefined);              // advisory timeout — the request is still in flight
    await flush();
    callback({ success: true, values: { itemIDs: ["a", "b"] } });   // CODAP finally replies

    await expect(request).resolves.toEqual({ success: true, values: { itemIDs: ["a", "b"] } });
  });

  it("does not invoke the caller's callback with undefined on the advisory timeout", async () => {
    const callerCallback = jest.fn();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback);
    const callback = lastCallback();

    callback(undefined);
    await flush();
    expect(callerCallback).not.toHaveBeenCalled();

    callback({ success: true });
    await request;
    expect(callerCallback).toHaveBeenCalledTimes(1);
    expect(callerCallback).toHaveBeenCalledWith({ success: true }, expect.anything());
  });

  it("still resolves only once when the real reply arrives twice", async () => {
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" });
    const callback = lastCallback();

    callback({ success: true, values: 1 });
    callback({ success: true, values: 2 });

    await expect(request).resolves.toEqual({ success: true, values: 1 });
  });
});

describe("codapInterface.sendRequest hard timeout", () => {
  beforeEach(async () => {
    jest.useRealTimers();
    await initInterface();
  });

  afterEach(() => {
    jest.useRealTimers();
    codapInterface.setRequestTimeout(kDefaultTimeout);
  });

  it("rejects if no real reply ever arrives, so a dead CODAP cannot hang the caller forever",
    async () => {
      jest.useFakeTimers();
      const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
      const rejection = expect(request).rejects.toMatch(/exceeded/);

      lastCallback()(undefined);              // advisory timeout — must not settle
      jest.advanceTimersByTime(kDefaultTimeout);   // hard deadline elapses

      await rejection;
    });

  it("uses a configurable hard timeout", async () => {
    codapInterface.setRequestTimeout(5000);
    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    const rejection = expect(request).rejects.toMatch(/exceeded/);

    jest.advanceTimersByTime(5000);

    await rejection;
  });

  // setTimeout treats NaN and negative delays as 0, so an invalid timeout would otherwise make
  // every subsequent request reject immediately.
  it("falls back to the default when given an invalid timeout", () => {
    [NaN, -1, 0, Infinity].forEach(invalid => {
      codapInterface.setRequestTimeout(5000);
      codapInterface.setRequestTimeout(invalid);
      expect(codapInterface.getRequestTimeout()).toBe(kDefaultTimeout);
    });
  });

  // Above setTimeout's signed 32-bit ceiling the delay overflows and the timer fires immediately,
  // which is the same silent-immediate-failure the invalid-value guard exists to prevent.
  it("clamps a timeout above setTimeout's ceiling", () => {
    codapInterface.setRequestTimeout(2 ** 31);
    expect(codapInterface.getRequestTimeout()).toBe(2147483647);
  });

  it("reports the timeout the request was actually given, even if it changes afterwards",
    async () => {
      codapInterface.setRequestTimeout(5000);
      jest.useFakeTimers();
      const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" });
      const rejection = expect(request).rejects.toMatch(/exceeded 5000ms/);

      codapInterface.setRequestTimeout(30000);   // must not change this request's report
      jest.advanceTimersByTime(5000);

      await rejection;
    });

  it("clears the deadline once the request has resolved", async () => {
    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" });

    lastCallback()({ success: true });
    await expect(request).resolves.toEqual({ success: true });

    // the settle-once contract has to cancel the timer, not merely ignore it when it fires
    expect(jest.getTimerCount()).toBe(0);
  });
});

// Callers may pass a callback and discard the returned promise -- several helpers in this package
// do, e.g. codap-helper's ensureUniqueCollectionName wraps sendRequest in a `new Promise` with no
// reject path at all. For those callers the callback is the only signal that the request is over,
// so it has to fire on failures too, not just on success.
describe("codapInterface.sendRequest callback contract on failure", () => {
  afterEach(() => {
    jest.useRealTimers();
    codapInterface.setRequestTimeout(kDefaultTimeout);
  });

  it("invokes the callback when the request exceeds its deadline", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback);
    const rejection = expect(request).rejects.toMatch(/exceeded/);

    jest.advanceTimersByTime(kDefaultTimeout);
    await rejection;

    expect(callerCallback).toHaveBeenCalledTimes(1);
    expect(callerCallback).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it("invokes the callback when there is no connection", async () => {
    const fresh = await freshInterface();
    const callerCallback = jest.fn();

    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback))
      .rejects.toMatch(/non-existent/);

    expect(callerCallback).toHaveBeenCalledTimes(1);
    expect(callerCallback).toHaveBeenCalledWith(undefined, expect.anything());
  });
});

describe("codapInterface.init handshake", () => {
  // Ignoring the advisory timeout is right once a request is known to have reached CODAP, but the
  // handshake is precisely where "no reply" is evidence of "no CODAP" -- a plugin loaded outside
  // CODAP must not wait out the full request timeout to discover that.
  it("fails fast when nothing answers the handshake", async () => {
    const fresh = await freshInterface();

    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()(undefined);          // iframe-phone's 2s advisory timeout, nothing there

    await expect(initPromise).rejects.toMatch(/timed out/);
  });

  // The fast-fail belongs to the handshake request itself, not to a window of time: an ordinary
  // request issued while the handshake is still outstanding is a normal request, and killing it
  // at 2s would reintroduce exactly the failure this timeout handling exists to prevent.
  it("does not fail fast for other requests issued while the handshake is outstanding",
    async () => {
      const fresh = await freshInterface();

      fresh.init({ name: "test", title: "test" } as any).catch(() => undefined);
      const request = fresh.sendRequest({ action: "create", resource: "dataContext[x].item" });
      let settled = false;
      request.then(() => (settled = true), () => (settled = true));

      callbackAt(1)(undefined);   // the ordinary request's advisory timeout
      await flush();

      expect(settled).toBe(false);
    });

  it("does not fail fast once the connection is established", async () => {
    const fresh = await freshInterface();

    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;

    let settled = false;
    const request = fresh.sendRequest({ action: "get", resource: "dataContext[x]" });
    request.then(() => (settled = true), () => (settled = true));

    lastCallback()(undefined);
    await flush();

    expect(settled).toBe(false);
  });
});

describe("codapInterface.sendRequest without a connection", () => {
  // Before init() there is no connection to call, and nothing would ever settle the promise --
  // leaving the caller awaiting forever, which is the failure this timeout handling exists to
  // prevent.
  it("rejects rather than leaving the caller waiting forever", async () => {
    const fresh = await freshInterface();

    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }))
      .rejects.toMatch(/non-existent CODAP connection/);
  });
});

describe("codapInterface stats", () => {
  it("counts an advisory timeout without failing the request", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;

    const before = fresh.getStats().countDiRplTimeout;
    const request = fresh.sendRequest({ action: "get", resource: "dataContext[x]" });
    const callback = lastCallback();

    callback(undefined);
    await flush();
    expect(fresh.getStats().countDiRplTimeout).toBe(before + 1);

    callback({ success: true });
    await expect(request).resolves.toEqual({ success: true });
    expect(fresh.getStats().countDiRplSuccess).toBeGreaterThan(0);
  });

  it("records the time of the first data-interactive request", async () => {
    const fresh = await freshInterface();
    expect(fresh.getStats().timeDiFirstReq).toBeNull();

    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;

    expect(fresh.getStats().timeDiFirstReq).toBeInstanceOf(Date);
  });
});
