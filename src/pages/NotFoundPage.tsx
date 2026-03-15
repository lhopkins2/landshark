import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--ls-bg)",
        padding: "var(--ls-space-lg)",
      }}
    >
      <h1
        style={{
          fontSize: "6rem",
          fontWeight: 700,
          color: "var(--ls-primary)",
          lineHeight: 1,
        }}
      >
        404
      </h1>
      <p
        style={{
          fontSize: "var(--ls-text-lg)",
          color: "var(--ls-text-muted)",
          marginTop: "var(--ls-space-md)",
          marginBottom: "var(--ls-space-xl)",
        }}
      >
        Page not found
      </p>
      <Link
        to="/"
        style={{
          padding: "10px 24px",
          borderRadius: "var(--ls-radius-md)",
          backgroundColor: "var(--ls-primary)",
          color: "var(--ls-text-on-primary)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
