import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setSessionIdGetter } from "@workspace/api-client-react";
import { getSessionId } from "./lib/session";

setSessionIdGetter(getSessionId);

// Register service worker for PWA / offline support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration is a progressive enhancement — silent fail is fine
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
