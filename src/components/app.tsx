import React from "react";
import { Text } from "./text";
import { useSampleText } from "../hooks/use-sample-text";

import "./app.scss";

export const App = () => {
  const sampleText = useSampleText();
  return (
    <div className="app">
      <Text text={sampleText} />
    </div>
  );
};

