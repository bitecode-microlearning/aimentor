
  import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const isCardPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get("preview") === "cards";

if (isCardPreview) {
  import("./dev/CardPreview.tsx").then(({ CardPreview }) => {
    root.render(<CardPreview />);
  });
} else {
  root.render(<App />);
}
  
