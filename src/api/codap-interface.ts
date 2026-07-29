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

/**
 * The CODAP Connection
 * @param {iframePhone.IframePhoneRpcEndpoint}
 */
let connection: { call: (arg0: any, arg1: (response: any) => void) => void; } | null = null;

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
  countDiReq: 0,
  countDiRplSuccess: 0,
  countDiRplFail: 0,
  countDiRplTimeout: 0,
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

let interactiveState = {};

/**
 * A list of subscribers to messages from CODAP
 * @param {[{actionSpec: {RegExp}, resourceSpec: {RegExp}, handler: {function}}]}
 */
const notificationSubscribers: { actionSpec: string; resourceSpec: any; operation: any; handler: any; }[] = [];

function matchResource(resourceName: any, resourceSpec: string) {
  return resourceSpec === "*" || resourceName === resourceSpec;
}

function notificationHandler (request: { action: any; resource: any; values: any; }, callback: (arg0: { success: boolean; }) => void) {
  const action = request.action;
  const resource = request.resource;
  let requestValues = request.values;
  let returnMessage = {success: true};

  connectionState = "active";
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
   * Invoked with the response on success and with `undefined` on failure.
   *
   * TODO: type this as `(response?: IResult, request?: any) => void`. As `any` it accepts a
   * consumer's `(result: IResult) => result.success`, which compiles and then throws the first time
   * a request goes unanswered — the very defect this contract exists to prevent — and it is why the
   * helpers' signatures had to be corrected by hand rather than by the compiler. Tightening it
   * breaks consumers' builds, so it belongs in a release that expects to.
   */
  callback?: any
  /**
   * Reject as soon as iframe-phone reports no reply, instead of waiting out `requestTimeout`.
   *
   * Set only for the handshake in `init()`. Everywhere else a request that draws no reply within
   * iframe-phone's advisory 2s is assumed to be in flight and still coming; during the handshake
   * there is no such assumption to make, so silence means nothing is listening. This is a property
   * of the individual request rather than of the connection state, so an ordinary request issued
   * while the handshake is outstanding is still treated as an ordinary request.
   */
  failFastWithoutReply?: boolean
}

/**
 * Reports an exception thrown by a caller's request callback.
 *
 * By the time the callback runs its request has already settled, so what it throws is not the
 * request's failure and must not escape into the stack that invoked it — iframe-phone's message
 * listener (where a throw skips its own bookkeeping), the deadline timer, or the promise executor
 * (which discards it silently, since the promise has settled). Rethrowing on a fresh task keeps it
 * out of all three while leaving it an uncaught error, so `window.onerror` and error reporters
 * still see it: logging it instead would hide a consumer's bug from the monitoring they rely on.
 */
