import { Component, useState, type ReactNode } from "react";
import { issueUrl } from "../../about/release";
import "./ErrorScreens.css";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: (error: unknown) => ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, { failed: boolean; error: unknown }> {
  state = { failed: false, error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  render() {
    return this.state.failed ? this.props.fallback(this.state.error) : this.props.children;
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const detailsOf = (error: unknown) => (error instanceof Error && error.stack ? error.stack : messageOf(error));

function ErrorScreen({ title, error, children }: { title: string; error: unknown; children: ReactNode }) {
  return (
    <main className="error-screen">
      <div className="error-screen-panel">
        <h1>{title}</h1>
        {children}
        <pre className="error-screen-detail">{messageOf(error)}</pre>
      </div>
    </main>
  );
}

interface CrashScreenProps {
  error: unknown;
  onReload: () => void;
  onSave: () => void | Promise<void>;
  onStartEmpty: () => void;
}

export function CrashScreen({ error, onReload, onSave, onStartEmpty }: CrashScreenProps) {
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    try {
      await onSave();
      setSaveError(null);
    } catch (cause) {
      setSaveError(`The patch could not be saved: ${messageOf(cause)}`);
    }
  };

  return (
    <ErrorScreen title="Something went wrong" error={error}>
      <p>Trama stopped because of an error. The patch is still kept in this browser.</p>
      <p>
        Reload to go on with it. If the error comes back, save the patch as a file and start with an empty one: the
        file can be sent along with a report of the error.
      </p>
      <div className="error-screen-actions">
        <button type="button" className="hw" onClick={onReload}>
          Reload
        </button>
        <button type="button" className="hw" onClick={save}>
          Save the patch
        </button>
        <button type="button" className="hw" onClick={onStartEmpty}>
          Start with an empty patch
        </button>
        <a
          className="hw"
          href={issueUrl({ userAgent: navigator.userAgent, title: `Crash: ${messageOf(error)}`, details: detailsOf(error) })}
          target="_blank"
          rel="noreferrer"
        >
          Report the error
        </a>
      </div>
      {saveError && (
        <p role="alert" className="error-screen-alert">
          {saveError}
        </p>
      )}
    </ErrorScreen>
  );
}

export function StartFailedScreen({ error }: { error: unknown }) {
  return (
    <ErrorScreen title="Trama cannot start in this browser" error={error}>
      <p>
        It needs the Web Audio API with audio worklets, served over HTTPS. Try a recent version of Chrome, Edge, Firefox
        or Safari on a computer.
      </p>
    </ErrorScreen>
  );
}
