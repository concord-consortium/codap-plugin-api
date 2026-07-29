import { createCollectionFromAttribute } from "./codap-helper";
import { codapInterface } from "./codap-interface";

jest.mock("./codap-interface", () => ({
  codapInterface: { sendRequest: jest.fn() }
}));

const mockSendRequest = codapInterface.sendRequest as jest.Mock;

const attr = { name: "Height" };

/** The requests issued so far, in call order. */
function requests() {
  return mockSendRequest.mock.calls.map(call => call[0]);
}

// createCollectionFromAttribute walks three requests -- look up the collection, create it, move the
// attribute into it -- and each step decides what the next one does. These answer them by action so
// a test can fail one step without restating the others.
function respond(answers: { get?: any, create?: any, update?: any }) {
  mockSendRequest.mockImplementation((message: any) => {
    const answer = answers[message.action as keyof typeof answers];
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

  // A lookup that succeeds without an attribute list used to throw a TypeError reading
  // `values.attrs.length` out of an async callback, where nothing could observe it.
  it("treats a successful lookup with no attribute list as a collection to leave alone", async () => {
    respond({
      get: { success: true, values: {} },
      create: { success: true },
      update: { success: true }
    });

    await expect(createCollectionFromAttribute("ctx", "Cases", attr, "root"))
      .resolves.toEqual({ success: true });
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
