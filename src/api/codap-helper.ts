import {ClientHandler, codapInterface} from "./codap-interface";
import { Action, Attribute, CodapItemValues, CodapItem, DataContext } from "./types";
interface IDimensions {
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
const collStr = (collectionName: string) => `collection${collectionName}`;

const createMessage = (action: string, resource: string, values?: any) => {
  return {
    action,
    resource,
    values
  };
};

const sendMessage = (action: Action, resource: string, values?: CodapItemValues, callback?: (res: IResult) => void) => {
  const message = createMessage(action, resource, values);
  return codapInterface.sendRequest(message, callback) as unknown as IResult;
};

////////////// public API //////////////

export const initializePlugin = (options: IInitializePlugin) => {
  const { pluginName, version, dimensions } = options;
  const interfaceConfig = {
    name: pluginName,
    version,
    dimensions
  };
  return codapInterface.init(interfaceConfig);
};

////////////// component functions //////////////

export const createTable = async () => {
  return await sendMessage("create", "component", { type: "caseTable" });
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

export const getListOfDataContexts = async () => {
  return await sendMessage("get", "dataContextList");
};

export const getDataContext = async (dataContextName: string) => {
  return await sendMessage("get", ctxStr(dataContextName));
};

export const createDataContext = async (dataContextName: string) => {
  return codapInterface.sendRequest({
    action:"get",
    resource: ctxStr(dataContextName)
    }, function (result: { success: any; }) {
    if (result && !result.success) {
      codapInterface.sendRequest({
        action: "create",
        resource: "dataContext",
        values: {
          name: dataContextName
        }
      });
    }
  });
};

export const createDataContextFromURL = async (url: string) => {
  return await sendMessage("create", "dataContextFromURL", {"URL": url});
};

export const addDataContextsListListener = async (callback: ClientHandler) => {
  codapInterface.on("notify", "documentChangeNotice", callback);
};

export const addDataContextChangeListener = async (context: DataContext, callback: ClientHandler) => {
  codapInterface.on("notify", `dataContextChangeNotice[${context.name}]`, callback);
};

////////////// collection functions //////////////

export const getCollectionList = async (dataContextName: string) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.collectionList`);
};

export const getCollection = async (dataContextName: string, collectionName: string) => {
 return await sendMessage("get", `${ctxStr(dataContextName)}.${collStr(collectionName)}`);
};

export const createParentCollection = async (dataContextName: string, collectionName: string, attrs?: Attribute[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": "_root_"
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return await sendMessage("create", resource, values);
};

export const createChildCollection = async (dataContextName: string, collectionName: string, parentCollectionName: string, attrs?: Attribute[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": parentCollectionName
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return await sendMessage("create", resource, values);
};

export const createNewCollection = async (dataContextName: string, collectionName: string, attrs?: Attribute[]) =>  {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: CodapItemValues = {
    "name": collectionName,
    "title": collectionName,
  };

  if (attrs) {
    values.attrs = attrs;
  }

  return await sendMessage("create", resource, values);
};

export const ensureUniqueCollectionName = async (dataContextName: string, collectionName: string, index: number) => {
  index = index || 0;
  const uniqueName = `${collectionName}${index ? index : ""}`;
  const getCollMessage = {
    "action": "get",
    "resource": `${ctxStr(dataContextName)}.collection[${uniqueName}]`
  };

  return codapInterface.sendRequest(getCollMessage, async (result: IResult) => {
    if (result.success) {
      // guard against run away loops
      if (index >= 100) {
        return undefined;
      }
      return await ensureUniqueCollectionName(dataContextName, collectionName, index + 1);
    } else {
      return uniqueName;
    }
  });
};

////////////// attribute functions //////////////

export const getAttribute = async (dataContextName: string, collectionName: string, attributeName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute[${attributeName}]`;
  return await sendMessage("get", resource);
};

export const getAttributeList = async (dataContextName: string, collectionName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attributeList`;
  return await sendMessage("get", resource);
};

export const createNewAttribute = async (dataContextName: string, collectionName: string, attributeName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute`;
  const values: CodapItemValues = {
    "name": attributeName,
    "title": attributeName,
  };
  return await sendMessage("create", resource, values);
};

export const updateAttribute = async (dataContextName: string, collectionName: string, attributeName: string, attribute: Attribute, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute[${attributeName}]`;
  return await sendMessage("update", resource, values);
};

export const updateAttributePosition = async (dataContextName: string, collectionName: string, attrName: string, newPosition: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attributeLocation[${attrName}]`;
  return await sendMessage("update", resource, {
    "collection": collectionName,
    "position": newPosition
  });
};

export const createCollectionFromAttribute = async (dataContextName: string, oldCollectionName: string, attr: Attribute, parent: string) => {
  // check if a collection for the attribute already exists
  const getCollectionMessage = createMessage("get", `${ctxStr(dataContextName)}.${collStr(attr.name)}`);

  return codapInterface.sendRequest(getCollectionMessage, async (result: IResult) => {
    // since you can't "re-parent" collections we need to create a temp top level collection, move the attribute,
    // and then check if CODAP deleted the old collection as it became empty and if so rename the new collection
    const moveCollection = result.success;
    const newCollectionName = moveCollection ? await ensureUniqueCollectionName(dataContextName, attr.name, 0) : attr.name;
    if (newCollectionName === undefined) {
      return;
    }

    const createCollectionRequest = createMessage("create", `${ctxStr(dataContextName)}.collection`, {
      "name": newCollectionName,
      "title": newCollectionName,
      parent,
    });

    return codapInterface.sendRequest(createCollectionRequest, (createCollResult: IResult) => {
      if (createCollResult.success) {
        const moveAttributeRequest = createMessage("update", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeLocation[${attr.name}]`, {
          "collection": newCollectionName,
          "position": 0
        });
        return codapInterface.sendRequest(moveAttributeRequest, (moveAttrResult: IResult) => {
          if (moveAttrResult.success) {
            if (moveCollection) {
              // check if the old collection has been
              const getAttributeListRequest = createMessage("get", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeList`);
              return codapInterface.sendRequest(getAttributeListRequest, (getAttrResult: IResult) => {
                // CODAP deleted the old collection after we moved the attribute so rename the new collection
                if (!getAttrResult.success) {
                  const updateCollectionNameRequest = createMessage("update", `${ctxStr(dataContextName)}.collection[${newCollectionName}]`, {
                    "name": attr.name,
                    "title": attr.name,
                  });
                  return codapInterface.sendRequest(updateCollectionNameRequest);
                }
              });
            }
          }
        });
      }
    });
  });
};

