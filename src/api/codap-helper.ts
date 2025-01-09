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

  const selectComponent = async function (id: number) {
    return codapInterface.sendRequest({
      action: "notify",
      resource:  `component[${id}]`,
      values: {request: "select"}
    }, (result: IResult) => {
      if (!result.success) {
        // eslint-disable-next-line no-console
        console.log("selectSelf failed");
      }
    });
  };

  codapInterface.sendRequest({action: "get", resource: "interactiveFrame"}, (result: IResult) => {
    if (result.success) {
      return selectComponent(result.values.id);
    }
  });
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
  const uniqueName = `${collectionName}${index !== 0 ? index : ""}`;
  const getCollMessage = {
    "action": "get",
    "resource": `${ctxStr(dataContextName)}.collection[${uniqueName}]`
  };

  const result: IResult = await new Promise((resolve) => {
    codapInterface.sendRequest(getCollMessage, (res: IResult) => {
      resolve(res);
    });
  });

  if (result.success) {
    // guard against runaway loops
    if (index >= 100) {
      return undefined;
    }
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

export const createCollectionFromAttribute = (dataContextName: string, oldCollectionName: string, attr: Attribute, parent: number|string) => {
  // check if a collection for the attribute already exists
  const getCollectionMessage = createMessage("get", `${ctxStr(dataContextName)}.${collStr(attr.name)}`);

  return codapInterface.sendRequest(getCollectionMessage, async (result: IResult) => {
    // since you can't "re-parent" collections we need to create a temp top level collection, move the attribute,
    // and then check if CODAP deleted the old collection as it became empty and if so rename the new collection
    const moveCollection = result.success && (result.values.attrs.length === 1 || attr.name === oldCollectionName);
    const newCollectionName = moveCollection ? await ensureUniqueCollectionName(dataContextName, attr.name, 0) : attr.name;
    if (newCollectionName === undefined) {
      return;
    }
    const _parent = parent === "root" ? "_root_" : parent;
    const createCollectionRequest = createMessage("create", `${ctxStr(dataContextName)}.collection`, {
      "name": newCollectionName,
      "title": newCollectionName,
      parent: _parent,
    });

    return codapInterface.sendRequest(createCollectionRequest, (createCollResult: IResult) => {
      if (createCollResult.success) {
        const moveAttributeRequest = createMessage("update", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeLocation[${attr.name}]`, {
          "collection": newCollectionName,
          "position": 0
        });
        return codapInterface.sendRequest(moveAttributeRequest);
      }
    });
  });
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
}

export const selectCases = (dataContextName: string, caseIds: Array<string|number>) => {
  return sendMessage("create", `${ctxStr(dataContextName)}.selectionList`, caseIds);
};

export const addCasesToSelection = (dataContextName: string, caseIds: Array<string|number>) => {
  return sendMessage("update", `${ctxStr(dataContextName)}.selectionList`, caseIds);
}

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
