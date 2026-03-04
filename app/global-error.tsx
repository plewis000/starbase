"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: "#0a0a0f", color: "#e2e8f0", fontFamily: "monospace", padding: "2rem" }}>
        <h1 style={{ color: "#ef4444", fontSize: "1.5rem", marginBottom: "1rem" }}>Something went wrong</h1>
        <pre style={{
          backgroundColor: "#1a1a2e",
          padding: "1rem",
          borderRadius: "0.5rem",
          overflow: "auto",
          fontSize: "0.875rem",
          border: "1px solid #334155",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {error.message}
          {error.stack && `\n\n${error.stack}`}
          {error.digest && `\n\nDigest: ${error.digest}`}
        </pre>
        <button
          onClick={reset}
          style={{
            marginTop: "1rem",
            padding: "0.5rem 1rem",
            backgroundColor: "#ef4444",
            color: "white",
            border: "none",
            borderRadius: "0.5rem",
            cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
