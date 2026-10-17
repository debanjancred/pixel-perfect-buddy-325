import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders children into a body-level node that is hidden on screen and is the only thing
 * shown when printing (see `.print-portal` in styles.css). Being outside the app tree, it
 * isn't clipped by modals, scroll containers or transforms.
 */
export function PrintPortal({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = Object.assign(document.createElement("div"), { className: "print-portal" });
    document.body.appendChild(el);
    setNode(el);
    return () => el.remove();
  }, []);
  return node ? createPortal(children, node) : null;
}
