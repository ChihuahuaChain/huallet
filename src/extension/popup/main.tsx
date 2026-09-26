import "./polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/index.css";
import { PopupApp } from "./App";
import { extView } from "./view";

document.documentElement.dataset.view = extView();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);