function reportCallbackError (error: unknown) {
  queueMicrotask(() => { throw error; });
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
    function settle (settleFn: (value?: any) => void, value: any, callbackResponse?: any) {
      if (isSettled) { return; }
      isSettled = true;
      if (timeoutTimer !== undefined) { clearTimeout(timeoutTimer); }
      settleFn(value);
      if (callback) {
        // A callback written for the success case may not expect `undefined`. Whatever it throws
        // must not escape into iframe-phone's listener, the deadline timer, or this executor —
        // see reportCallbackError.
        try {
          const callbackResult = callback(callbackResponse, message);
          // an async callback reports a throw as a rejected return value, which the catch can't see
          if (callbackResult && typeof callbackResult.then === "function") {
            callbackResult.then(undefined, reportCallbackError);
          }
        } catch (error) {
          reportCallbackError(error);
        }
      }
    }

    function handleResponse (response: {success: boolean} | undefined) {
      if (response === undefined) {
        // iframe-phone's advisory timer expired; the reply is still coming. See kDefaultRequestTimeout.
        // TODO: a request CODAP genuinely answers with no value arrives here identically, and now
        // waits out the full deadline rather than failing in ~2s. iframe-phone does distinguish the
        // two — its advisory call passes a second argument, `callback(undefined, new Error(
        // "IframePhone timed out waiting for reply"))` — which this handler discards.
        stats.countDiRplTimeout++;
        if (failFastWithoutReply) {
          settle(reject, "handleResponse: CODAP request timed out: " + JSON.stringify(message));
        }
        return;
      }
      connectionState = "active";
      // TODO: a batched request is answered with an array, which has no top-level `success`, so
      // every successful init() handshake is counted a failure here. These counters are diagnostic
      // only, but they mislead whoever reads getStats() to find out why a plugin is misbehaving.
      if (response.success) { stats.countDiRplSuccess++; } else { stats.countDiRplFail++; }
      settle(resolve, response, response);
    }

    switch (connectionState) {
      case "closed": // log the message and ignore
        // console.warn('sendRequest on closed CODAP connection: ' + JSON.stringify(message));
        settle(reject, "sendRequest on closed CODAP connection: " + JSON.stringify(message));
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

          // Issue the request before arming the deadline. `call` can throw synchronously — an
          // uncloneable value in the message makes postMessage raise DataCloneError — and that
          // throw rejects this promise directly, without going through settle(). A timer armed
          // first would survive that, and fire a spurious failure at the deadline. iframe-phone
          // never invokes the callback synchronously, so nothing can settle before the timer
          // exists.
          connection.call(message, handleResponse);

          // Capture the deadline this request was given, so a later setRequestTimeout() can't
          // make the reported duration disagree with the timer that actually fired.
          const timeout = requestTimeout;
          timeoutTimer = setTimeout(function () {
            settle(reject, "sendRequest: CODAP request exceeded " + timeout + "ms: " +
                JSON.stringify(message));
          }, timeout);
        } else {
          // Nothing will ever call back, so settle now rather than leaving the caller waiting
          // forever — the same guarantee the deadline provides once a request is in flight.
          settle(reject, "sendRequest on non-existent CODAP connection: " + JSON.stringify(message));
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
      function getFrameRespHandler(resp: { values: { error: any; savedState: any }; success: boolean }[]) {
        const success = resp && resp[1] && resp[1].success;
        const receivedFrame = success && resp[1].values;
        const savedState = receivedFrame && receivedFrame.savedState;
        this_.updateInteractiveState(savedState);
        if (success) {
          // deprecated way of conveying state
          if (iConfig.stateHandler) {
            iConfig.stateHandler(savedState);
          }
          resolve(savedState);
        } else {
          if (!resp) {
            reject("Connection request to CODAP timed out.");
          } else {
            reject(
                (resp[1] && resp[1].values && resp[1].values.error) ||
                "unknown failure");
          }
        }
        if (iCallback) {
          iCallback(savedState);
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

      if (!config.customInteractiveStateHandler) {
        this_.on("get", "interactiveState", function () {
          return ({success: true, values: this_.getInteractiveState()});
        }.bind(this_));
      }

      // console.log('sending interactiveState: ' + JSON.stringify(this_.getInteractiveState));
      // update, then get the interactiveFrame.
      return issueRequest([updateFrameReq, getFrameReq], { failFastWithoutReply: true })
        .then(getFrameRespHandler as any, reject);
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

  destroy () {
    // TODO: settle the requests still in flight. Nulling the connection leaves each of them to wait
    // out its full deadline — a minute in which the caller holds its payload alive after the plugin
    // is gone, ending in a rejection that can surface against a re-initialized instance. They used
    // to fail within iframe-phone's ~2s by accident. Settling them needs a registry of in-flight
    // requests, since `isSettled` and `timeoutTimer` are locals inside each issueRequest executor;
    // a destroyed connection should refuse new requests too, which `connectionState = "closed"`
    // would do.
    connection = null;
  },

  /**
   * Sends a request to CODAP. The format of the message is as defined in
   * {@link https://github.com/concord-consortium/codap/wiki/CODAP-Data-Interactive-API}.
   *
   * @param message {String}
   * @param callback {function(response, request)} Optional callback to handle
   *    the CODAP response. Note both the response and the initial request will
   *    sent.
   *
   * @return {Promise} The promise of the response from CODAP.
   */
  sendRequest (message: any, callback?: any) {
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
