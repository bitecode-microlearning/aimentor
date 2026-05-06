
  import { createRoot } from "react-dom/client";
import { ConversationProvider } from "@elevenlabs/react";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <ConversationProvider>
    <App />
  </ConversationProvider>
);
  