import { createRoot } from "react-dom/client";
import App from "./ui/App";
import { isNative } from "./platform";
import "./styles.css";

createRoot(document.getElementById("app")!).render(<App />);

// Offline cache. New versions activate right away and are used from the next launch.
if ("serviceWorker" in navigator && !import.meta.env.DEV && !isNative)
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then((reg) => {
      const activate = (w: ServiceWorker | null) => w?.postMessage({ type: "SKIP_WAITING" });
      activate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => w.state === "installed" && activate(w));
      });
    })
    .catch(() => undefined);
