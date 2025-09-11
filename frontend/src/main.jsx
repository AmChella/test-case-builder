import React from "react";
import ReactDOM from "react-dom/client";
import Dashboard from "./components/Dashboard";
import { ToastProvider } from "./components/ToastProvider";
import "../index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ToastProvider>
      <Dashboard />
    </ToastProvider>
  </React.StrictMode>
);
