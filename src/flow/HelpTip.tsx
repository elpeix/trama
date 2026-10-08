import { useTooltip } from "../components/useTooltip";

/** A question mark that shows the help of a module while it is pointed at or focused, or kept open with a click. */
export function HelpTip({ label, text }: { label: string; text: string }) {
  const { open, triggerProps, toggle, tooltip } = useTooltip(text, { pinnable: true });

  return (
    <>
      <button
        {...triggerProps}
        type="button"
        className="module-help nodrag"
        aria-label={label}
        aria-expanded={open}
        onClick={toggle}
      >
        ?
      </button>
      {tooltip}
    </>
  );
}
