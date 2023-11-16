import {codapInterface} from "./codap-interface";

interface IDimensions {
  width: number;
  height: number;
}

export interface IItem {
  [key: string]: string|number;
}

export interface IResult {
  success: boolean;
  values: any;
}

export interface IValues {
  [key: string]: any;
}

export interface IAttributeDefinition {
  name: string;
  title?: string;
  description?: string;
  type?: string;
  formula?: string;
  editable?: boolean;
  hidden?: boolean;
  precision?: number;
  unit?: string;
  defaultMin?: number;
  defaultMax?: number;
  defaultMode?: string;
  defaultTableMode?: string;
  colormap?: string;
  categories?: string[];

}

const ctxStr = (contextName: string) => `dataContext[${contextName}]`;
const collStr = (collectionName: string) => `collection${collectionName}`;

const createMessage = (action: string, resource: string, values?: any) => {
  return {
    action,
    resource,
    values
  };
};

const sendMessage = (action: string, resource: string, values?: IValues) => {
  const message = createMessage(action, resource, values);
  return new Promise((resolve, reject) => {
    codapInterface.sendRequest(message, (result: IResult) => {
      if (!result) {
        reject('Request timeout');
      } else if (result?.success) {
        resolve(result.values);
      } else {
        const error_message = (result?.values?.error) || "unknown error";
        reject(error_message);
      }
    });
  });
};

export const initializePlugin = (pluginName: string, version: string, dimensions: IDimensions) => {
  const interfaceConfig = {
    name: pluginName,
    version,
    dimensions
  };
  return codapInterface.init(interfaceConfig);
};

export const getListOfDataContexts = () => {
  return sendMessage("get", "dataContextList");
};

export const getDataContext = (dataContextName: string) => {
  return sendMessage("get", ctxStr(dataContextName));
};

export const createDataContext = (dataContextName: string) => {
  // Determine if CODAP already has the Data Context we need.
  // If not, create it.
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
    }
  );
};

export const openTable = () => {
  codapInterface.sendRequest({
    action: "create",
    resource: "component",
    values: {
      type: "caseTable"
    }
  });
};

export const getCollectionList = (dataContextName: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.collectionList`);
};

export const getCollection = (dataContextName: string, collectionName: string) => {
 return sendMessage("get", `${ctxStr(dataContextName)}.${collStr(collectionName)}`);
};

export const createItem = (dataContextName: string, item: IItem) => {
  return sendMessage("create", `${ctxStr(dataContextName)}.item`, item);
};

export const createItems = (dataContextName: string, items: IItem[]) => {
  items.forEach(item => {
    createItem(dataContextName, item);
  });
};

export const getItemCount = (dataContextName: string) => {
  return sendMessage("get", `${ctxStr(dataContextName)}.itemCount`);
};

export const getAllItems = (dataContextName: string) =>{
  return sendMessage("get", `${ctxStr(dataContextName)}.itemSearch[*]`);
};

export const getCaseCount = (dataContextName: string, collectionName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseCount`;
  return sendMessage("get", resource);
};

export const getCaseByIndex = (dataContextName: string, collectionName: string, index: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.caseByIndex[${index}]`;
  return sendMessage("get", resource);
};

export const getCaseByID = (dataContextName: string, caseID: string) => {
  const resource = `${ctxStr(dataContextName)}.caseByID[${caseID}]`;
  return sendMessage("get", resource);
};

export const updateAttributePosition = (dataContextName: string, collectionName: string, attrName: string, newPosition: number) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attributeLocation[${attrName}]`;
  return sendMessage("update", resource, {
    "collection": collectionName,
    "position": newPosition
  });
};

export const createParentCollection = (dataContextName: string, collectionName: string, attrs?: IAttributeDefinition[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: IValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": "_root_"
  };

  if (attrs) {
    values["attrs"] = attrs;
  }

  return sendMessage("create", resource, values);
};

export const createChildCollection = (dataContextName: string, collectionName: string, parentCollectionName: string, attrs?: IAttributeDefinition[]) => {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: IValues = {
    "name": collectionName,
    "title": collectionName,
    "parent": parentCollectionName
  };

  if (attrs) {
    values["attrs"] = attrs;
  }

  return sendMessage("create", resource, values);
};

