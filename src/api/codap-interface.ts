// ==========================================================================
//
//  Author:   jsandoe
//
//  Copyright (c) 2016 by The Concord Consortium, Inc. All rights reserved.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.
// ==========================================================================

/**
 * This class is intended to provide an abstraction layer for managing
 * a CODAP Data Interactive's connection with CODAP. It is not required. It is
 * certainly possible for a data interactive, for example, to use only the
 * iFramePhone library, which manages the connection at a lower level.
 *
 * This object provides the following services:
 *   1. Initiates the iFramePhone interaction with CODAP.
 *   2. Provides information on the status of the connection.
 *   3. Provides a sendRequest method. It accepts a callback or returns a Promise
 *      for handling the results from CODAP.
 *   4. Provides a subscriber interface to receive selected notifications from
 *      CODAP.
 *   5. Provides automatic handling of Data Interactive State. Prior to saving
 *      a document CODAP requests state from the Data Interactive, where state
 *      is an arbitrary serializable object containing whatever the data
 *      interactive needs to retain. It returns this state when the document
 *      is reopened.
 *   6. Provides a utility to parse a resource selector into its component parts.
 *
 * @type {Object}
 *
 */

import { IframePhoneRpcEndpoint } from "iframe-phone";
// type-only, so the cycle with codap-helper (which imports codapInterface from here) is erased
import type { IResult } from "./codap-helper";

/**
 * The CODAP Connection
 * @param {iframePhone.IframePhoneRpcEndpoint}
 *
 * The callback signature spells out both arguments iframe-phone passes. It invokes the callback
 * with the reply alone when CODAP answers, and with `(undefined, Error)` when its own advisory 2s
 * timer expires — the second argument is the only thing distinguishing that probe from CODAP
 * answering with no value, so an annotation taking one argument silently discards the distinction.
 */
let connection: {
  call: (message: any, callback: (response: any, noReplyYet?: Error) => void) => void;
} | null = null;

let connectionState = "preinit";

/**
 * How long to wait for a CODAP response before giving up on a request.
 *
 * iframe-phone imposes its own hard-coded 2s deadline on every RPC, but that timer is a liveness
 * probe rather than a completion deadline: it neither cancels the request nor forgets the callback,
 * and it still delivers the real reply to that same callback once CODAP finishes. A request that
 * legitimately takes longer than 2s — creating several thousand items, say — is therefore reported
 * as failed while the result that is about to arrive is discarded. We wait for the real reply
 * instead, bounded by this much longer deadline so that a CODAP which never replies at all (page
 * closed, iframe removed) still can't leave callers awaiting forever.
 */
const kDefaultRequestTimeout = 60000;
/**
 * setTimeout stores its delay in a signed 32-bit int, so a larger delay overflows and the timer
 * fires immediately.
 */
const kMaxRequestTimeout = 2 ** 31 - 1;
let requestTimeout = kDefaultRequestTimeout;

const stats = {
  /** How many requests were sent to CODAP. */
  countDiReq: 0,
  /** How many requests CODAP answered with `{success: true}`. */
  countDiRplSuccess: 0,
  /**
   * How many requests CODAP answered with `{success: false}` — that is, answered and declined.
   * These are outcomes, not failures: the request's promise resolves with the response. For
   * requests that failed, see `countDiReqFailed`.
   */
  countDiRplFail: 0,
  /**
   * How many requests failed, and so rejected: no connection to send on, no answer within the
   * deadline, an answer carrying no result, or the send itself throwing.
   *
   * `countDiReq - countDiRplSuccess - countDiRplFail - countDiReqFailed` is the number still in
   * flight. `countDiReqDeadlineExceeded` counts the subset that ran out of time.
   */
  countDiReqFailed: 0,
  /**
   * How many times iframe-phone's advisory 2s timer has reported that no reply has arrived yet.
   *
   * This counts probes, not failures. A request slower than 2s that goes on to succeed normally
   * increments it, so on a plugin doing bulk work a high count is expected and says nothing is
   * wrong. For requests that actually ran out of time, see `countDiReqDeadlineExceeded`.
   */
  countDiRplTimeout: 0,
  /**
   * How many requests were rejected for exceeding their deadline. See `setRequestTimeout`. A subset
   * of `countDiReqFailed`.
   */
  countDiReqDeadlineExceeded: 0,
  countCodapReq: 0,
  countCodapUnhandledReq: 0,
  countCodapRplSuccess: 0,
  countCodapRplFail: 0,
  timeDiFirstReq: (null as Date | null),
  timeDiLastReq: (null as Date | null),
  timeCodapFirstReq: (null as Date | null),
  timeCodapLastReq: (null as Date | null)
};

