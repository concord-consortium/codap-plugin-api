import {ClientHandler, codapInterface} from "./codap-interface";
import { Action, Attribute, CodapItemValues, CodapItem } from "./types";
export interface IDimensions {
  width: number;
  height: number;
}

export interface IInitializePlugin {
  pluginName: string;
  version: string;
  dimensions: IDimensions;
}
export interface IResult {
  success: boolean;
  values: any;
}

////////////// internal helper functions //////////////

const ctxStr = (contextName: string) => `dataContext[${contextName}]`;
const collStr = (collectionName: string) => `collection[${collectionName}]`;

const createMessage = (action: string, resource: string, values?: any) => {
  return {
    action,
    resource,
    values
  };
};

export const sendMessage = async (action: Action, resource: string, values?: CodapItemValues) => {
  const message = createMessage(action, resource, values);
  return await codapInterface.sendRequest(message) as unknown as IResult;
};

// CODAP answers a request with success true or false; it may also not answer at all, in which case
// a callback receives `undefined`. Absence of a response is not a failure response — it licenses no
// conclusion about what CODAP did — so each call site has to decide what not knowing means for it.
//
// Prefer the promise form (`sendMessage`, or `await codapInterface.sendRequest(...)`) in helpers
// that consume the answer: absence then arrives as a rejection, which is noisy if unhandled,
// whereas an unchecked `undefined` yields a plausible-looking wrong answer. The callback form suits
// a fire-and-forget request that nothing depends on — but the promise still rejects on failure
// whether or not anyone is reading it, so such a call needs a `.catch` as well as its callback.

// Some helpers issue a request without awaiting it, so a rejection has nothing attached to observe
// it. Report it rather than letting it surface as an unhandled rejection.
const reportRequestFailure = (context: string, error?: unknown) => {
  // eslint-disable-next-line no-console
  console.warn(`${context} failed`, error ?? "");
};

////////////// public API //////////////

export const initializePlugin = async (options: IInitializePlugin) => {
  const { pluginName, version, dimensions } = options;
  const interfaceConfig = {
    name: pluginName,
    version,
    dimensions
  };
  return await codapInterface.init(interfaceConfig);
};

////////////// component functions //////////////

export const createTable = async (dataContext: string, datasetName?: string) => {
  const values: CodapItemValues = {
    type: "caseTable",
    dataContext
  };
  if (datasetName) {
    values.name = datasetName;
  }
  return sendMessage("create", "component", values);
};

// Selects this component. In CODAP this will bring this component to the front.
export const selectSelf = () => {

  // Neither request is awaited. A failed request reports an undefined result to its callback.
  const selectComponent = async function (id: number) {
    return codapInterface.sendRequest({
      action: "notify",
      resource:  `component[${id}]`,
      values: {request: "select"}
    }, (result?: IResult) => {
      // an undefined result means CODAP didn't respond, which the catch below reports
      if (result && !result.success) {
        reportRequestFailure("selectSelf");
      }
    }).catch(error => reportRequestFailure("selectSelf", error));
  };

  codapInterface.sendRequest({action: "get", resource: "interactiveFrame"}, (result?: IResult) => {
    // an undefined result means CODAP didn't respond, which the catch below reports
    if (!result) {
      return;
    }
    // without the frame's id there is no component to select, and requesting `component[undefined]`
    // would ask CODAP to select something that cannot exist
    if (!result.success || result.values?.id === undefined) {
      reportRequestFailure("selectSelf");
      return;
    }
    return selectComponent(result.values.id);
  }).catch(error => reportRequestFailure("selectSelf", error));
};

export const addComponentListener = (callback: ClientHandler) => {
  codapInterface.on("notify", "component", callback);
};

////////////// data context functions //////////////

export const getListOfDataContexts = () => {
  return sendMessage("get", "dataContextList");
};

export const getDataContext = (dataContextName: string) => {
  return sendMessage("get", ctxStr(dataContextName));
};

export const createDataContext = (dataContextName: string) => {
  return sendMessage("create", "dataContext", {name: dataContextName});
};

export const createDataContextFromURL = (url: string) => {
  return sendMessage("create", "dataContextFromURL", {"URL": url});
};

export const addDataContextsListListener = (callback: ClientHandler) => {
  codapInterface.on("notify", "documentChangeNotice", callback);
};

export const addDataContextChangeListener = (dataContextName: string, callback: ClientHandler) => {
  codapInterface.on("notify", `dataContextChangeNotice[${dataContextName}]`, callback);
};

