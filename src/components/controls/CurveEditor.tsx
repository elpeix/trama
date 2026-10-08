import { useRef, type PointerEvent } from "react";
import type { CurveParamDefinition } from "../../patch/registry";
import { formatCurve, parseCurve } from "../../patch/sequence";
import { curveBaseline, curvePoint, paintCurve, type CurvePoint } from "./curve";

interface CurveEditorProps {
  definition: CurveParamDefinition;
  value: string;
  onChange: (value: string, options?: { merge?: boolean | string }) => void;
}

const HEIGHT = 100;

/**
 * A curve drawn by dragging across it, the whole drag a single undo step. Double-clicking the name
 * sets it back to its default.
 */
export function CurveEditor({ definition, value, onChange }: CurveEditorProps) {
  const { points, min, max, style, marks } = definition;
  const drawing = useRef<{ values: number[]; last: CurvePoint; name: string } | undefined>(undefined);
  const drags = useRef(0);
  const values = parseCurve(value) ?? parseCurve(definition.default)!;
  const y = (level: number) => ((max - level) / (max - min)) * HEIGHT;
  const baseline = y(curveBaseline(definition));

  const draw = (event: PointerEvent<SVGSVGElement>, first: boolean) => {
    const drag = first ? { values, name: `drag-${++drags.current}` } : drawing.current;
    if (!drag) {
      return;
    }
    const point = curvePoint(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY, definition);
    const next = paintCurve(drag.values, first ? undefined : drawing.current?.last, point, definition);
    drawing.current = { ...drag, values: next, last: point };
    onChange(formatCurve(next, definition.step), { merge: drag.name });
  };

  const stop = () => {
    drawing.current = undefined;
  };

  return (
    <div className={marks ? "curve curve-marked nodrag" : "curve nodrag"}>
      <span
        className="param-label"
        title="Double-click to reset"
        onDoubleClick={() => onChange(definition.default, { merge: false })}
      >
        {definition.label}
      </span>
      <div className="curve-plot">
        <svg
          className={`curve-editor curve-${style}`}
          role="img"
          aria-label={definition.label}
          viewBox={`0 0 ${points} ${HEIGHT}`}
          preserveAspectRatio="none"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            draw(event, true);
          }}
          onPointerMove={(event) => draw(event, false)}
          onPointerUp={stop}
          onPointerCancel={stop}
        >
          {marks?.levels.map((level) => (
            <line key={level} className="curve-mark" x1={0} x2={points} y1={y(level)} y2={y(level)} />
          ))}
          <line className="curve-baseline" x1={0} x2={points} y1={baseline} y2={baseline} />
          {style === "bars" ? (
            values.map((level, index) => (
              <rect
                key={index}
                className="curve-bar"
                x={index + 0.1}
                width={0.8}
                y={Math.min(y(level), baseline)}
                height={Math.abs(y(level) - baseline)}
              />
            ))
          ) : (
            <polyline
              className="curve-line"
              points={values.map((level, index) => `${index + 0.5},${y(level)}`).join(" ")}
            />
          )}
        </svg>
        {marks?.levels.map((level) => (
          <span
            key={level}
            className="curve-mark-label"
            aria-hidden="true"
            style={{ top: `${(y(level) / HEIGHT) * 100}%` }}
          >
            {`${level > 0 ? "+" : ""}${level} ${marks.unit}`}
          </span>
        ))}
      </div>
      {style === "bars" && (
        <div
          className={definition.labels ? "curve-numbers curve-labels" : "curve-numbers"}
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${points}, 1fr)` }}
        >
          {definition.labelEvery
            ? values.flatMap((_, index) =>
                index % definition.labelEvery! === 0
                  ? [
                      <span
                        key={index}
                        className="curve-label-across"
                        style={{ gridColumn: `${index + 1} / span ${Math.min(definition.labelEvery!, points - index)}` }}
                      >
                        {definition.labels?.[index] ?? index + 1}
                      </span>,
                    ]
                  : [],
              )
            : values.map((_, index) => <span key={index}>{definition.labels?.[index] ?? index + 1}</span>)}
        </div>
      )}
    </div>
  );
}
