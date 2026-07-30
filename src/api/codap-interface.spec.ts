import type { IResult } from "./codap-helper";
import { codapInterface } from "./codap-interface";

// iframe-phone invokes the callback passed to `call()` with `undefined` when its hard-coded 2s
// timer expires, but it does NOT cancel the request or forget the callback — when CODAP finally
// replies it invokes the same callback a second time with the real value. These tests capture
// that callback so both invocations can be simulated.
//
// The two invocations are distinguishable, and these tests rely on it exactly as the code does:
// iframe-phone passes a second argument for the advisory timer only
// (`iframe-phone-rpc-endpoint.js`: `callback(undefined, new Error(...))` for the timer,
// `callback.call(undefined, message.value)` for the real reply). `advisoryTimeout` below is the
// only way these tests simulate the timer, so a bare `callback(undefined)` in a test means what it
// means in production: CODAP answered with no value.
const mockCall = jest.fn();

/**
 * The notification handler each constructed endpoint was given, in construction order. Recorded
 * here rather than read back off the constructor mock, because `jest.resetModules()` gives the
 * re-imported module a fresh mock: the constructor this file imported would then no longer be the
 * one the module under test constructed, and a test reading its calls would assert against a
 * different module instance than the one it exercised.
 */
const notificationHandlers: ((request: any, callback: (r: any) => void) => void)[] = [];

jest.mock("iframe-phone", () => ({
  IframePhoneRpcEndpoint: jest.fn().mockImplementation((handler: any) => {
    notificationHandlers.push(handler);
    return {
      call: (message: any, callback: (response: any, noReplyYet?: Error) => void) =>
              mockCall(message, callback)
    };
  })
}));

/** The notification handler of the most recently constructed endpoint. */
function lastNotificationHandler() {
  return notificationHandlers[notificationHandlers.length - 1];
}

/** Captured before any test mutates it, so these tests don't restate the library's default. */
const kDefaultTimeout = codapInterface.getRequestTimeout();

type PhoneCallback = (response: any, noReplyYet?: Error) => void;

/** The callback iframe-phone would hold for the nth request, in call order. */
function callbackAt(index: number): PhoneCallback {
  return mockCall.mock.calls[index][1];
}

/** The callback iframe-phone would hold for the most recent request. */
function lastCallback(): PhoneCallback {
  return callbackAt(mockCall.mock.calls.length - 1);
}

