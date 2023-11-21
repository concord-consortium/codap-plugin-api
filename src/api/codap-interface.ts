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
      return this_.sendRequest([updateFrameReq, getFrameReq])
        .then(getFrameRespHandler as any, reject);
    }.bind(this));
  },

  /**
   * Current known state of the connection
   * @param {'preinit' || 'init' || 'active' || 'inactive' || 'closed'}
   */
  getConnectionState () {return connectionState;},

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
    // todo : more to do?
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
    return new Promise(function (resolve, reject){
      function handleResponse (request: any, response: {success: boolean} | undefined, cb: (arg0: any, arg1: any) => void) {
        if (response === undefined) {
          // console.warn('handleResponse: CODAP request timed out');
          reject("handleResponse: CODAP request timed out: " + JSON.stringify(request));
          stats.countDiRplTimeout++;
        } else {
          connectionState = "active";
          if (response.success) { stats.countDiRplSuccess++; } else { stats.countDiRplFail++; }
          resolve(response);
        }
        if (cb) {
          cb(response, request);
        }
      }
      switch (connectionState) {
        case "closed": // log the message and ignore
          // console.warn('sendRequest on closed CODAP connection: ' + JSON.stringify(message));
          reject("sendRequest on closed CODAP connection: " + JSON.stringify(message));
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
              stats.timeCodapFirstReq = stats.timeDiLastReq;
            }

            connection.call(message, function (response: any) {
              handleResponse(message, response, callback);
            });
          } else {
            // console.error('sendRequest on non-existent CODAP connection');
          }
      }
    });
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
