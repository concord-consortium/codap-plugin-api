import { createCollectionFromAttribute, selectSelf } from "./codap-helper";
import { codapInterface } from "./codap-interface";

jest.mock("./codap-interface", () => ({
  codapInterface: { sendRequest: jest.fn() }
}));

const mockSendRequest = codapInterface.sendRequest as jest.Mock;

const attr = { name: "Height" };

/** Lets queued promise callbacks run, so a fire-and-forget helper's reporting can be observed. */
function flushMicrotasks() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** The requests issued so far, in call order. */
function requests() {
  return mockSendRequest.mock.calls.map(call => call[0]);
}

// createCollectionFromAttribute walks three requests -- look up the collection, create it, move the
// attribute into it -- and each step decides what the next one does. These answer them by action so
// a test can fail one step without restating the others.
//
// An action with no stubbed answer rejects rather than resolving `undefined`: sendRequest never
// resolves with nothing, so a mock that did would let a test pass against a shape production cannot
// produce. Rejecting also makes an unstubbed step visible instead of silently falling through.
function respond(answers: { get?: any, create?: any, update?: any }) {
  mockSendRequest.mockImplementation((message: any) => {
    const action = message.action as keyof typeof answers;
    if (!(action in answers)) {
      return Promise.reject(new Error(`no stubbed answer for "${action}"`));
    }
    const answer = answers[action];
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
}

describe("createCollectionFromAttribute", () => {
  beforeEach(() => {
    mockSendRequest.mockReset();
  });

  // The caller asked for the attribute to end up in its own collection; the move is the step that
  // makes that true, so its result is the one the caller needs.
  it("resolves with the result of moving the attribute", async () => {
    respond({
      get: { success: false },                       // no collection by that name yet
      create: { success: true, values: { id: 7 } },
      update: { success: true, values: { moved: true } }
    });

    await expect(createCollectionFromAttribute("ctx", "Cases", attr, "root"))
      .resolves.toEqual({ success: true, values: { moved: true } });

    expect(requests().map(r => r.action)).toEqual(["get", "create", "update"]);
    expect(requests()[1].values).toEqual({ name: "Height", title: "Height", parent: "_root_" });
  });

  // Before this contract the promise resolved on the lookup reply, so a caller was told a
  // reorganization that never happened had succeeded.
  it("resolves with CODAP's refusal when the collection cannot be created", async () => {
    respond({
      get: { success: false },
      create: { success: false, values: { error: "name in use" } }
    });

    await expect(createCollectionFromAttribute("ctx", "Cases", attr, "root"))
      .resolves.toEqual({ success: false, values: { error: "name in use" } });

    // with no collection to move it to, the attribute must be left where it is
    expect(requests().map(r => r.action)).toEqual(["get", "create"]);
  });

  it("rejects when a request goes unanswered", async () => {
    respond({ get: new Error("sendRequest: CODAP request exceeded 60000ms") });

    await expect(createCollectionFromAttribute("ctx", "Cases", attr, "root"))
      .rejects.toThrow(/exceeded/);
  });

  // Reading `values.attrs.length` on a lookup that succeeded without an attribute list threw a
  // TypeError, and it threw inside an async callback where nothing could observe it. Absent `attrs`
  // is not evidence of a single-attribute collection, so the name-search branch is not taken and the
  // attribute's own name is used.
  it("does not read a missing attribute list as a single-attribute collection", async () => {
    respond({
      get: { success: true, values: {} },
      create: { success: true },
      update: { success: true }
    });

    await expect(createCollectionFromAttribute("ctx", "Cases", attr, "root"))
      .resolves.toEqual({ success: true });
    // one lookup only: no search for a unique name, and the collection takes the attribute's name
    expect(requests().filter(r => r.action === "get")).toHaveLength(1);
    expect(requests().find(r => r.action === "create")?.values)
      .toEqual({ name: "Height", title: "Height", parent: "_root_" });
  });

  // The candidate range is part of the behaviour, not an implementation detail: an off-by-one in the
  // runaway-loop guard makes the helper report no name available while one still is. The suffix
  // range is `Height` (no suffix) through `Height100`, so the last candidate has to be tried.
  it("tries every candidate name through the hundredth suffix", async () => {
    let asked = 0;
    mockSendRequest.mockImplementation((message: any) => {
      if (message.action !== "get") { return Promise.resolve({ success: true }); }
      asked++;
      // every name is taken except the last candidate
      const taken = message.resource !== "dataContext[ctx].collection[Height100]";
      return Promise.resolve({ success: taken });
    });

    // attr.name === oldCollectionName takes the branch that searches for a unique name
    const result = await createCollectionFromAttribute("ctx", "Height", attr, "root");

    expect(result.success).toBe(true);
    // 1 existence check for the attribute's own collection, then Height, Height1 ... Height100
    expect(asked).toBe(1 + 101);
    expect(requests().find(r => r.action === "create")?.values)
      .toEqual({ name: "Height100", title: "Height100", parent: "_root_" });
  });

  // The lookups ensureUniqueCollectionName issues all report the name taken, so it runs out of
  // candidates. Nothing was refused by CODAP, but the caller still needs a failure it can read.
  it("reports a failure when no unused collection name is available", async () => {
    // `attr.name === oldCollectionName` takes the rename branch without needing an attribute list
    respond({ get: { success: true, values: { attrs: [attr] } } });

    const result = await createCollectionFromAttribute("ctx", "Height", attr, "root");

    expect(result.success).toBe(false);
    expect(result.values.error).toMatch(/no unused collection name/);
    // it gave up rather than creating a collection under a name it hadn't checked
    expect(requests().some(r => r.action === "create")).toBe(false);
  });
});

// selectSelf is fire-and-forget: it discards both promises, so its callbacks are the only place an
// outcome can be reported, and a rejection with nothing attached would surface as an unhandled
// rejection. Both requests therefore carry a callback and a .catch.
describe("selectSelf", () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    mockSendRequest.mockReset();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  /** Invokes the callback each request was given, as codapInterface does on a reply. */
  function answer(...replies: any[]) {
    mockSendRequest.mock.calls.forEach((call, i) => call[1]?.(replies[i]));
  }

  it("selects the component the frame reports", async () => {
    mockSendRequest.mockResolvedValue(undefined);

    selectSelf();
    answer({ success: true, values: { id: 42 } });
    await flushMicrotasks();

    expect(requests()[1]).toEqual({
      action: "notify", resource: "component[42]", values: { request: "select" }
    });
    expect(warn).not.toHaveBeenCalled();
  });

  // The frame lookup reported only absence, so a CODAP answer of {success: false} left selectSelf
  // doing nothing and saying nothing.
  it("reports a frame lookup CODAP declined", async () => {
    mockSendRequest.mockResolvedValue(undefined);

    selectSelf();
    answer({ success: false });
    await flushMicrotasks();

    expect(requests()).toHaveLength(1);          // nothing to select, so no second request
    expect(warn).toHaveBeenCalledWith("selectSelf failed", "");
  });

  // Without an id the resource would read `component[undefined]`, asking CODAP to select something
  // that cannot exist.
  it("does not select a component when the frame has no id", async () => {
    mockSendRequest.mockResolvedValue(undefined);

    selectSelf();
    answer({ success: true, values: {} });
    await flushMicrotasks();

    expect(requests()).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith("selectSelf failed", "");
  });

  // An unanswered request invokes the callback with undefined *and* rejects. Reporting from both
  // would log one failure twice, so absence is left to the .catch.
  it("reports an unanswered request once", async () => {
    mockSendRequest.mockRejectedValue(new Error("no connection"));

    selectSelf();
    answer(undefined);
    await flushMicrotasks();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("selectSelf failed", new Error("no connection"));
  });
});
