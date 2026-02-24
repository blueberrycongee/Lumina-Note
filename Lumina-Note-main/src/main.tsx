import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";
import "katex/dist/katex.min.css";

if (import.meta.env.DEV) {
  import("@/perf/devPerfMonitor")
    .then(({ bootstrapDevPerfMonitor }) => {
      bootstrapDevPerfMonitor();
    })
    .catch((error) => {
      console.warn("[perf/dev] failed to bootstrap monitor:", error);
    });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
