import {
  Background,
  Controls,
  ReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useContext, useMemo, useRef, useState, type MouseEvent } from "react";
import { ThemeContext } from "../theme/ThemeContext";
import type { Position } from "../patch/types";
import { usePatchStore, usePatchStoreApi } from "../store/usePatchStore";
import {
  applyFlowEdgeChanges,
  applyFlowNodeChanges,
  fromFlowConnection,
  fromFlowDeletion,
  toFlowEdges,
  toFlowNodes,
  type FlowNode,
} from "./flowAdapter";
import { ArrangeButton } from "./ArrangeButton";
import { ControlEdge } from "./ControlEdge";
import { ModuleNode } from "./ModuleNode";
import { PaneMenu } from "./PaneMenu";

const nodeTypes = { module: ModuleNode };

const edgeTypes = { control: ControlEdge };

export function FlowEditor() {
  const store = usePatchStoreApi();
  const { theme } = useContext(ThemeContext);
  const [viewport] = useState(() => store.getState().editorViewport);
  const setEditorViewport = usePatchStore((state) => state.setEditorViewport);
  const patchNodes = usePatchStore((state) => state.nodes);
  const nodeViews = usePatchStore((state) => state.nodeViews);
  const connections = usePatchStore((state) => state.connections);
  const selectedConnectionIds = usePatchStore(
    (state) => state.selectedConnectionIds,
  );

  const nodes = useMemo(
    () => toFlowNodes(patchNodes, nodeViews),
    [patchNodes, nodeViews],
  );
  const edges = useMemo(
    () => toFlowEdges(connections, patchNodes, selectedConnectionIds),
    [connections, patchNodes, selectedConnectionIds],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) =>
      applyFlowNodeChanges(changes, store.getState()),
    [store],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => applyFlowEdgeChanges(changes, store.getState()),
    [store],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const ports = fromFlowConnection(connection);
      if (ports) {
        store.getState().connect(ports.source, ports.target);
      }
    },
    [store],
  );

  const onDelete = useCallback(
    (deleted: { nodes: FlowNode[]; edges: Edge[] }) =>
      store.getState().remove(fromFlowDeletion(deleted)),
    [store],
  );

  const [menuAt, setMenuAt] = useState<Position>();

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      setMenuAt({ x: event.clientX, y: event.clientY });
    },
    [],
  );

  const closeMenu = useCallback(() => setMenuAt(undefined), []);

  const moving = useRef<string>(undefined);

  const onReconnectStart = useCallback((_event: MouseEvent, edge: Edge) => {
    moving.current = edge.id;
  }, []);

  const onReconnect = useCallback(
    (edge: Edge, connection: Connection) => {
      const ports = fromFlowConnection(connection);
      if (ports) {
        store.getState().reconnect(edge.id, ports.source, ports.target);
      }
    },
    [store],
  );

  const onReconnectEnd = useCallback(() => {
    moving.current = undefined;
  }, []);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const ports = fromFlowConnection(connection);
      if (ports === null) {
        return false;
      }
      return moving.current === undefined
        ? store.getState().canConnect(ports.source, ports.target)
        : store
            .getState()
            .canReconnect(moving.current, ports.source, ports.target);
    },
    [store],
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDelete={onDelete}
        onPaneContextMenu={onPaneContextMenu}
        onReconnectStart={onReconnectStart}
        onReconnect={onReconnect}
        onReconnectEnd={onReconnectEnd}
        isValidConnection={isValidConnection}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode={["Meta", "Control"]}
        elevateNodesOnSelect={false}
        panActivationKeyCode={null}
        colorMode={theme}
        defaultViewport={viewport}
        onMoveEnd={(_event, moved) => setEditorViewport(moved)}
        minZoom={0.2}
      >
        <Background />
        <Controls>
          <ArrangeButton />
        </Controls>
      </ReactFlow>
      {menuAt && <PaneMenu at={menuAt} onClose={closeMenu} />}
    </>
  );
}