/** Simulates iframe-phone's advisory 2s timer firing, exactly as the library reports it. */
function advisoryTimeout(callback: PhoneCallback) {
  callback(undefined, new Error("IframePhone timed out waiting for reply"));
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

// The contract's central claim is that a callback receives `undefined` when a request fails, so a
// callback that cannot accept `undefined` is wrong and should say so at build time rather than throw
// a TypeError on a failure path in front of users. These assert that at the type level: if the
// parameter ever loosens back to `any`, the @ts-expect-error stops being an error and this file
// fails to compile.
describe("the callback type", () => {
  // Read off sendRequest itself rather than the exported alias, so this pins the signature a
  // consumer is actually held to.
  type Accepted = NonNullable<Parameters<typeof codapInterface.sendRequest>[1]>;

  it("rejects a callback that cannot receive a failure", () => {
    // @ts-expect-error a callback typed for the response alone cannot handle a failed request
    const cannotFail: Accepted = (result: IResult) => result.success;
    const canFail: Accepted = (result?: IResult) => result?.success;

    // never invoked: the assertions above are the test, and calling `cannotFail` with the
    // `undefined` it refuses to admit is precisely the TypeError the type exists to prevent
    expect([cannotFail, canFail].every(fn => typeof fn === "function")).toBe(true);
  });
});

describe("codapInterface.sendRequest", () => {
  beforeEach(async () => {
    jest.useRealTimers();
    await initInterface();
  });

  it("resolves with the real response when it arrives after the advisory timeout", async () => {
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    const callback = lastCallback();

    advisoryTimeout(callback);        // the request is still in flight
    await flush();
    callback({ success: true, values: { itemIDs: ["a", "b"] } });   // CODAP finally replies

    await expect(request).resolves.toEqual({ success: true, values: { itemIDs: ["a", "b"] } });
  });

  it("does not invoke the caller's callback with undefined on the advisory timeout", async () => {
    const callerCallback = jest.fn();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback);
    const callback = lastCallback();

    advisoryTimeout(callback);
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
      const rejection = expect(request).rejects.toThrow(/exceeded/);

      advisoryTimeout(lastCallback());        // advisory timeout — must not settle
      jest.advanceTimersByTime(kDefaultTimeout);   // hard deadline elapses

      await rejection;
    });

  it("uses a configurable hard timeout", async () => {
    codapInterface.setRequestTimeout(5000);
    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    const rejection = expect(request).rejects.toThrow(/exceeded/);

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
      const rejection = expect(request).rejects.toThrow(/exceeded 5000ms/);

      codapInterface.setRequestTimeout(30000);   // must not change this request's report
      jest.advanceTimersByTime(5000);

      await rejection;
    });

  // `connection.call` can throw synchronously -- an uncloneable value in the message makes
  // postMessage raise DataCloneError. Left to escape the executor it would reject the promise
  // without passing through settle(), which is the one path on which the callback contract could
  // still be false: the caller would get a rejection and no notification. It is also why the
  // deadline is armed after the call rather than before -- armed first, the timer would outlive the
  // throw and report a failure a minute after the caller had handled it.
  it("settles through the contract when the request throws synchronously", async () => {
    const callerCallback = jest.fn();
    mockCall.mockImplementationOnce(() => {
      throw new DOMException("value could not be cloned", "DataCloneError");
    });

    jest.useFakeTimers();
    await expect(codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" },
                                            callerCallback)).rejects.toThrow(/cloned/);

    expect(callerCallback).toHaveBeenCalledTimes(1);
    expect(callerCallback).toHaveBeenCalledWith(undefined, expect.anything());

    // no deadline was armed, so nothing can fire later against a request that has already settled
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(kDefaultTimeout);
    expect(callerCallback).toHaveBeenCalledTimes(1);
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

// Two failed review rounds turned on the same question -- is the contract true on *every* path? --
// answered each time by checking the paths someone had thought of. This enumerates them instead.
// Every way a request can settle gets one case, and each asserts all three parts of the contract
// together: how the promise settles, that the callback fires exactly once with the documented
// argument, and that no deadline is left behind to fire against a settled request.
describe("codapInterface.sendRequest settles every path through the contract", () => {
  afterEach(() => {
    jest.useRealTimers();
    codapInterface.setRequestTimeout(kDefaultTimeout);
  });

  /** Asserts the parts of the contract that hold no matter how a request settles. */
  function expectSettledOnce(callerCallback: jest.Mock, response: any) {
    expect(callerCallback).toHaveBeenCalledTimes(1);
    expect(callerCallback).toHaveBeenCalledWith(response, expect.anything());
    expect(jest.getTimerCount()).toBe(0);
  }

  it("CODAP answers: resolves with the response, callback gets it", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();
    const message = { action: "get", resource: "dataContext[x]" };

    jest.useFakeTimers();
    const request = codapInterface.sendRequest(message, callerCallback);
    lastCallback()({ success: true, values: { id: 1 } });

    await expect(request).resolves.toEqual({ success: true, values: { id: 1 } });
    expectSettledOnce(callerCallback, { success: true, values: { id: 1 } });
    // the documented second argument: "followed by the original request". Asserted here rather than
    // in every case, where expect.anything() keeps the failure being described the settling one.
    expect(callerCallback).toHaveBeenCalledWith(expect.anything(), message);
  });

  it("CODAP declines: still resolves, since {success:false} is an answer", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    lastCallback()({ success: false, values: { error: "no such thing" } });

    await expect(request).resolves.toEqual({ success: false, values: { error: "no such thing" } });
    expectSettledOnce(callerCallback, { success: false, values: { error: "no such thing" } });
  });

  // The distinction the whole design rests on: iframe-phone's probe is not an outcome, but a reply
  // of `undefined` from CODAP is -- and it used to be indistinguishable, so it waited out the full
  // deadline. There is no result to hand back, so it fails rather than resolving with `undefined`.
  it("CODAP answers with no value: rejects rather than resolving with undefined", async () => {
    jest.useRealTimers();
    await initInterface();
    const before = { ...codapInterface.getStats() };
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    lastCallback()(undefined);          // one argument: a real reply, with no value

    await expect(request).rejects.toThrow(/answered with no result/);
    expectSettledOnce(callerCallback, undefined);
    // a failure, not a decline: countDiRplFail is for a CODAP answer of {success: false}
    expect(codapInterface.getStats().countDiReqFailed).toBe(before.countDiReqFailed + 1);
    expect(codapInterface.getStats().countDiRplFail).toBe(before.countDiRplFail);
  });

  it("the deadline passes: rejects, and says so in the stats", async () => {
    jest.useRealTimers();
    await initInterface();
    const before = codapInterface.getStats().countDiReqDeadlineExceeded;
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    const rejection = expect(request).rejects.toThrow(/exceeded/);
    jest.advanceTimersByTime(kDefaultTimeout);
    await rejection;

    expectSettledOnce(callerCallback, undefined);
    expect(codapInterface.getStats().countDiReqDeadlineExceeded).toBe(before + 1);
  });

  it("the request throws on the way out: rejects with what was thrown", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();
    mockCall.mockImplementationOnce(() => {
      throw new DOMException("value could not be cloned", "DataCloneError");
    });

    jest.useFakeTimers();
    await expect(codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                            callerCallback)).rejects.toThrow(/cloned/);

    expectSettledOnce(callerCallback, undefined);
  });

  it("there is no connection: rejects without waiting", async () => {
    const fresh = await freshInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback))
      .rejects.toThrow(/non-existent/);

    expectSettledOnce(callerCallback, undefined);
  });

  it("the connection was destroyed: rejects without waiting", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;
    fresh.destroy();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }, callerCallback))
      .rejects.toThrow(/closed/);

    expectSettledOnce(callerCallback, undefined);
  });

  // A message can be structured-cloneable and still not JSON-serializable -- a cycle, or a BigInt --
  // so it is genuinely sent, and only describing it in a failure message fails. Building that
  // message unguarded threw while the request was being failed, which left it settled by nothing.
  it("fails a request whose message cannot be serialized for the error", async () => {
    jest.useRealTimers();
    await initInterface();
    const cyclic: any = { action: "create", resource: "dataContext[x].item" };
    cyclic.values = { self: cyclic };
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest(cyclic, callerCallback);
    const rejection = expect(request).rejects.toThrow(/exceeded/);
    jest.advanceTimersByTime(kDefaultTimeout);
    await rejection;

    expectSettledOnce(callerCallback, undefined);
  });

  // `.success` read off a null reply would throw inside iframe-phone's message listener, where
  // nothing settles the request -- so null is as empty an answer as undefined.
  it("treats a null reply as an answer carrying no result", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    lastCallback()(null);

    await expect(request).rejects.toThrow(/answered with no result/);
    expectSettledOnce(callerCallback, undefined);
  });

  // Not a settling path: the probe reports that nothing has settled yet, so the contract's
  // "exactly once" has to mean the callback stays silent here.
  it("the advisory probe is not an outcome: nothing settles, callback stays silent", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    let settled = false;
    request.then(() => (settled = true), () => (settled = true));

    advisoryTimeout(lastCallback());
    await flush();

    expect(settled).toBe(false);
    expect(callerCallback).not.toHaveBeenCalled();

    lastCallback()({ success: true });     // settle it so no deadline outlives the test
    await request;
  });

  // iframe-phone clears its pending callback as soon as it invokes it, so it will not deliver the
  // same reply twice. This exercises the settle-once guard directly rather than a scenario the
  // library can produce: settling once has to cover the callback, not just the promise.
  it("a duplicated reply notifies the callback only once", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    const callback = lastCallback();
    callback({ success: true, values: 1 });
    callback({ success: true, values: 2 });

    await expect(request).resolves.toEqual({ success: true, values: 1 });
    expectSettledOnce(callerCallback, { success: true, values: 1 });
  });

  // A reply can arrive after the deadline has already failed the request. It must not revive it,
  // report a success against it, or mark a connection the caller has given up on as live.
  it("a reply after the deadline changes nothing", async () => {
    jest.useRealTimers();
    await initInterface();
    const callerCallback = jest.fn();

    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               callerCallback);
    const callback = lastCallback();
    const rejection = expect(request).rejects.toThrow(/exceeded/);
    jest.advanceTimersByTime(kDefaultTimeout);
    await rejection;

    const after = { ...codapInterface.getStats() };
    callback({ success: true });

    expect(codapInterface.getStats()).toEqual(after);
    expectSettledOnce(callerCallback, undefined);
  });
});