////////////// case functions //////////////

export const getCaseCount = async (dataContextName: string, collectionName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseCount`;
  return await sendMessage("get", resource);
};

export const getCaseByIndex = async (dataContextName: string, collectionName: string, index: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseByIndex[${index}]`;
  return await sendMessage("get", resource);
};

export const getCaseByID = async (dataContextName: string, caseID: number | string) => {
  const resource = `${ctxStr(dataContextName)}.caseByID[${caseID}]`;
  return await sendMessage("get", resource);
};

export const getCaseBySearch = async (dataContextName: string, collectionName: string, search: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseSearch[${search}]`;
  return await sendMessage("get", resource);
};

export const getCaseByFormulaSearch = async (dataContextName: string, collectionName: string, search: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseFormulaSearch[${search}]`;
  return await sendMessage("get", resource);
};

export const createSingleOrParentCase = async (dataContextName: string, collectionName: string, values: Array<CodapItemValues>) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  return await sendMessage("create", resource, values);
};

export const createChildCase = async (dataContextName: string, collectionName: string, parentCaseID: number | string, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  const valuesWithParent = [
    {
      parent: parentCaseID,
      values
    }
  ];
  return await sendMessage("create", resource, valuesWithParent);
};

export const updateCaseById = async (dataContextName: string, caseID: number | string, values: CodapItemValues) => {
  const resource = `${ctxStr(dataContextName)}.caseByID[${caseID}]`;
  const updateValues = {
    values
  };
  return await sendMessage("update", resource, updateValues);
};

export const updateCases = async (dataContextName: string, collectionName: string, values: CodapItem[]) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.case`;
  return await sendMessage("update", resource, values);
};

export const selectCases = async (dataContextName: string, caseIds: string[]) => {
  return await sendMessage("create", `${ctxStr(dataContextName)}.selectionList`, caseIds);
};

////////////// item functions //////////////

export const getItemCount = async (dataContextName: string) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.itemCount`);
};

export const getAllItems = async (dataContextName: string) =>{
  return await sendMessage("get", `${ctxStr(dataContextName)}.itemSearch[*]`);
};

export const getItemByID = async (dataContextName: string, itemID: number | string) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.itemByID[${itemID}]`);
};

export const getItemByIndex = async (dataContextName: string, index: number) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.item[${index}]`);
};

export const getItemByCaseID = async (dataContextName: string, caseID: number | string) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.itemByCaseID[${caseID}]`);
};

export const getItemBySearch = async (dataContextName: string, search: string) => {
  return await sendMessage("get", `${ctxStr(dataContextName)}.itemSearch[${search}]`);
};

export const createItems = async (dataContextName: string, items: Array<CodapItemValues>) => {
  return await sendMessage("create", `${ctxStr(dataContextName)}.item`, items);
};

export const updateItemByID = async (dataContextName: string, itemID: number | string, values: CodapItemValues) => {
  return await sendMessage("update", `${ctxStr(dataContextName)}.itemByID[${itemID}]`, values);
};

export const updateItemByIndex = async (dataContextName: string, index: number, values: CodapItemValues) => {
  return await sendMessage("update", `${ctxStr(dataContextName)}.item[${index}]`, values);
};

export const updateItemByCaseID = async (dataContextName: string, caseID: number | string, values: CodapItemValues) => {
  return await sendMessage("update", `${ctxStr(dataContextName)}.itemByCaseID[${caseID}]`, values);
};
