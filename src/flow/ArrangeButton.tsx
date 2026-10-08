import { ControlButton, useReactFlow, useStoreApi } from "@xyflow/react";
import { usePatchStoreApi } from "../store/usePatchStore";
import { arrangeGraph } from "./arrange";

const DEFAULT_ASPECT = 16 / 9;

export function ArrangeButton() {
  const store = usePatchStoreApi();
  const flow = useStoreApi();
  const { fitView } = useReactFlow();

  const arrange = () => {
    const { nodes, connections, nodeViews } = store.getState();
    const { width, height } = flow.getState();
    const sizes = Object.fromEntries(
      Object.entries(nodeViews).flatMap(([id, view]) => (view.measured ? [[id, view.measured]] : [])),
    );
    const aspect = width > 0 && height > 0 ? width / height : DEFAULT_ASPECT;
    store.getState().moveNodes(arrangeGraph({ nodes, connections }, sizes, aspect));
    requestAnimationFrame(() => void fitView());
  };

  return (
    <ControlButton onClick={arrange} title="Arrange the modules along the signal" aria-label="Arrange modules">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M2 4h8v8H2zM12 4h8v8h-8zM24 12h6v8h-6zM2 16h8v8H2zM12 16h8v8h-8z" />
      </svg>
    </ControlButton>
  );
}