// destroy() reports the state it puts the connection in, so getConnectionState() is honest and new
// requests are refused. That makes init() responsible for clearing it: without the reset, the
// handshake below would itself be refused and the connection could never be reestablished.
// init() is the entry point every plugin calls first, and it does not go through sendRequest's
// contract, so it needs its own coverage of the same questions: does it always settle, does it
// report failure, and does it leave the plugin able to proceed either way.
describe("codapInterface.init", () => {
  it("refuses later requests instead of letting each wait out the deadline", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    advisoryTimeout(lastCallback());
    await expect(initPromise).rejects.toThrow(/timed out/);

    expect(fresh.getConnectionState()).toBe("closed");
    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }))
      .rejects.toThrow(/closed/);
  });

  it("rejects with an Error, like every other failure", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    advisoryTimeout(lastCallback());

    await expect(initPromise).rejects.toBeInstanceOf(Error);
  });

  it("reports the failure to init's callback, which otherwise only hears about success", async () => {
    const fresh = await freshInterface();
    const initCallback = jest.fn();
    const initPromise = fresh.init({ name: "test", title: "test" } as any, initCallback);
    advisoryTimeout(lastCallback());
    await expect(initPromise).rejects.toThrow(/timed out/);

    expect(initCallback).toHaveBeenCalledTimes(1);
    expect(initCallback).toHaveBeenCalledWith(undefined);
  });

  // The handshake's own callbacks run after it settles, so what they throw is the caller's bug and
  // not a failure to connect. Invoked before `resolve`, a throwing stateHandler would leave init()
  // unsettled forever, with the exception discarded into a promise nothing observes.
  it("settles even when the caller's stateHandler throws", async () => {
    const fresh = await freshInterface();
    const scheduled: Array<() => void> = [];
    const spy = jest.spyOn(window, "queueMicrotask")
                    .mockImplementation((thunk: () => void) => { scheduled.push(thunk); });
    const boom = new Error("stateHandler bug");

    const initPromise = fresh.init({ name: "test", title: "test",
                                     stateHandler: () => { throw boom; } } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: { a: 1 } } }]);

    await expect(initPromise).resolves.toEqual({ a: 1 });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toThrow(boom);
    spy.mockRestore();
  });

  it("can be retried, so a plugin is not stranded by one failed handshake", async () => {
    const fresh = await freshInterface();
    const failed = fresh.init({ name: "test", title: "test" } as any);
    advisoryTimeout(lastCallback());
    await expect(failed).rejects.toThrow(/timed out/);

    const retry = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await expect(retry).resolves.toBeDefined();
  });
});

