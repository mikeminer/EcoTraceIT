import {StrictMode, startTransition} from "react";
import {hydrateRoot} from "react-dom/client";
import {HydratedRouter} from "react-router/dom";

const removeInjectedExtensionNodes = () => {
  document
    .querySelectorAll<HTMLElement>(
      'script[src^="chrome-extension://"], link[href^="chrome-extension://"]',
    )
    .forEach((node) => node.remove());
};

// Wallet extensions can inject nodes directly under <html> before React starts.
// Removing only extension-owned bootstrap nodes preserves the server DOM and
// prevents React from discarding the whole embedded app during hydration.
removeInjectedExtensionNodes();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
});