export const createNewCollection = (dataContextName: string, collectionName: string, attrs?: IAttributeDefinition[]) =>  {
  const resource = `${ctxStr(dataContextName)}.collection`;

  const values: IValues = {
    "name": collectionName,
    "title": collectionName,
  };

  if (attrs) {
    values["attrs"] = attrs;
  }

  return sendMessage("create", resource, values);
};

export const ensureUniqueCollectionName = (dataContextName: string, collectionName: string, index: number) => {
  index = index || 0;
  const uniqueName = `${collectionName}${index ? index : ""}`;
  const getCollection = {
    "action": "get",
    "resource": `${ctxStr(dataContextName)}.collection[${uniqueName}]`
  };

  return codapInterface.sendRequest(getCollection, (result: IResult) => {
    if (result.success) {
      // guard against run away loops
      if (index >= 100) {
        return undefined;
      }
      return ensureUniqueCollectionName(dataContextName, collectionName, index + 1);
    } else {
      return uniqueName;
    }
  });
};

export const createCollectionFromAttribute = (dataContextName: string, oldCollectionName: string, attr: IAttributeDefinition, parent: string) => {
  // check if a collection for the attribute already exists
  const getCollection = createMessage("get", `${ctxStr(dataContextName)}.${collStr(attr.name)}`);

  return codapInterface.sendRequest(getCollection, (result: IResult) => {
    // since you can't "re-parent" collections we need to create a temp top level collection, move the attribute,
    // and then check if CODAP deleted the old collection as it became empty and if so rename the new collection
    const moveCollection = result.success;
    const newCollectionName = moveCollection ? ensureUniqueCollectionName(dataContextName, attr.name, 0) : attr.name;
    if (newCollectionName === undefined) {
      return;
    }

    const createCollectionRequest = createMessage("create", `${ctxStr(dataContextName)}.collection`, {
      "name": newCollectionName,
      "title": newCollectionName,
      "parent": parent,
    });

    return codapInterface.sendRequest(createCollectionRequest, (result: IResult) => {
      if (!result.success) {
        return;
      } else {
        const moveAttributeRequest = createMessage("update", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeLocation[${attr.name}]`, {
          "collection": newCollectionName,
          "position": 0
        });
        return codapInterface.sendRequest(moveAttributeRequest, (result: IResult) => {
          if (!result.success) {
            return;
          } else {
            if (moveCollection) {
              // check if the old collection has been
              const getAttributeListRequest = createMessage("get", `${ctxStr(dataContextName)}.${collStr(oldCollectionName)}.attributeList`);
              return codapInterface.sendRequest(getAttributeListRequest, (result: IResult) => {
                // CODAP deleted the old collection after we moved the attribute so rename the new collection
                if (!result.success) {
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

export const createNewAttribute = (dataContextName: string, collectionName: string, attributeName: string) => {
  const resource = `${ctxStr(dataContextName)}.${collStr(collectionName)}.attribute`;
  const values: IValues = {
    "name": attributeName,
    "title": attributeName,
  };
  return sendMessage("create", resource, values);
};


// Selects this component. In CODAP this will bring this component to the front.
export const selectSelf = () => {
  let myCODAPId = null;

  const selectComponent = async function (id: number) {
    return codapInterface.sendRequest({
      action: "notify",
      resource:  `component[${id}]`,
      values: {request: "select"}
    }, (result: IResult) => {
      if (!result.success) {
        console.log("selectSelf failed");
      }
    });
  }

  if (myCODAPId == null) {
    codapInterface.sendRequest({action: 'get', resource: 'interactiveFrame'}, (result: IResult) => {
      if (result.success) {
        myCODAPId = result.values.id;
        return selectComponent(myCODAPId);
      }
    });
  }
};

export const selectCases = (dataContextName: string, caseIds: string[]) => {
  return sendMessage("create", `${ctxStr(dataContextName)}.selectionList`, caseIds);
};

// static addDataContextsListListener(callback: ClientHandler) {
//   codapInterface.on("notify", "documentChangeNotice", callback);
// }

// static addDataContextChangeListener(context: DataContext, callback: ClientHandler) {
//   codapInterface.on("notify", `dataContextChangeNotice[${context.name}]`, callback);
// }

// static async addCollections(dataContextName: string, collections: Collection[]) {
//   const result = await codapInterface.sendRequest({
//     action: "create",
//     resource: dataContextResource(dataContextName, "collection"),
//     values: collections
//   }) as CodapRequestResponse;
//   return result && result.success ? result.values : null;
// }

// update item
// remove item