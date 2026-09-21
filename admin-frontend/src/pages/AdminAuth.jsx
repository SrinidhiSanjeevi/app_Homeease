import React, { useState } from "react";
import { Lock, Mail, ShieldCheck, KeyRound, ArrowLeft, ShieldAlert } from "lucide-react";

const inputStyle = (hasError) => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px 13px 42px",
  border: `1.5px solid ${hasError ? "#ef4444" : "#e2e8f0"}`,
  borderRadius: "12px",
  fontSize: "0.95rem",
  outline: "none",
  background: "white"
});

const labelStyle = {
  display: "block",
  fontWeight: 600,
  marginBottom: "7px",
  color: "#334155",
  fontSize: "0.85rem"
};

export default function AdminAuth({ onLoginSuccess, showToast }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const clearError = (field) => {
    setErrors((previous) => {
      const updated = { ...previous };
      delete updated[field];
      return updated;
    });
  };

  const validateForm = () => {
    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      newErrors.email = "Email is required";
    } else if (!emailRegex.test(normalizedEmail)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!password) {
      newErrors.password = "Password is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const completeLogin = (user, token, refreshToken) => {
    if (user?.role !== "admin") {
      showToast("This console is for administrators only.", "error");
      return;
    }

    localStorage.setItem("token", token);
    if (refreshToken) {
      localStorage.setItem("refreshToken", refreshToken);
    }
    localStorage.setItem("user", JSON.stringify(user));

    showToast("Welcome back!", "success");
    onLoginSuccess(user, token);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        showToast(data.message || "Invalid credentials", "error");
        return;
      }

      if (data.mfaRequired && data.tempToken) {
        setTempToken(data.tempToken);
        setMfaEmail(data.email || normalizedEmail);
        setMfaStep(true);
        setMfaCode("");
        setErrors({});
        showToast("Two-factor authentication required", "info");
        return;
      }

      completeLogin(data.user, data.token, data.refreshToken);
    } catch (error) {
      console.error("Admin login error:", error);
      showToast("Server connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (event) => {
    event.preventDefault();
    const cleanCode = mfaCode.trim();

    if (!cleanCode || cleanCode.length !== 6) {
      setErrors({ mfaCode: "Please enter the 6-digit authenticator code" });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tempToken, code: cleanCode })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        showToast(data.message || "Invalid 6-digit code", "error");
        setErrors({ mfaCode: data.message || "Invalid code" });
        return;
      }

      completeLogin(data.user, data.token, data.refreshToken);
    } catch (error) {
      console.error("Admin MFA verification error:", error);
      showToast("Server connection failed during verification", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f172a",
        padding: "24px"
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          background: "white",
          borderRadius: "20px",
          padding: "40px 36px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "28px" }}>
          <div
            style={{
              background: "#0f172a",
              color: "white",
              width: "38px",
              height: "38px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <ShieldAlert size={19} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#0f172a" }}>
              HomeEase Admin
            </div>
            <div style={{ fontSize: "0.78rem", color: "#64748b" }}>Internal management console</div>
          </div>
        </div>

        {mfaStep ? (
          <div>
            <button
              type="button"
              onClick={() => {
                setMfaStep(false);
                setMfaCode("");
                setErrors({});
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "transparent",
                border: "none",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: "0.88rem",
                cursor: "pointer",
                marginBottom: "20px",
                padding: 0
              }}
            >
              <ArrowLeft size={16} /> Back
            </button>

            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "#f1f5f9",
                  color: "#0f172a",
                  padding: "6px 12px",
                  borderRadius: "100px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  marginBottom: "14px"
                }}
              >
                <ShieldCheck size={16} /> TWO-FACTOR VERIFICATION
              </div>

              <p style={{ color: "#64748b", fontSize: "0.9rem", lineHeight: 1.5 }}>
                Enter the 6-digit code from your authenticator app for <strong>{mfaEmail}</strong>.
              </p>
            </div>

            <form onSubmit={handleMfaSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>6-DIGIT SECURITY CODE</label>
                <div style={{ position: "relative" }}>
                  <KeyRound
                    size={18}
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    placeholder="e.g., 123456"
                    value={mfaCode}
                    onChange={(event) => {
                      const value = event.target.value.replace(/\D/g, "");
                      setMfaCode(value);
                      if (errors.mfaCode) clearError("mfaCode");
                    }}
                    style={{ ...inputStyle(!!errors.mfaCode), letterSpacing: "4px", fontSize: "1.3rem", fontWeight: 700 }}
                  />
                </div>
                {errors.mfaCode && (
                  <span style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "6px", display: "block" }}>
                    {errors.mfaCode}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                style={{
                  width: "100%",
                  padding: "13px",
                  background: loading || mfaCode.length !== 6 ? "#94a3b8" : "#0f172a",
                  color: "white",
                  border: "none",
                  borderRadius: "12px",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  cursor: loading || mfaCode.length !== 6 ? "not-allowed" : "pointer"
                }}
              >
                {loading ? "Verifying..." : "Verify & Sign In"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={labelStyle}>EMAIL ADDRESS</label>
              <div style={{ position: "relative" }}>
                <Mail size={17} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  type="email"
                  placeholder="admin@homeease.com"
                  value={email}
                  autoComplete="email"
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (errors.email) clearError("email");
                  }}
                  style={inputStyle(!!errors.email)}
                />
              </div>
              {errors.email && (
                <span style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "4px", display: "block" }}>
                  {errors.email}
                </span>
              )}
            </div>

            <div>
              <label style={labelStyle}>PASSWORD</label>
              <div style={{ position: "relative" }}>
                <Lock size={17} style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (errors.password) clearError("password");
                  }}
                  style={inputStyle(!!errors.password)}
                />
              </div>
              {errors.password && (
                <span style={{ color: "#ef4444", fontSize: "0.8rem", marginTop: "4px", display: "block" }}>
                  {errors.password}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px",
                background: loading ? "#94a3b8" : "#0f172a",
                color: "white",
                border: "none",
                borderRadius: "12px",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                marginTop: "4px"
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
