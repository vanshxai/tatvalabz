import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

export default function AuthScope({ initialMode = "signin", onAuthenticated, onCancel, showClose = false }) {
  const [mode, setMode] = useState(initialMode === "signup" ? "signup" : "signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const title = useMemo(() => (mode === "signin" ? "Sign In" : "Create Account"), [mode]);

  useEffect(() => {
    setMode(initialMode === "signup" ? "signup" : "signin");
    setError("");
    setMessage("");
  }, [initialMode]);

  const resetStatus = () => {
    setError("");
    setMessage("");
  };

  const handleGoogleAuth = async () => {
    resetStatus();
    setBusy(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err?.message || "Google authentication failed.");
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    resetStatus();

    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        if (signInData?.session && onAuthenticated) onAuthenticated(signInData.session);
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
          },
        });
        if (signUpError) throw signUpError;
        if (signUpData?.session && onAuthenticated) {
          onAuthenticated(signUpData.session);
        } else {
          setMessage("Account created. If email verification is enabled, please verify your email and then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center px-4"
      style={{
        background: "radial-gradient(circle at top, rgba(37, 99, 235, 0.22), rgba(2, 6, 23, 0.96) 40%, rgba(2, 4, 10, 0.98) 90%)",
      }}
    >
      <div
        className="w-full max-w-md p-6"
        style={{
          background: "rgba(9, 9, 11, 0.88)",
          border: "1px solid rgba(100, 160, 220, 0.25)",
          borderRadius: "10px",
          boxShadow: "0 25px 80px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: "#6b7fa0" }}>TatvaLabz Auth Scope</p>
            {showClose && (
              <button
                type="button"
                onClick={onCancel}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  color: "#94a3b8",
                  width: "24px",
                  height: "24px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#f8fafc" }}>{title}</h1>
        </div>

        <div className="mb-4 flex rounded-sm overflow-hidden" style={{ border: "1px solid rgba(100, 160, 220, 0.2)" }}>
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              resetStatus();
            }}
            className="flex-1 py-2 text-xs font-bold tracking-wider"
            style={{
              background: mode === "signin" ? "rgba(37, 99, 235, 0.2)" : "transparent",
              color: mode === "signin" ? "#93c5fd" : "#94a3b8",
            }}
          >
            SIGN IN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              resetStatus();
            }}
            className="flex-1 py-2 text-xs font-bold tracking-wider"
            style={{
              background: mode === "signup" ? "rgba(37, 99, 235, 0.2)" : "transparent",
              color: mode === "signup" ? "#93c5fd" : "#94a3b8",
            }}
          >
            SIGN UP
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2 text-sm rounded-sm"
              style={{ background: "#020617", border: "1px solid rgba(100, 160, 220, 0.18)", color: "#e2e8f0" }}
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full px-3 py-2 text-sm rounded-sm"
            style={{ background: "#020617", border: "1px solid rgba(100, 160, 220, 0.18)", color: "#e2e8f0" }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 text-sm rounded-sm"
            style={{ background: "#020617", border: "1px solid rgba(100, 160, 220, 0.18)", color: "#e2e8f0" }}
          />
          {mode === "signup" && (
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className="w-full px-3 py-2 text-sm rounded-sm"
              style={{ background: "#020617", border: "1px solid rgba(100, 160, 220, 0.18)", color: "#e2e8f0" }}
            />
          )}

          {error && <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>}
          {message && <p className="text-xs" style={{ color: "#86efac" }}>{message}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2 text-xs font-bold tracking-[0.14em] rounded-sm"
            style={{
              background: busy ? "rgba(37, 99, 235, 0.28)" : "rgba(37, 99, 235, 0.9)",
              color: "#fff",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "PROCESSING" : mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
        </form>

        <div className="my-4 h-px" style={{ background: "rgba(148, 163, 184, 0.22)" }} />

        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={busy}
          className="w-full py-2 text-xs font-bold tracking-[0.12em] rounded-sm"
          style={{
            background: "transparent",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            color: "#cbd5e1",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          CONTINUE WITH GOOGLE
        </button>
      </div>
    </div>
  );
}
