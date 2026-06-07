import React from "react";

const metrics = [
  { value: "01", label: "Fresh Vite scaffold" },
  { value: "02", label: "React 19 + TypeScript" },
  { value: "03", label: "Catalyst-ready structure" },
];

const stack = ["Vite", "React", "TypeScript", "Catalyst"];

export default function App() {
  return React.createElement(
    "main",
    { className: "app-shell" },
    React.createElement(
      "section",
      { className: "hero" },
      React.createElement(
        "div",
        { className: "hero-copy" },
        React.createElement("p", { className: "eyebrow" }, "Datathon KSP"),
        React.createElement(
          "h1",
          null,
          "Fast client bootstrap, rebuilt on Vite.",
        ),
        React.createElement(
          "p",
          { className: "lede" },
          "The old Create React App scaffold has been replaced with a lean, modern starter that is easier to maintain, faster to run, and ready for future UI work.",
        ),
        React.createElement(
          "div",
          { className: "actions" },
          React.createElement(
            "a",
            { className: "primary-button", href: "https://vite.dev/guide/" },
            "Vite guide",
          ),
          React.createElement(
            "a",
            { className: "secondary-button", href: "https://react.dev/learn" },
            "React docs",
          ),
        ),
      ),
      React.createElement(
        "aside",
        { className: "info-panel" },
        React.createElement(
          "div",
          { className: "panel-header" },
          React.createElement("span", null, "Current stack"),
          React.createElement("span", null, "Ready"),
        ),
        React.createElement(
          "ul",
          { className: "stack-list" },
          ...stack.map((item) =>
            React.createElement("li", { key: item }, item),
          ),
        ),
      ),
    ),
    React.createElement(
      "section",
      { className: "metrics" },
      ...metrics.map((metric) =>
        React.createElement(
          "article",
          { className: "metric-card", key: metric.label },
          React.createElement("strong", null, metric.value),
          React.createElement("span", null, metric.label),
        ),
      ),
    ),
  );
}
