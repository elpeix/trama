import { BaseEdge, EdgeLabelRenderer, getBezierPath, useNodes, type EdgeProps } from "@xyflow/react";
import { useMemo } from "react";
import { AMOUNT, controlKey } from "../patch/automation";
import { usePatchStore } from "../store/usePatchStore";
import { AmountControl } from "./AmountControl";
import { labelPosition, type Rect } from "./edgeGeometry";

const LABEL_SIZE = { width: 64, height: 24 };

export function ControlEdge({ id, data, ...props }: EdgeProps) {
  const setConnectionAmount = usePatchStore((state) => state.setConnectionAmount);
  const control = usePatchStore((state) => controlKey([...state.path, id].join("/"), AMOUNT));
  const nodes = useNodes();
  const obstacles = useMemo(
    () =>
      nodes.flatMap((node): Rect[] =>
        node.measured?.width && node.measured.height
          ? [{ ...node.position, width: node.measured.width, height: node.measured.height }]
          : [],
      ),
    [nodes],
  );
  const [path] = getBezierPath(props);
  const [labelX, labelY] = labelPosition(props, obstacles, LABEL_SIZE);

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={props.markerEnd} style={props.style} />
      <EdgeLabelRenderer>
        <div
          className="edge-label"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          <AmountControl
            value={Number(data?.amount ?? 1)}
            onChange={(amount, options) => setConnectionAmount(id, amount, options)}
            control={control}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