////////////// collection functions //////////////

export const getCollectionList = (dataContextName: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.collectionList`);
};

export const getCollection = (dataContextName: string, collectionName: string) => {
 return sendMessage("get", `${ctxStr(dataContextName)}.${collStr(collectionName)}`);
};

export const createParentCollection = (dataContextName: string, collectionName: string, attrs?: Attribute[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": "_root_"
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return sendMessage("create", resource, values);
};

export const createChildCollection = (dataContextName: string, collectionName: string, parentCollectionName: string, attrs?: Attribute[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": parentCollectionName
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return sendMessage("create", resource, values);
};

export const createNewCollection = (dataContextName: string, collectionName: string, attrs?: Attribute[]) =>  {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return sendMessage("create", resource, values);
};

export const ensureUniqueCollectionName = async (dataContextName: string, collectionName: string, index: number): Promise<string | undefined> => {
  index = index || 0;
  // guard against runaway loops. `> 100` rather than `>= 100` so that the hundredth suffix is still
  // tried: the candidates are `collectionName` through `collectionName100`, and stopping at 99 would
  // report no name available while one still was.
  if (index > 100) {
    return undefined;
  }
  const uniqueName = `${collectionName}${index !== 0 ? index : ""}`;
  const getCollMessage = {
    "action": "get",
    "resource": `${ctxStr(dataContextName)}.collection[${uniqueName}]`
  };

  // sendRequest rejects when CODAP doesn't respond, so awaiting it throws here. Not hearing back
  // says nothing about whether the collection exists, so let that reach the caller rather than
  // concluding the name is free and risking a duplicate.
  const result = await codapInterface.sendRequest(getCollMessage) as unknown as IResult;

  if (result.success) {
    return ensureUniqueCollectionName(dataContextName, collectionName, index + 1);
  } else {
    return uniqueName;
  }
};

////////////// attribute functions //////////////

export const getAttribute = (dataContextName: string, collectionName: string, attributeName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute[${attributeName}]`;
  return sendMessage("get", resource);
};

export const getAttributeList = (dataContextName: string, collectionName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attributeList`;
  return sendMessage("get", resource);
};

export const createNewAttribute = (dataContextName: string, collectionName: string, attributeName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute`;
  const values: CodapItemValues = {
    "name": attributeName,
    "title": attributeName,
  };
  return sendMessage("create", resource, values);
};

export const updateAttribute = (dataContextName: string, collectionName: string, attributeName: string, attribute: Attribute, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute[${attributeName}]`;
  return sendMessage("update", resource, values);
};

export const updateAttributePosition = (dataContextName: string, collectionName: string, attrName: string, newPosition: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attributeLocation[${attrName}]`;
  return sendMessage("update", resource, {
    "collection": collectionName,
    "position": newPosition
  });
};

