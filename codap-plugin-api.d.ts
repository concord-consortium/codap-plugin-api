interface Attribute {
    name: string;
    formula?: string;
    description?: string;
    type?: string;
    cid?: string;
    precision?: string;
    unit?: string;
    editable?: boolean;
    renameable?: boolean;
    deleteable?: boolean;
    hidden?: boolean;
}
interface CodapItemValues {
    [attr: string]: any;
}
interface CodapItem {
    id: number | string;
    values: CodapItemValues;
}
type Action = "create" | "get" | "update" | "delete";

interface IDimensions {
    width: number;
    height: number;
}
interface IInitializePlugin {
    pluginName: string;
    version: string;
    dimensions: IDimensions;
}
interface IResult {
    success: boolean;
    values: any;
}
declare const sendMessage: (action: Action, resource: string, values?: CodapItemValues) => Promise<IResult>;
declare const initializePlugin: (options: IInitializePlugin) => Promise<any>;
declare const createTable: (dataContext: string, datasetName?: string) => Promise<IResult>;
declare const selectSelf: () => void;
declare const addComponentListener: (callback: ClientHandler) => void;
declare const getListOfDataContexts: () => Promise<IResult>;
declare const getDataContext: (dataContextName: string) => Promise<IResult>;
declare const createDataContext: (dataContextName: string) => Promise<IResult>;
declare const createDataContextFromURL: (url: string) => Promise<IResult>;
declare const addDataContextsListListener: (callback: ClientHandler) => void;
declare const addDataContextChangeListener: (dataContextName: string, callback: ClientHandler) => void;
declare const getCollectionList: (dataContextName: string) => Promise<IResult>;
declare const getCollection: (dataContextName: string, collectionName: string) => Promise<IResult>;
declare const createParentCollection: (dataContextName: string, collectionName: string, attrs?: Attribute[]) => Promise<IResult>;
declare const createChildCollection: (dataContextName: string, collectionName: string, parentCollectionName: string, attrs?: Attribute[]) => Promise<IResult>;
declare const createNewCollection: (dataContextName: string, collectionName: string, attrs?: Attribute[]) => Promise<IResult>;
declare const ensureUniqueCollectionName: (dataContextName: string, collectionName: string, index: number) => Promise<string | undefined>;
declare const getAttribute: (dataContextName: string, collectionName: string, attributeName: string) => Promise<IResult>;
declare const getAttributeList: (dataContextName: string, collectionName: string) => Promise<IResult>;
declare const createNewAttribute: (dataContextName: string, collectionName: string, attributeName: string) => Promise<IResult>;
declare const updateAttribute: (dataContextName: string, collectionName: string, attributeName: string, attribute: Attribute, values: CodapItemValues) => Promise<IResult>;
declare const updateAttributePosition: (dataContextName: string, collectionName: string, attrName: string, newPosition: number) => Promise<IResult>;
declare const createCollectionFromAttribute: (dataContextName: string, oldCollectionName: string, attr: Attribute, parent: number | string) => Promise<IResult>;
declare const getCaseCount: (dataContextName: string, collectionName: string) => Promise<IResult>;
declare const getCaseByIndex: (dataContextName: string, collectionName: string, index: number) => Promise<IResult>;
declare const getCaseByID: (dataContextName: string, caseID: number | string) => Promise<IResult>;
declare const getCaseBySearch: (dataContextName: string, collectionName: string, search: string) => Promise<IResult>;
declare const getCaseByFormulaSearch: (dataContextName: string, collectionName: string, search: string) => Promise<IResult>;
declare const createSingleOrParentCase: (dataContextName: string, collectionName: string, values: Array<CodapItemValues>) => Promise<IResult>;
declare const createChildCase: (dataContextName: string, collectionName: string, parentCaseID: number | string, values: CodapItemValues) => Promise<IResult>;
declare const updateCaseById: (dataContextName: string, caseID: number | string, values: CodapItemValues) => Promise<IResult>;
declare const updateCases: (dataContextName: string, collectionName: string, values: CodapItem[]) => Promise<IResult>;
declare const getSelectionList: (dataContextName: string) => Promise<IResult>;
declare const selectCases: (dataContextName: string, caseIds: Array<string | number>) => Promise<IResult>;
declare const addCasesToSelection: (dataContextName: string, caseIds: Array<string | number>) => Promise<IResult>;
declare const getItemCount: (dataContextName: string) => Promise<IResult>;
declare const getAllItems: (dataContextName: string) => Promise<IResult>;
declare const getItemByID: (dataContextName: string, itemID: number | string) => Promise<IResult>;
declare const getItemByIndex: (dataContextName: string, index: number) => Promise<IResult>;
declare const getItemByCaseID: (dataContextName: string, caseID: number | string) => Promise<IResult>;
declare const getItemBySearch: (dataContextName: string, search: string) => Promise<IResult>;
declare const createItems: (dataContextName: string, items: Array<CodapItemValues>) => Promise<IResult>;
declare const updateItemByID: (dataContextName: string, itemID: number | string, values: CodapItemValues) => Promise<IResult>;
declare const updateItemByIndex: (dataContextName: string, index: number, values: CodapItemValues) => Promise<IResult>;
declare const updateItemByCaseID: (dataContextName: string, caseID: number | string, values: CodapItemValues) => Promise<IResult>;