describe("codapInterface.destroy", () => {
  it("reports the connection as closed", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;
    expect(fresh.getConnectionState()).toBe("active");

    fresh.destroy();

    expect(fresh.getConnectionState()).toBe("closed");
  });

  // destroy() does not unsubscribe from iframe-phone, so CODAP can still deliver a notification
  // afterwards. Handling it must not reopen a connection the caller has closed.
  it("stays closed when a notification arrives after teardown", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;
    fresh.destroy();

    // the handler this instance's endpoint was constructed with, invoked as CODAP would
    lastNotificationHandler()({ action: "notify", resource: "documentChangeNotice", values: {} },
                              () => undefined);

    expect(fresh.getConnectionState()).toBe("closed");
    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }))
      .rejects.toThrow(/closed/);
  });

  it("can be followed by init(), so a plugin can reconnect after teardown", async () => {
    const fresh = await freshInterface();
    const firstInit = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await firstInit;

    fresh.destroy();

    const secondInit = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await expect(secondInit).resolves.toBeDefined();

    // and requests work again, rather than being refused by the state destroy() left behind
    const request = fresh.sendRequest({ action: "get", resource: "dataContext[x]" });
    lastCallback()({ success: true });
    await expect(request).resolves.toEqual({ success: true });
  });
});

// A throw from the caller's callback is a consumer bug, not a failure of the request -- which has
// already settled by then. It must not escape into the stack that invoked the callback (iframe-
// phone's listener, the deadline timer, this executor), so it is rethrown on a fresh task, where it
// stays an uncaught error that window.onerror and error reporters can see. These tests capture what
// is scheduled rather than letting it throw, which would fail the suite it is meant to be reported
// through.
describe("codapInterface.sendRequest callback errors", () => {
  let scheduled: Array<() => void>;
  let queueMicrotaskSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.useRealTimers();
    await initInterface();
    scheduled = [];
    queueMicrotaskSpy = jest.spyOn(window, "queueMicrotask")
        .mockImplementation((thunk: () => void) => { scheduled.push(thunk); });
  });

  // restore only this spy: jest.restoreAllMocks() would also reset the iframe-phone module mock
  afterEach(() => {
    queueMicrotaskSpy.mockRestore();
  });

  it("rethrows what a callback throws, without failing the request", async () => {
    const boom = new Error("callback bug");
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               () => { throw boom; });

    lastCallback()({ success: true });

    await expect(request).resolves.toEqual({ success: true });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toThrow(boom);
  });

  // An async callback turns its throw into a rejected return value, which a try/catch around the
  // call never sees.
  it("rethrows what an async callback throws", async () => {
    const boom = new Error("async callback bug");
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" },
                                               async () => { throw boom; });

    lastCallback()({ success: true });

    await expect(request).resolves.toEqual({ success: true });
    await flush();
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toThrow(boom);
  });

  // Nothing ever calls back on this path, so the callback runs on the executor's own stack -- where
  // a throw would be swallowed by the Promise machinery, the request having already rejected.
  it("rethrows a callback throw on the no-connection path", async () => {
    const fresh = await freshInterface();
    const boom = new Error("callback bug");

    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" },
                                   () => { throw boom; })).rejects.toThrow(/non-existent/);

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toThrow(boom);
  });
});