export interface IConfig {
  stateHandler?: (arg0: any) => void;
  customInteractiveStateHandler?: boolean;
  name?: any;
  title?: any;
  version?: any;
  dimensions?: any;
  preventBringToFront?: any;
  preventDataContextReorg?: any;
}

let config: IConfig | null = null;

/**
 * A serializable object shared with CODAP. This is saved as a part of the
 * CODAP document. It is intended for the data interactive's use to store
 * any information it may need to reestablish itself when a CODAP document
 * is saved and restored.
 *
 * This object will be initially empty. It will be updated during the process
 * initiated by the init method if CODAP was started from a previously saved
 * document.
 */

export interface ClientNotification {
  action: string;
  resource: string;
  values: any;
}
export type ClientHandler = (notification: ClientNotification) => void;

/**
 * What `sendRequest` passes a callback: CODAP's response, or `undefined` if the request failed.
 *
 * The `undefined` is the point of the type. A callback declared to take `IResult` alone does not
 * satisfy it, and will not compile — which is the intent, because such a callback throws a
 * `TypeError` the first time a request fails, on a path a plugin may not exercise until it is in
 * front of users.
 *
 * A batched request — an array of requests — is answered with an array of results. That does not fit
 * here, so batch through the returned promise rather than a callback.
 */
export type RequestCallback = (response?: IResult, request?: any) => void;

let interactiveState = {};

/**
 * A list of subscribers to messages from CODAP
 * @param {[{actionSpec: {RegExp}, resourceSpec: {RegExp}, handler: {function}}]}
 */
const notificationSubscribers: { actionSpec: string; resourceSpec: any; operation: any; handler: any; }[] = [];

/** Whether init() has already registered its default interactiveState handler. */
let interactiveStateHandlerRegistered = false;

function matchResource(resourceName: any, resourceSpec: string) {
  return resourceSpec === "*" || resourceName === resourceSpec;
}

function notificationHandler (request: { action: any; resource: any; values: any; }, callback: (arg0: { success: boolean; }) => void) {
  const action = request.action;
  const resource = request.resource;
  let requestValues = request.values;
  let returnMessage = {success: true};

  markConnectionActive();
  stats.countCodapReq += 1;
  stats.timeCodapLastReq = new Date();
  if (!stats.timeCodapFirstReq) {
    stats.timeCodapFirstReq = stats.timeCodapLastReq;
  }

  if (action === "notify" && !Array.isArray(requestValues)) {
    requestValues = [requestValues];
  }

  let handled = false;
  let success = true;

  if ((action === "get") || (action === "update")) {
    // get assumes only one subscriber because it expects only one response.
    notificationSubscribers.some(function (subscription) {
      let result = false;
      try {
        if ((subscription.actionSpec === action) &&
            matchResource(resource, subscription.resourceSpec)) {
          const rtn = subscription.handler(request);
          if (rtn?.success) { stats.countCodapRplSuccess++; } else{ stats.countCodapRplFail++; }
          returnMessage = rtn;
          result = true;
        }
      } catch (ex) {
        // console.log('DI Plugin notification handler exception: ' + ex);
        result = true;
      }
      return result;
    });
    if (!handled) {
      stats.countCodapUnhandledReq++;
    }
  } else if (action === "notify") {
    requestValues.forEach(function (value: { operation: any; }) {
      notificationSubscribers.forEach(function (subscription) {
        // pass this notification to matching subscriptions
        handled = false;
        if ((subscription.actionSpec === action) && matchResource(resource,
                subscription.resourceSpec) && (!subscription.operation ||
            (subscription.operation === value.operation) && subscription.handler)) {
          const rtn = subscription.handler(
              {action, resource, values: value});
          if (rtn?.success) { stats.countCodapRplSuccess++; } else{ stats.countCodapRplFail++; }
          success = (success && (rtn ? rtn.success : false));
          handled = true;
        }
      });
      if (!handled) {
        stats.countCodapUnhandledReq++;
      }
    });
  } else {
    // console.log("DI Plugin received unknown message: " + JSON.stringify(request));
  }
  return callback(returnMessage);
}

