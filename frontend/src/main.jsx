import React from "react";
import ReactDOM from "react-dom/client";
import Dashboard from "./components/Dashboard";
import { ToastProvider } from "./components/ToastProvider";
import { LoggerProvider } from "./components/LoggerProvider";
import LogConsole from "./components/LogConsole";
import AppHeader from "./components/AppHeader";
import "../index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LoggerProvider>
      <ToastProvider>
        <AppHeader />
        <Dashboard />
        <LogConsole />
      </ToastProvider>
    </LoggerProvider>
  </React.StrictMode>
);