// Reorganizes the attribute into its own collection. Each step depends on the answer to the one
// before it, so this follows the promise-form guidance above: it awaits every request and resolves
// with the result of the last step it reached — the attribute move when every step ran, or the step
// CODAP refused. A request that goes unanswered rejects.
//
// Note what the resolved result does and does not tell the caller: that the steps this function
// issued succeeded. It does not report what CODAP did in response, in particular whether the old
// collection was removed once its last attribute left.
export const createCollectionFromAttribute = async (dataContextName: string, oldCollectionName: string, attr: Attribute, parent: number|string): Promise<IResult> => {
  // check if a collection for the attribute already exists
  const getCollectionMessage = createMessage("get", `${ctxStr(dataContextName)}.${collStr(attr.name)}`);
  const existingCollection = await codapInterface.sendRequest(getCollectionMessage) as unknown as IResult;

  // Since you can't "re-parent" collections, the attribute gets a new collection of its own and is
  // moved into it. When the attribute is the only one left in its old collection, or is the one the
  // collection is named for, that new collection takes a name derived from the attribute's — and
  // CODAP removes the old collection once it is empty.
  // (a successful lookup for a collection with no attribute list leaves `attrs` undefined, hence `?.`)
  const moveCollection = existingCollection.success &&
    (existingCollection.values?.attrs?.length === 1 || attr.name === oldCollectionName);
  const newCollectionName = moveCollection
    ? await ensureUniqueCollectionName(dataContextName, attr.name, 0)
    : attr.name;
  if (newCollectionName === undefined) {
    // no unused name was available, so there is nothing to create the collection under. Nothing was
    // asked of CODAP and nothing went wrong with the connection, so this is a refusal rather than a
    // rejection: report it in the shape CODAP uses for a request it declines, and let the caller
    // read `success` the same way it does for every other step.
    return {
      success: false,
      values: { error: `createCollectionFromAttribute: no unused collection name based on "${attr.name}"` }
    };
  }

  const _parent = parent === "root" ? "_root_" : parent;
  const createCollectionRequest = createMessage("create", `${ctxStr(dataContextName)}.collection`, {
    "name": newCollectionName,
    "title": newCollectionName,
    parent: _parent,
  });
  const createCollectionResult = await codapInterface.sendRequest(createCollectionRequest) as unknown as IResult;
  if (!createCollectionResult.success) {
    // without the new collection there is nowhere to move the attribute to
    return createCollectionResult;
  }

  const moveAttributeRequest = createMessage("update", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeLocation[${attr.name}]`, {
    "collection": newCollectionName,
    "position": 0
  });
  // moving the attribute is what makes the new collection the attribute's collection, so this is the
  // result that answers whether the reorganization happened
  return await codapInterface.sendRequest(moveAttributeRequest) as unknown as IResult;
};

////////////// case functions //////////////

export const getCaseCount = (dataContextName: string, collectionName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseCount`;
  return sendMessage("get", resource);
};

export const getCaseByIndex = (dataContextName: string, collectionName: string, index: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseByIndex[${index}]`;
  return sendMessage("get", resource);
};

export const getCaseByID = (dataContextName: string, caseID: number | string) => {
  const resource = `${ctxStr(dataContextName)}.caseByID[${caseID}]`;
  return sendMessage("get", resource);
};

export const getCaseBySearch = (dataContextName: string, collectionName: string, search: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseSearch[${search}]`;
  return sendMessage("get", resource);
};

export const getCaseByFormulaSearch = (dataContextName: string, collectionName: string, search: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseFormulaSearch[${search}]`;
  return sendMessage("get", resource);
};

export const createSingleOrParentCase = (dataContextName: string, collectionName: string, values: Array<CodapItemValues>) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  return sendMessage("create", resource, values);
};

export const createChildCase = (dataContextName: string, collectionName: string, parentCaseID: number|string, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  const valuesWithParent = [
    {
      parent: parentCaseID,
      values
    }
  ];
  return sendMessage("create", resource, valuesWithParent);
};

export const updateCaseById = (dataContextName: string, caseID: number|string, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.caseByID[${caseID}]`;
  const updateValues = {
    values
  };
  return sendMessage("update", resource, updateValues);
};

export const updateCases = (dataContextName: string, collectionName: string, values: CodapItem[]) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  return sendMessage("update", resource, values);
};

export const getSelectionList = (dataContextName: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.selectionList`);
};

export const selectCases = (dataContextName: string, caseIds: Array<string|number>) => {
  return sendMessage("create", `${ctxStr(dataContextName)}.selectionList`, caseIds);
};

export const addCasesToSelection = (dataContextName: string, caseIds: Array<string|number>) => {
  return sendMessage("update", `${ctxStr(dataContextName)}.selectionList`, caseIds);
};

////////////// item functions //////////////

export const getItemCount = (dataContextName: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.itemCount`);
};

export const getAllItems = (dataContextName: string) =>{
  return sendMessage("get", `${ctxStr(dataContextName)}.itemSearch[*]`);
};

export const getItemByID = (dataContextName: string, itemID: number | string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.itemByID[${itemID}]`);
};

export const getItemByIndex = (dataContextName: string, index: number) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.item[${index}]`);
};

export const getItemByCaseID = (dataContextName: string, caseID: number | string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.itemByCaseID[${caseID}]`);
};

export const getItemBySearch = (dataContextName: string, search: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.itemSearch[${search}]`);
};

export const createItems = (dataContextName: string, items: Array<CodapItemValues>) => {
  return sendMessage("create", `${ctxStr(dataContextName)}.item`, items);
};

export const updateItemByID = (dataContextName: string, itemID: number | string, values: CodapItemValues) => {
  return sendMessage("update", `${ctxStr(dataContextName)}.itemByID[${itemID}]`, values);
};

export const updateItemByIndex = (dataContextName: string, index: number, values: CodapItemValues) => {
  return sendMessage("update", `${ctxStr(dataContextName)}.item[${index}]`, values);
};

export const updateItemByCaseID = (dataContextName: string, caseID: number | string, values: CodapItemValues) => {
  return sendMessage("update", `${ctxStr(dataContextName)}.itemByCaseID[${caseID}]`, values);
};