interface IRequestOptions {
  /**
   * Invoked with the response on success and with `undefined` on failure. See `sendRequest`, whose
   * JSDoc carries this contract for consumers — this interface is module-private and never reaches
   * the published type declarations.
   */
  callback?: RequestCallback
  /**
   * Reject as soon as iframe-phone reports no reply, instead of waiting out `requestTimeout`.
   *
   * Set only for the handshake in `init()`, and a deliberate trade rather than a safe inference.
   * Silence at 2s does not prove nothing is listening: iframe-phone buffers into `postMessageQueue`
   * until the parent answers its repeated "hello", while the 2s probe is armed when `call` is
   * invoked — so a parent slow to complete that exchange looks the same as no parent at all. We
   * accept that, because the alternative is a plugin loaded outside CODAP hanging for the full
   * request timeout before it can say so, and because a plugin that does load in CODAP can retry.
   *
   * This is a property of the individual request rather than of the connection state, so an
   * ordinary request issued while the handshake is outstanding is still treated as an ordinary
   * request.
   */
  failFastWithoutReply?: boolean
}

/**
 * Reports an exception thrown by a caller's request callback.
 *
 * By the time the callback runs its request has already settled, so what it throws is not the
 * request's failure and must not escape into the stack that invoked it — iframe-phone's message
 * listener (where a throw skips its own bookkeeping), the deadline timer, or the promise executor
 * (which discards it silently, since the promise has settled). Rethrowing from a microtask keeps it
 * out of all three, since those stacks have unwound by the time it runs, while leaving it an
 * uncaught error that `window.onerror` and error reporters still see: logging it instead would hide
 * a consumer's bug from the monitoring they rely on.
 */
function reportCallbackError (error: unknown) {
  queueMicrotask(() => { throw error; });
}

/**
 * Renders a request for inclusion in an error message.
 *
 * `JSON.stringify` throws on a cyclic value and on a BigInt, both of which `postMessage` accepts —
 * so a request carrying either is genuinely sent, and the only thing that fails is describing it.
 * Building a failure message from `JSON.stringify` unguarded would therefore throw while a request
 * was being failed, leaving it settled by nothing at all.
 */
function describeMessage (message: unknown) {
  try {
    return JSON.stringify(message) ?? String(message);
  } catch {
    return "[message could not be serialized]";
  }
}

/**
 * Invokes one of `init()`'s optional callbacks, keeping what it throws out of the handshake.
 *
 * Same reasoning as `reportCallbackError`, which it delegates to: by the time these run the
 * handshake has settled, so a throw from one is the caller's bug rather than a failure to connect,
 * and it must not escape into the promise chain the handshake is resolved from — where nothing
 * observes it, so it would be invisible.
 */
function notifyInitCallback (callback: ((state: any) => void) | undefined, state: any) {
  if (!callback) { return; }
  try {
    const result = callback(state) as unknown;
    if (result && typeof (result as PromiseLike<unknown>).then === "function") {
      (result as PromiseLike<unknown>).then(undefined, reportCallbackError);
    }
  } catch (error) {
    reportCallbackError(error);
  }
}

/**
 * Records that CODAP is talking to us — unless the caller has torn the connection down, in which
 * case traffic still arriving must not reopen a connection they closed. `destroy()` does not
 * unsubscribe from iframe-phone, and a reply to a request that was already in flight can arrive
 * after it, so both this module's inbound paths have to check.
 */
function markConnectionActive () {
  if (connection) {
    connectionState = "active";
  }
}

/**
 * Issues a request to CODAP and returns a promise of the response.
 */
