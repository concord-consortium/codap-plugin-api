import * as CodapPluginAPI from "./codap-plugin-api";

describe("CodapPluginAPI", () => {
  it("should export all the API functions", () => {
    expect(CodapPluginAPI).toBeDefined();
    expect (CodapPluginAPI.codapInterface).toBeDefined();
    expect (CodapPluginAPI.initializePlugin).toBeDefined();
    expect (CodapPluginAPI.createTable).toBeDefined();
    expect (CodapPluginAPI.selectSelf).toBeDefined();
    expect (CodapPluginAPI.addComponentListener).toBeDefined();
    expect (CodapPluginAPI.getListOfDataContexts).toBeDefined();
    expect (CodapPluginAPI.getDataContext).toBeDefined();
    expect (CodapPluginAPI.createDataContext).toBeDefined();
    expect (CodapPluginAPI.createDataContextFromURL).toBeDefined();
    expect (CodapPluginAPI.addDataContextChangeListener).toBeDefined();
    expect (CodapPluginAPI.addDataContextsListListener).toBeDefined();
    expect (CodapPluginAPI.getCollectionList).toBeDefined();
    expect (CodapPluginAPI.getCollection).toBeDefined();
    expect (CodapPluginAPI.createParentCollection).toBeDefined();
    expect (CodapPluginAPI.createChildCollection).toBeDefined();
    expect (CodapPluginAPI.createNewCollection).toBeDefined();
    expect (CodapPluginAPI.ensureUniqueCollectionName).toBeDefined();
    expect (CodapPluginAPI.getAttribute).toBeDefined();
    expect (CodapPluginAPI.getAttributeList).toBeDefined();
    expect (CodapPluginAPI.createNewAttribute).toBeDefined();
    expect (CodapPluginAPI.updateAttribute).toBeDefined();
    expect (CodapPluginAPI.updateAttributePosition).toBeDefined();
    expect (CodapPluginAPI.createCollectionFromAttribute).toBeDefined();
    expect (CodapPluginAPI.getCaseCount).toBeDefined();
    expect (CodapPluginAPI.getCaseByIndex).toBeDefined();
    expect (CodapPluginAPI.getCaseByID).toBeDefined();
    expect (CodapPluginAPI.getCaseBySearch).toBeDefined();
    expect (CodapPluginAPI.getCaseByFormulaSearch).toBeDefined();
    expect (CodapPluginAPI.createSingleOrParentCase).toBeDefined();
    expect (CodapPluginAPI.createChildCase).toBeDefined();
    expect (CodapPluginAPI.updateCaseById).toBeDefined();
    expect (CodapPluginAPI.updateCases).toBeDefined();
    expect (CodapPluginAPI.selectCases).toBeDefined();
    expect (CodapPluginAPI.getItemCount).toBeDefined();
    expect (CodapPluginAPI.getAllItems).toBeDefined();
    expect (CodapPluginAPI.getItemByID).toBeDefined();
    expect (CodapPluginAPI.getItemByIndex).toBeDefined();
    expect (CodapPluginAPI.getItemByCaseID).toBeDefined();
    expect (CodapPluginAPI.getItemBySearch).toBeDefined();
    expect (CodapPluginAPI.createItems).toBeDefined();
    expect (CodapPluginAPI.updateItemByCaseID).toBeDefined();
    expect (CodapPluginAPI.updateItemByID).toBeDefined();
    expect (CodapPluginAPI.updateItemByIndex).toBeDefined();
  });
});
