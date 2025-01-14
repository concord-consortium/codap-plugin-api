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
declare const codapInterface: {
    /**
     * Connection statistics
     */
    stats: {
        countDiReq: number;
        countDiRplSuccess: number;
        countDiRplFail: number;
        countDiRplTimeout: number;
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
    getStats(): {
        countDiReq: number;
        countDiRplSuccess: number;
        countDiRplFail: number;
        countDiRplTimeout: number;
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
    destroy(): void;
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
    sendRequest(message: any, callback?: any): Promise<unknown>;
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
declare const createCollectionFromAttribute: (dataContextName: string, oldCollectionName: string, attr: Attribute, parent: number | string) => Promise<unknown>;
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

export { type ClientHandler, type ClientNotification, type IConfig, type IDimensions, type IInitializePlugin, type IResult, addCasesToSelection, addComponentListener, addDataContextChangeListener, addDataContextsListListener, codapInterface, createChildCase, createChildCollection, createCollectionFromAttribute, createDataContext, createDataContextFromURL, createItems, createNewAttribute, createNewCollection, createParentCollection, createSingleOrParentCase, createTable, ensureUniqueCollectionName, getAllItems, getAttribute, getAttributeList, getCaseByFormulaSearch, getCaseByID, getCaseByIndex, getCaseBySearch, getCaseCount, getCollection, getCollectionList, getDataContext, getItemByCaseID, getItemByID, getItemByIndex, getItemBySearch, getItemCount, getListOfDataContexts, getSelectionList, initializePlugin, selectCases, selectSelf, sendMessage, updateAttribute, updateAttributePosition, updateCaseById, updateCases, updateItemByCaseID, updateItemByID, updateItemByIndex };