function issueRequest (message: any, options: IRequestOptions = {}) {
  const { callback, failFastWithoutReply = false } = options;
  return new Promise(function (resolve, reject) {
    let isSettled = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

    // A request settles exactly once, and the caller's callback is notified on every outcome:
    // with the response on success, and with `undefined` on failure. Callers may pass a callback
    // and discard the promise — several helpers in this package do — so for them the callback is
    // the only signal that the request is over.
    //
    // Success and failure go through separate entry points rather than one function with an
    // optional callback argument: what the callback receives is then fixed by which one is called,
    // so a path added later cannot resolve the promise correctly while notifying its callback with
    // `undefined`.
    function settle (settleFn: (value?: any) => void, value: any, callbackResponse?: IResult) {
      if (isSettled) { return; }
      isSettled = true;
      if (timeoutTimer !== undefined) { clearTimeout(timeoutTimer); }
      settleFn(value);
      if (callback) {
        // A callback written for the success case may not expect `undefined`. Whatever it throws
        // must not escape into iframe-phone's listener, the deadline timer, or this executor —
        // see reportCallbackError.
        try {
          // An async callback reports a throw as a rejected return value, which the catch can't see.
          // `RequestCallback` returns `void`, but TypeScript lets a callback in that position return
          // a value anyway, so an async one arrives here as a promise and has to be observed.
          const callbackResult = callback(callbackResponse, message) as unknown;
          if (callbackResult && typeof (callbackResult as PromiseLike<unknown>).then === "function") {
            (callbackResult as PromiseLike<unknown>).then(undefined, reportCallbackError);
          }
        } catch (error) {
          reportCallbackError(error);
        }
      }
    }

    function settleSuccess (response: IResult) {
      settle(resolve, response, response);
    }

    /**
     * Fails the request. Rejects with an Error — never a string — so a consumer's `.catch` gets a
     * stack, and so every rejection from this module has one shape to handle. Takes `unknown` so
     * that a caught exception can be passed straight through without each call site repeating the
     * same normalization.
     *
     * Every failure goes through here, which is what lets `countDiReqFailed` account for all of
     * them without each path remembering to count itself.
     */
    function settleFailure (reason: unknown) {
      if (!isSettled) { stats.countDiReqFailed++; }
      settle(reject, reason instanceof Error ? reason : new Error(String(reason)));
    }

    /**
     * @param response CODAP's reply, or `undefined` if there is none yet.
     * @param noReplyYet present only when iframe-phone is reporting that its own advisory 2s timer
     *    expired. That is a liveness probe, not a completion deadline: the request is still in
     *    flight and the real reply will arrive at this same callback. A genuinely empty reply from
     *    CODAP arrives as `undefined` with this argument absent, which is a real answer and settles
     *    the request at once. See `connection`'s type for why this argument has to be declared.
     */
    function handleResponse (response: IResult | undefined | null, noReplyYet?: Error) {
      // A reply can still arrive after the deadline rejected the request. Returning early keeps it
      // from marking the connection active or counting a success against a request the caller has
      // already been told failed.
      if (isSettled) { return; }

      // `null` is grouped with `undefined` deliberately: it is just as empty an answer, and reading
      // `.success` off it would throw here, inside iframe-phone's message listener, where nothing
      // would settle the request.
      if (response === undefined || response === null) {
        if (noReplyYet) {
          // Nothing has answered within iframe-phone's advisory 2s. The request is still in flight,
          // so this is not an outcome — except during the handshake, where silence is the answer.
          stats.countDiRplTimeout++;
          if (failFastWithoutReply) {
            settleFailure("handleResponse: CODAP request timed out: " + describeMessage(message));
          }
          return;
        }
        // CODAP answered, with no value. That is a real answer and settles the request, but there
        // is no result for the caller to read, so it fails rather than resolving with `undefined`
        // and handing the caller something `result.success` throws on.
        markConnectionActive();
        settleFailure("handleResponse: CODAP answered with no result: " + describeMessage(message));
        return;
      }
      markConnectionActive();
      // TODO: a batched request is answered with an array, which has no top-level `success`, so
      // every successful init() handshake is counted a decline here. These counters are diagnostic
      // only, but they mislead whoever reads getStats() to find out why a plugin is misbehaving.
      if (response.success) { stats.countDiRplSuccess++; } else { stats.countDiRplFail++; }
      settleSuccess(response);
    }

    switch (connectionState) {
      case "closed": // log the message and ignore
        // console.warn('sendRequest on closed CODAP connection: ' + JSON.stringify(message));
        settleFailure("sendRequest on closed CODAP connection: " + describeMessage(message));
        break;
      case "preinit": // warn, but issue request.
        // console.log('sendRequest on not yet initialized CODAP connection: ' +
            // JSON.stringify(message));
        /* falls through */
      default:
        if (connection) {
          stats.countDiReq++;
          stats.timeDiLastReq = new Date();
          if (!stats.timeDiFirstReq) {
            stats.timeDiFirstReq = stats.timeDiLastReq;
          }

          // `call` can throw synchronously — an uncloneable value in the message makes postMessage
          // raise DataCloneError. Settling here rather than letting the throw escape the executor is
          // what keeps the callback contract true on this path: an escaped throw rejects the promise
          // without ever passing through settle(), so the caller's callback would never fire.
          //
          // The deadline is armed inside the same `try`, after the call, so a throw skips it: there
          // is then no timer to outlive a request that has already settled, and no ordering for a
          // later edit to get wrong. Nothing can settle before the timer exists, because iframe-phone
          // never invokes the callback synchronously — it stores the callback, arms its own 2s timer,
          // and posts.
          try {
            connection.call(message, handleResponse);

            // Capture the deadline this request was given, so a later setRequestTimeout() can't
            // make the reported duration disagree with the timer that actually fired.
            const timeout = requestTimeout;
            timeoutTimer = setTimeout(function () {
              stats.countDiReqDeadlineExceeded++;
              settleFailure("sendRequest: CODAP request exceeded " + timeout + "ms: " +
                  describeMessage(message));
            }, timeout);
          } catch (error) {
            settleFailure(error);
          }
        } else {
          // Nothing will ever call back, so settle now rather than leaving the caller waiting
          // forever — the same guarantee the deadline provides once a request is in flight.
          settleFailure("sendRequest on non-existent CODAP connection: " + describeMessage(message));
        }
    }
  });
}

