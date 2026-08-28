import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Design system base (tokens, variables CSS, reset)
import '../design-system/tokens.css';
// Estilos específicos del proyecto Aria
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