interface IConfig {
    stateHandler?: (arg0: any) => void;
    customInteractiveStateHandler?: boolean;
    name?: any;
    title?: any;
    version?: any;
    dimensions?: any;
    preventBringToFront?: any;
    preventDataContextReorg?: any;
}
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
interface ClientNotification {
    action: string;
    resource: string;
    values: any;
}
type ClientHandler = (notification: ClientNotification) => void;
/**
 * What `sendRequest` passes a callback: CODAP's response, or `undefined` if the request failed.
 *
 * The `undefined` is the point of the type. A callback declared to take `IResult` alone does not
 * satisfy it, and will not compile — which is the intent, because such a callback throws a
 * `TypeError` the first time a request fails, on a path a plugin may not exercise until it is in
 * front of users.
 */
type RequestCallback = (response?: IResult, request?: any) => void;
/**
 * As `RequestCallback`, for a batched request: CODAP answers an array of requests with an array of
 * results. `sendRequest` requires this shape when the message is an array and rejects it otherwise,
 * so a callback cannot be paired with a response it is unable to read.
 */
type BatchRequestCallback = (response?: IResult[], request?: any) => void;
declare const codapInterface: {
    /**
     * Connection statistics
     */
    stats: {
        /**
         * How many requests the caller issued.
         *
         * Counted when `sendRequest` is called, not when the request reaches CODAP, so a request refused
         * before it could be sent — no connection, or a closed one — is included. That is what makes the
         * arithmetic on `countDiReqFailed` below hold; counting only the ones that got as far as CODAP
         * left the refusals incrementing a failure count against a total that had not moved.
         */
        countDiReq: number;
        /** How many requests CODAP answered with `{success: true}`. */
        countDiRplSuccess: number;
        /**
         * How many requests CODAP answered with `{success: false}` — that is, answered and declined.
         * These are outcomes, not failures: the request's promise resolves with the response. For
         * requests that failed, see `countDiReqFailed`.
         */
        countDiRplFail: number;
        /**
         * How many requests failed, and so rejected: no connection to send on, no answer within the
         * deadline, an answer carrying no result, or the send itself throwing.
         *
         * `countDiReq - countDiRplSuccess - countDiRplFail - countDiReqFailed` is the number still in
         * flight. `countDiReqDeadlineExceeded` counts the subset that ran out of time.
         */
        countDiReqFailed: number;
        /**
         * How many times iframe-phone's advisory 2s timer has reported that no reply has arrived yet.
         *
         * This counts probes, not failures. A request slower than 2s that goes on to succeed normally
         * increments it, so on a plugin doing bulk work a high count is expected and says nothing is
         * wrong. For requests that actually ran out of time, see `countDiReqDeadlineExceeded`.
         */
        countDiRplTimeout: number;
        /**
         * How many requests were rejected for exceeding their deadline. See `setRequestTimeout`. A subset
         * of `countDiReqFailed`.
         */
        countDiReqDeadlineExceeded: number;
        countCodapReq: number;
        countCodapUnhandledReq: number;
        countCodapRplSuccess: number;
        countCodapRplFail: number;
        timeDiFirstReq: Date | null;
        timeDiLastReq: Date | null;
        timeCodapFirstReq: Date | null;
        timeCodapLastReq: Date | null;
    };
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
    init(iConfig: IConfig, iCallback?: ((arg0: any) => void) | undefined): Promise<any>;
    /**
     * Current known state of the connection
     * @param {'preinit' || 'init' || 'active' || 'inactive' || 'closed'}
     */
    getConnectionState(): string;
    /**
     * How long, in milliseconds, a request waits for a CODAP response before it is rejected.
     * Defaults to 60000. Raise it for plugins that issue requests over very large datasets; lower it
     * if a caller needs to fail fast.
     *
     * This is deliberately much longer than the 2s timer inside iframe-phone, which reports that no
     * reply has arrived yet without cancelling the request — a large request routinely takes longer
     * than that and still succeeds.
     */
    getRequestTimeout(): number;
    /**
     * Sets how long, in milliseconds, a request waits for a CODAP response before it is rejected.
     * Applies to requests issued after the call; requests already in flight keep the value they
     * were given.
     *
     * A non-finite or non-positive value falls back to the default of 60000, and larger values are
     * clamped: setTimeout treats NaN and negative delays as 0 and overflows above its 32-bit
     * ceiling, either of which would silently make every subsequent request fail at once.
     */
    setRequestTimeout(timeout: number): void;
    getStats(): {
        /**
         * How many requests the caller issued.
         *
         * Counted when `sendRequest` is called, not when the request reaches CODAP, so a request refused
         * before it could be sent — no connection, or a closed one — is included. That is what makes the
         * arithmetic on `countDiReqFailed` below hold; counting only the ones that got as far as CODAP
         * left the refusals incrementing a failure count against a total that had not moved.
         */
        countDiReq: number;
        /** How many requests CODAP answered with `{success: true}`. */
        countDiRplSuccess: number;
        /**
         * How many requests CODAP answered with `{success: false}` — that is, answered and declined.
         * These are outcomes, not failures: the request's promise resolves with the response. For
         * requests that failed, see `countDiReqFailed`.
         */
        countDiRplFail: number;
        /**
         * How many requests failed, and so rejected: no connection to send on, no answer within the
         * deadline, an answer carrying no result, or the send itself throwing.
         *
         * `countDiReq - countDiRplSuccess - countDiRplFail - countDiReqFailed` is the number still in
         * flight. `countDiReqDeadlineExceeded` counts the subset that ran out of time.
         */
        countDiReqFailed: number;
        /**
         * How many times iframe-phone's advisory 2s timer has reported that no reply has arrived yet.
         *
         * This counts probes, not failures. A request slower than 2s that goes on to succeed normally
         * increments it, so on a plugin doing bulk work a high count is expected and says nothing is
         * wrong. For requests that actually ran out of time, see `countDiReqDeadlineExceeded`.
         */
        countDiRplTimeout: number;
        /**
         * How many requests were rejected for exceeding their deadline. See `setRequestTimeout`. A subset
         * of `countDiReqFailed`.
         */
        countDiReqDeadlineExceeded: number;
        countCodapReq: number;
        countCodapUnhandledReq: number;
        countCodapRplSuccess: number;
        countCodapRplFail: number;
        timeDiFirstReq: Date | null;
        timeDiLastReq: Date | null;
        timeCodapFirstReq: Date | null;
        timeCodapLastReq: Date | null;
    };
    getConfig(): IConfig | null;
    /**
     * Returns the interactive state.
     *
     * @returns {object}
     */
    getInteractiveState(): {};
    /**
     * Updates the interactive state.
     * @param iInteractiveState {Object}
     */
    updateInteractiveState(iInteractiveState: any): void;
    /**
     * Tears down the connection to CODAP. Requests issued afterwards are refused rather than sent;
     * `init()` can be called again to reconnect.
     */
    destroy(): void;
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
     * The callback is invoked exactly once, synchronously after the promise is resolved or rejected —
     * that is, before any `.then` or `await` continuation runs, since those are microtasks. A callback
     * written as `result.success` therefore has to handle the `undefined` it receives on failure. Note that the
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
    sendRequest<TMessage>(message: TMessage, callback?: (TMessage extends readonly any[] ? BatchRequestCallback : RequestCallback) | undefined): Promise<unknown>;
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
    on(actionSpec: string, resourceSpec: string, operation: string | ClientHandler, handler?: ClientHandler): void;
    /**
     * Parses a resource selector returning a hash of named resource names to
     * resource values. The last clause is identified as the resource type.
     * E.g. converts 'dataContext[abc].collection[def].case'
     * to {dataContext: 'abc', collection: 'def', type: 'case'}
     *
     * @param {String} iResource
     * @return {Object}
     */
    parseResourceSelector(iResource: string): any;
};

export { type BatchRequestCallback, type ClientHandler, type ClientNotification, type IConfig, type IDimensions, type IInitializePlugin, type IResult, type RequestCallback, addCasesToSelection, addComponentListener, addDataContextChangeListener, addDataContextsListListener, codapInterface, createChildCase, createChildCollection, createCollectionFromAttribute, createDataContext, createDataContextFromURL, createItems, createNewAttribute, createNewCollection, createParentCollection, createSingleOrParentCase, createTable, ensureUniqueCollectionName, getAllItems, getAttribute, getAttributeList, getCaseByFormulaSearch, getCaseByID, getCaseByIndex, getCaseBySearch, getCaseCount, getCollection, getCollectionList, getDataContext, getItemByCaseID, getItemByID, getItemByIndex, getItemBySearch, getItemCount, getListOfDataContexts, getSelectionList, initializePlugin, selectCases, selectSelf, sendMessage, updateAttribute, updateAttributePosition, updateCaseById, updateCases, updateItemByCaseID, updateItemByID, updateItemByIndex };
