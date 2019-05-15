import { Provider } from "mobx-react";
import React from "react";
import ReactDOM from "react-dom";

import { AppComponent } from "./components/app";
import { createStores } from "./models/stores";

import "./index.sass";

const stores = createStores({ });

ReactDOM.render(
  <Provider stores={stores}>
    <AppComponent />
  </Provider>,
  document.getElementById("app")
);
