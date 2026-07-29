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

/** The callback iframe-phone would hold for the most recent request. */
function lastCallback(): (response: any) => void {
  return mockCall.mock.calls[mockCall.mock.calls.length - 1][1];
}

/** Resolves after pending microtasks flush, so promise settlement can be observed. */
function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
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

  it("does not settle when iframe-phone reports its advisory timeout", async () => {
    let settled = false;
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    request.then(() => (settled = true), () => (settled = true));

    // iframe-phone's 2s timer fires: callback invoked with undefined
    lastCallback()(undefined);
    await flush();

    expect(settled).toBe(false);
  });

  it("resolves with the real response when it arrives after the advisory timeout", async () => {
    const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
    const callback = lastCallback();

    callback(undefined);              // advisory timeout
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
    codapInterface.setRequestTimeout(60000);
  });

  it("rejects if no real reply ever arrives, so a dead CODAP cannot hang the caller forever",
    async () => {
      jest.useFakeTimers();
      const request = codapInterface.sendRequest({ action: "create", resource: "dataContext[x].item" });
      const rejection = expect(request).rejects.toMatch(/exceeded/);

      lastCallback()(undefined);        // advisory timeout — must not settle
      jest.advanceTimersByTime(60000);  // hard deadline elapses

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

  it("does not reject after the hard deadline once the request has resolved", async () => {
    jest.useFakeTimers();
    const request = codapInterface.sendRequest({ action: "get", resource: "dataContext[x]" });

    lastCallback()({ success: true });
    await expect(request).resolves.toEqual({ success: true });

    // advancing past the deadline must not produce an unhandled rejection
    expect(() => jest.advanceTimersByTime(120000)).not.toThrow();
  });
});
