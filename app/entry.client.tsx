import {StrictMode, startTransition} from "react";
import {hydrateRoot} from "react-dom/client";
import {HydratedRouter} from "react-router/dom";

const elementShape = (element: Element | null) => element ? {
  attributes: [...element.attributes].map((attribute) => attribute.name),
  children: [...element.children].map((child) => ({
    tag: child.tagName,
    attributes: [...child.attributes].map((attribute) => attribute.name),
  })),
} : null;

console.error("EcoTraceIT prehydrate shape", JSON.stringify({
  html: elementShape(document.documentElement),
  head: elementShape(document.head),
  body: elementShape(document.body),
}));

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error, errorInfo) {
        console.error("EcoTraceIT hydration recovery", error, errorInfo.componentStack);
      },
    },
  );
});