export const codapInterface = {
  /**
   * Connection statistics
   */
  stats,

  /**
   * Initialize connection.
   *
   * Start connection. Request interactiveFrame to get prior state, if any.
   * Update interactive frame to set name and dimensions and other configuration
   * information.
   *
   * @param iConfig {object} Configuration. Optional properties: title {string},
   *                        version {string}, dimensions {object}
   *
   * @param iCallback {function(interactiveState)}
   * @return {Promise} Promise of interactiveState;
   */
  init (iConfig: IConfig, iCallback?: (arg0: any) => void) {
    const this_ = this;
    return new Promise(function (resolve: (arg0: any) => void, reject: { (arg0: string): void; (arg0: any): void; }) {
      /**
       * Fails the handshake, and with it the connection.
       *
       * A handshake that got no answer leaves a `connection` object that nothing is listening to.
       * Left in place it looks live to `issueRequest`, so every later request would be sent and then
       * wait out the full deadline — a minute per request for a plugin that has already been told it
       * is not running inside CODAP. Tearing it down means those requests are refused at once,
       * which is what `init()` rejecting is supposed to have told the caller.
       */
      function failHandshake(reason: unknown) {
        connection = null;
        connectionState = "closed";
        reject(reason instanceof Error ? reason : new Error(String(reason)));
        // the callback reports every outcome, as sendRequest's does; there is no state to pass on
        notifyInitCallback(iCallback, undefined);
      }

      function getFrameRespHandler(resp: { values: { error: any; savedState: any }; success: boolean }[]) {
        // `resp` is always defined here: a handshake that drew no reply rejects rather than
        // resolving, so it reaches failHandshake instead of this function.
        const success = resp && resp[1] && resp[1].success;
        const receivedFrame = success && resp[1].values;
        const savedState = receivedFrame && receivedFrame.savedState;
        this_.updateInteractiveState(savedState);
        if (success) {
          // Settle before handing control to the caller's handlers, and keep what they throw out of
          // this promise — the same contract sendRequest's callback has, for the same reason. Called
          // the other way round, a stateHandler that threw would leave init() unsettled forever and
          // its exception discarded, because nothing observes the promise this handler returns into.
          resolve(savedState);
          // deprecated way of conveying state
          notifyInitCallback(iConfig.stateHandler, savedState);
          notifyInitCallback(iCallback, savedState);
        } else {
          failHandshake((resp[1] && resp[1].values && resp[1].values.error) || "unknown failure");
        }
      }

      const getFrameReq = {action: "get", resource: "interactiveFrame"};
      const newFrame = {
        name: iConfig.name,
        title: iConfig.title,
        version: iConfig.version,
        dimensions: iConfig.dimensions,
        preventBringToFront: iConfig.preventBringToFront,
        preventDataContextReorg: iConfig.preventDataContextReorg
      };
      const updateFrameReq = {
        action: "update",
        resource: "interactiveFrame",
        values: newFrame
      };

      config = iConfig;

      // initialize connection
      connection = new IframePhoneRpcEndpoint(
          notificationHandler, "data-interactive", window.parent);
      // Reset the state, so that initializing again after destroy() works. Without this the
      // handshake below would be refused by the `case "closed"` branch in issueRequest, and the
      // connection could never be reestablished.
      connectionState = "preinit";

      // guard against re-registering on a second init(), which would leave a duplicate subscriber
      // behind for every reconnect
      if (!config.customInteractiveStateHandler && !interactiveStateHandlerRegistered) {
        this_.on("get", "interactiveState", function () {
          return ({success: true, values: this_.getInteractiveState()});
        }.bind(this_));
        interactiveStateHandlerRegistered = true;
      }

      // console.log('sending interactiveState: ' + JSON.stringify(this_.getInteractiveState));
      // update, then get the interactiveFrame.
      return issueRequest([updateFrameReq, getFrameReq], { failFastWithoutReply: true })
        .then(getFrameRespHandler as any, failHandshake);
    }.bind(this));
  },

  /**
   * Current known state of the connection
   * @param {'preinit' || 'init' || 'active' || 'inactive' || 'closed'}
   */
  getConnectionState () {return connectionState;},

  /**
   * How long, in milliseconds, a request waits for a CODAP response before it is rejected.
   * Defaults to 60000. Raise it for plugins that issue requests over very large datasets; lower it
   * if a caller needs to fail fast.
   *
   * This is deliberately much longer than the 2s timer inside iframe-phone, which reports that no
   * reply has arrived yet without cancelling the request — a large request routinely takes longer
   * than that and still succeeds.
   */
  getRequestTimeout () {return requestTimeout;},

  /**
   * Sets how long, in milliseconds, a request waits for a CODAP response before it is rejected.
   * Applies to requests issued after the call; requests already in flight keep the value they
   * were given.
   *
   * A non-finite or non-positive value falls back to the default of 60000, and larger values are
   * clamped: setTimeout treats NaN and negative delays as 0 and overflows above its 32-bit
   * ceiling, either of which would silently make every subsequent request fail at once.
   */
  setRequestTimeout (timeout: number) {
    requestTimeout = Number.isFinite(timeout) && timeout > 0
                      ? Math.min(timeout, kMaxRequestTimeout)
                      : kDefaultRequestTimeout;
  },

  getStats () {
    return stats;
  },

  getConfig () {
    return config;
  },

  /**
   * Returns the interactive state.
   *
   * @returns {object}
   */
  getInteractiveState () {
    return interactiveState;
  },

  /**
   * Updates the interactive state.
   * @param iInteractiveState {Object}
   */
  updateInteractiveState (iInteractiveState: any) {
    if (!iInteractiveState) {
      return;
    }
    interactiveState = Object.assign(interactiveState, iInteractiveState);
  },

  /**
   * Tears down the connection to CODAP. Requests issued afterwards are refused rather than sent;
   * `init()` can be called again to reconnect.
   */
  destroy () {
    // TODO: tear down properly. Two things are missing, and both need machinery this does not have.
    //
    // Settle the requests still in flight: each waits out its full deadline instead — a minute in
    // which the caller holds its payload alive after the plugin is gone, ending in a rejection that
    // can surface against a re-initialized instance. They used to fail within iframe-phone's ~2s by
    // accident. Doing it needs a registry of in-flight requests, since `isSettled` and
    // `timeoutTimer` are locals inside each issueRequest executor.
    //
    // Unsubscribe from iframe-phone, whose endpoint exposes `disconnect()`: dropping the reference
    // leaves its window message listener installed, so CODAP's notifications still reach
    // notificationHandler after teardown (which is why the inbound paths check `connection` before
    // reporting the connection live) and a reply to a request still in flight is delivered to a
    // callback for a request nobody is waiting on. Calling it needs coverage of what iframe-phone's
    // module-level endpoint singleton does across a disconnect/reconnect, which these unit tests
    // cannot provide against a mocked endpoint.
    connection = null;
    // Report the state the caller put us in, so getConnectionState() is honest after teardown and
    // new requests are refused rather than reaching a null connection. init() resets this.
    connectionState = "closed";
  },

  /**
   * Sends a request to CODAP. The format of the message is as defined in
   * {@link https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-API}.
   *
   * A request waits up to `getRequestTimeout()` milliseconds (60 seconds by default) for CODAP to
   * answer. It settles exactly once, and both the promise and the callback report every outcome:
   *
   * - **CODAP answered:** the promise resolves with the response and the callback receives it. That
   *   includes `{success: false}`, which means CODAP answered and declined — a resolved promise, not
   *   a rejected one.
   * - **The request failed:** the promise rejects with an `Error` and the callback is invoked with
   *   `undefined`. Every way a request can fail reports this way — exceeding the deadline, there
   *   being no connection to send on (before `initializePlugin()` or after `destroy()`), CODAP
   *   answering with no value at all, and the send itself throwing.
   *
   * The callback is invoked exactly once, after the promise has settled. A callback written as
   * `result.success` therefore has to handle the `undefined` it receives on failure. Note that the
   * promise rejects whether or not a callback is passed, so it still needs a `.catch` to avoid an
   * unhandled rejection. An exception thrown by the callback itself is rethrown as an uncaught error
   * rather than failing the request, which has already settled by then.
   *
   * @param message {Object} The request, as in the Data Interactive API.
   * @param callback {RequestCallback} Optional. Receives the response, or `undefined` if the request
   *    failed, followed by the original request. Its parameter has to admit `undefined`: a callback
   *    typed for the response alone does not compile, because it is the one that throws when a
   *    request fails.
   *
   * @return {Promise} The promise of the response from CODAP.
   */
  sendRequest (message: any, callback?: RequestCallback) {
    return issueRequest(message, { callback });
  },

  /**
   * Registers a handler to respond to CODAP-initiated requests and
   * notifications. See {@link https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-API#codap-initiated-actions}
   *
   * @param actionSpec {'get' || 'notify'} (optional) Action to handle. Defaults to 'notify'.
   * @param resourceSpec {String} A resource string.
   * @param operation {String} (optional) name of operation, e.g. 'create', 'delete',
   *   'move', 'resize', .... If not specified, all operations will be reported.
   * @param handler {Function} A handler to receive the notifications.
   */
  on (actionSpec: string, resourceSpec: string, operation: string | ClientHandler, handler?: ClientHandler) {
    let as = "notify",
        rs,
        os,
        hn;
    const args = Array.prototype.slice.call(arguments);
    if (["get", "update", "notify"].indexOf(args[0]) >= 0) {
      as = args.shift();
    }
    rs = args.shift();
    if (typeof args[0] !== "function") {
      os = args.shift();
    }
    hn = args.shift();

    const subscriber = {
      actionSpec: as,
      resourceSpec: rs,
      operation: os,
      handler: hn
    };

    notificationSubscribers.push(subscriber);
  },

  /**
   * Parses a resource selector returning a hash of named resource names to
   * resource values. The last clause is identified as the resource type.
   * E.g. converts 'dataContext[abc].collection[def].case'
   * to {dataContext: 'abc', collection: 'def', type: 'case'}
   *
   * @param {String} iResource
   * @return {Object}
   */
  parseResourceSelector (iResource: string) {
    const selectorRE = /([A-Za-z0-9_-]+)\[([^\]]+)]/;
    const result: any = {};
    const selectors = iResource.split(".");
    selectors.forEach(function (selector: string) {
      let resourceType, resourceName;
      const match = selectorRE.exec(selector);
      if (selectorRE.test(selector) && match) {
        resourceType = match[1];
        resourceName = match[2];
        result[resourceType] = resourceName;
        result.type = resourceType;
      } else {
        result.type = selector;
      }
    });

    return result;
  }
};