describe("codapInterface.init handshake", () => {
  // Ignoring the advisory timeout is right once a request is known to have reached CODAP, but the
  // handshake is precisely where "no reply" is evidence of "no CODAP" -- a plugin loaded outside
  // CODAP must not wait out the full request timeout to discover that.
  it("fails fast when nothing answers the handshake", async () => {
    const fresh = await freshInterface();

    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    advisoryTimeout(lastCallback());    // iframe-phone's 2s advisory timeout, nothing there

    await expect(initPromise).rejects.toThrow(/timed out/);
  });

  // The fast-fail belongs to the handshake request itself, not to a window of time: an ordinary
  // request issued while the handshake is still outstanding is a normal request, and killing it
  // at 2s would reintroduce exactly the failure this timeout handling exists to prevent.
  it("does not fail fast for other requests issued while the handshake is outstanding",
    async () => {
      const fresh = await freshInterface();

      const initPromise = fresh.init({ name: "test", title: "test" } as any);
      const request = fresh.sendRequest({ action: "create", resource: "dataContext[x].item" });
      let settled = false;
      request.then(() => (settled = true), () => (settled = true));

      advisoryTimeout(callbackAt(1));   // the ordinary request's advisory timeout
      await flush();

      expect(settled).toBe(false);

      // settle both so neither leaves its deadline timer running past the test
      callbackAt(0)([{ success: true }, { success: true, values: { savedState: {} } }]);
      callbackAt(1)({ success: true });
      await Promise.all([initPromise, request]);
    });

  it("does not fail fast once the connection is established", async () => {
    const fresh = await freshInterface();

    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;

    let settled = false;
    const request = fresh.sendRequest({ action: "get", resource: "dataContext[x]" });
    request.then(() => (settled = true), () => (settled = true));

    const callback = lastCallback();
    advisoryTimeout(callback);
    await flush();

    expect(settled).toBe(false);

    // settle it so its deadline timer doesn't outlive the test
    callback({ success: true });
    await request;
  });
});

describe("codapInterface.sendRequest without a connection", () => {
  // Before init() there is no connection to call, and nothing would ever settle the promise --
  // leaving the caller awaiting forever, which is the failure this timeout handling exists to
  // prevent.
  it("rejects rather than leaving the caller waiting forever", async () => {
    const fresh = await freshInterface();

    await expect(fresh.sendRequest({ action: "get", resource: "dataContext[x]" }))
      .rejects.toThrow(/non-existent CODAP connection/);
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

    advisoryTimeout(callback);
    await flush();
    expect(fresh.getStats().countDiRplTimeout).toBe(before + 1);

    callback({ success: true });
    await expect(request).resolves.toEqual({ success: true });
    expect(fresh.getStats().countDiRplSuccess).toBeGreaterThan(0);
  });

  // A batched request is answered with an array, which has no top-level `success` to read, so every
  // successful init() handshake used to be counted a decline -- misleading exactly the person reading
  // getStats() to find out why a plugin is misbehaving.
  it("counts a batched reply as the one request it was", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: true, values: { savedState: {} } }]);
    await initPromise;

    expect(fresh.getStats().countDiRplSuccess).toBe(1);
    expect(fresh.getStats().countDiRplFail).toBe(0);
    expect(fresh.getStats().countDiReq).toBe(1);
  });

  it("counts a batched reply as a decline when any part of it failed", async () => {
    const fresh = await freshInterface();
    const initPromise = fresh.init({ name: "test", title: "test" } as any);
    lastCallback()([{ success: true }, { success: false, values: { error: "no frame" } }]);
    await expect(initPromise).rejects.toThrow(/no frame/);

    expect(fresh.getStats().countDiRplSuccess).toBe(0);
    expect(fresh.getStats().countDiRplFail).toBe(1);
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
