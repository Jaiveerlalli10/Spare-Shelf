// Catches crashes in the part of the app it wraps and shows the error instead of a blank page.
// (React needs a class component for this.)
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: "" };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Spare Shelf crashed:", error, info.componentStack);
    this.setState({ stack: info.componentStack || "" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card crash">
        <h3>Something broke here 😬</h3>
        <p className="muted">{this.props.label || "This part of the app"} hit an error. Send this to the team:</p>
        <pre className="crash-details">{String(this.state.error && (this.state.error.stack || this.state.error))}{this.state.stack}</pre>
        <button className="btn primary" onClick={() => this.setState({ error: null, stack: "" })}>Try again</button>
      </div>
    );
  }
}
