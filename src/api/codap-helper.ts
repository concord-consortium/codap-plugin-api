import {codapInterface} from "./codap-interface";

export interface IItem {
  [key: string]: string|number;
}

export function initializePlugin(pluginName: string, version: string, dimensions: {width: number, height: number}) {
  const interfaceConfig = {
    name: pluginName,
    version: version,
    dimensions: dimensions
  };
  return codapInterface.init(interfaceConfig);
}

const dataSetString = (contextName: string) => `dataContext[${contextName}]`;

export function createDataContext(dataContextName: string) {
  // Determine if CODAP already has the Data Context we need.
  // If not, create it.
  return codapInterface.sendRequest({
      action:'get',
      resource: dataSetString(dataContextName)
      }, function (result: { success: any; }) {
      if (result && !result.success) {
        codapInterface.sendRequest({
          action: 'create',
          resource: 'dataContext',
          values: {
            name: dataContextName,
            collections: [
              {
                name: 'items',
                labels: {
                  pluralCase: "items",
                  setOfCasesWithArticle: "an item"
                },
                attrs: [{name: "value"}]
              }
            ]
          }
        });
      }
    }
  );
}

export function openTable() {
  codapInterface.sendRequest({
    action: 'create',
    resource: 'component',
    values: {
      type: 'caseTable'
    }
  });
}

export function addData(dataContextName: string, data: number[]) {
  const values = data.map(d => ({value: d}));
  codapInterface.sendRequest({
    action: 'create',
    resource: `${dataSetString(dataContextName)}.item`,
    values
  });
}

export function createItem(dataContextName: string, item: IItem) {
  codapInterface.sendRequest({
    action: 'create',
    resource: `${dataSetString(dataContextName)}.item`,
    values: item
  });
}

export function createItems(dataContextName: string, items: IItem[]) {
  items.forEach(item => {
    createItem(dataContextName, item);
  })
}