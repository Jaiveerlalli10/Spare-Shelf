import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

// No React.StrictMode on purpose: in development it starts, stops and restarts every effect,
// and that rapid on/off of Firestore listeners triggers a Firestore library bug
// ("INTERNAL ASSERTION FAILED") that breaks the database connection until reload.
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary label="The app">
    <App />
  </ErrorBoundary>
);
