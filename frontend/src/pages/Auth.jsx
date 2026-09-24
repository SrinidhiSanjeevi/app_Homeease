import React, { useMemo, useState } from "react";
import Icon from "../components/Icon";
import { BrandMark } from "../components/Navbar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Keep in sync with backend/validators/authValidators.js (signupRules).
const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { id: "number", label: "One number", test: (p) => /\d/.test(p) },
];

const STRENGTH = [
  { label: "Too weak", color: "#d6334a" },
  { label: "Weak", color: "#e8743b" },
  { label: "Fair", color: "#f2a93b" },
  { label: "Good", color: "#4f9d69" },
  { label: "Strong", color: "#15703a" },
];

function scorePassword(p) {
  if (!p) return 0;
  let score = PASSWORD_RULES.filter((r) => r.test(p)).length; // 0–4
  if (p.length >= 12 && /[^A-Za-z0-9]/.test(p)) score += 1;
  return Math.min(4, Math.max(0, score - (p.length < 8 ? 1 : 0)));
}

export default function Auth({ onLoginSuccess, showToast }) {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // ── MFA STATE ──────────────────────────────────────────────
  const [mfaStep, setMfaStep] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaEmail, setMfaEmail] = useState("");

  const isSignup = tab === "signup";
  const ruleResults = useMemo(() => PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) })), [password]);
  const strength = scorePassword(password);

  const switchTab = (next) => {
    setTab(next);
    setErrors({});
    setPassword("");
    setConfirmPassword("");
  };

  const clearError = (field) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  // ── FORM VALIDATION ─────────────────────────────────────────
  const validateForm = () => {
    const next = {};
    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (isSignup) {
      if (!trimmedName) next.name = "Full name is required";
      else if (trimmedName.length < 3) next.name = "Name must be at least 3 characters";
    }

    if (!normalizedEmail) next.email = "Email is required";
    else if (!EMAIL_RE.test(normalizedEmail)) next.email = "Please enter a valid email address";

    if (!password) {
      next.password = "Password is required";
    } else if (isSignup) {
      const unmet = ruleResults.find((r) => !r.met);
      if (unmet) next.password = `Password needs: ${unmet.label.toLowerCase()}`;
      if (confirmPassword !== password) next.confirmPassword = "Passwords do not match";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ── SUBMIT LOGIN / SIGNUP ────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
    const body = isSignup
      ? { name: name.trim(), email: normalizedEmail, password }
      : { email: normalizedEmail, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (response.ok && data.success) {
        if (!isSignup) {
          // Two-Factor Authentication required (admin accounts)
          if (data.mfaRequired && data.tempToken) {
            setTempToken(data.tempToken);
            setMfaEmail(data.email || normalizedEmail);
            setMfaStep(true);
            setMfaCode("");
            setErrors({});
            showToast("Two-Factor Authentication required", "info");
            return;
          }

          localStorage.setItem("token", data.token);
          if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
          localStorage.setItem("user", JSON.stringify(data.user));

          showToast("Welcome back!", "success");
          onLoginSuccess(data.user, data.token);
        } else {
          showToast("Account created. Please sign in.", "success");
          switchTab("login");
          setName("");
        }
      } else {
        showToast(data.message || "Something went wrong", "error");
      }
    } catch (error) {
      console.error("Authentication error:", error);
      showToast("Server connection failed", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── SUBMIT MFA VERIFICATION ─────────────────────────────────
  const handleMfaSubmit = async (e) => {
    e.preventDefault();
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
        body: JSON.stringify({ tempToken, code: cleanCode }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        localStorage.setItem("token", data.token);
        if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
        localStorage.setItem("user", JSON.stringify(data.user));
        showToast("Two-Factor Authentication verified!", "success");
        onLoginSuccess(data.user, data.token);
      } else {
        showToast(data.message || "Invalid 6-digit code", "error");
        setErrors({ mfaCode: data.message || "Invalid code" });
      }
    } catch (error) {
      console.error("MFA verification error:", error);
      showToast("Server connection failed during MFA verification", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      {/* ================= VISUAL PANEL ================= */}
      <aside
        className="auth-visual"
        style={{
          backgroundImage:
            'url("https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1600&q=70")',
        }}
      >
        <div className="brand">
          <BrandMark />
          <span>HomeEase</span>
        </div>

        <div>
          <h1>Home services, done right.</h1>
          <p>Book verified electricians, plumbers, carpenters and spa experts in under a minute.</p>
          <ul className="auth-points">
            <li><Icon name="verified_user" size={22} filled /> Background-verified professionals</li>
            <li><Icon name="bolt" size={22} filled /> Same-day slots in most areas</li>
            <li><Icon name="receipt_long" size={22} filled /> Upfront prices, no hidden fees</li>
          </ul>
        </div>

        <span style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.6)" }}>© {new Date().getFullYear()} homeease.com</span>
      </aside>

      {/* ================= FORM PANEL ================= */}
      <main className="auth-form-wrap">
        <div className="auth-form">
          {mfaStep ? (
            <form onSubmit={handleMfaSubmit} noValidate>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ paddingLeft: 8, marginBottom: 16 }}
                onClick={() => {
                  setMfaStep(false);
                  setMfaCode("");
                  setErrors({});
                }}
              >
                <Icon name="arrow_back" size={18} /> Back to sign in
              </button>

              <h2>Two-step verification</h2>
              <p className="lead">
                Enter the 6-digit code from your authenticator app for <strong>{mfaEmail}</strong>.
              </p>

              <div className="form-group">
                <label htmlFor="mfa">Authentication code</label>
                <div className="input-icon">
                  <Icon name="key" size={20} />
                  <input
                    id="mfa"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={mfaCode}
                    className={errors.mfaCode ? "input-error" : ""}
                    style={{ letterSpacing: "0.3em", fontWeight: 700 }}
                    onChange={(e) => {
                      setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (errors.mfaCode) clearError("mfaCode");
                    }}
                  />
                </div>
                {errors.mfaCode && <span className="field-error">{errors.mfaCode}</span>}
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading || mfaCode.length !== 6}>
                {loading ? <Icon name="progress_activity" size={20} spin /> : "Verify and continue"}
              </button>
            </form>
          ) : (
            <>
              <h2>{isSignup ? "Create your account" : "Welcome back"}</h2>
              <p className="lead">
                {isSignup ? "It takes less than a minute." : "Sign in to book and track your services."}
              </p>

              <div className="segmented" role="tablist">
                {[
                  { id: "login", label: "Sign in" },
                  { id: "signup", label: "Sign up" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={tab === t.id ? "is-active" : ""}
                    onClick={() => switchTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} noValidate>
                {isSignup && (
                  <div className="form-group">
                    <label htmlFor="name">Full name</label>
                    <div className="input-icon">
                      <Icon name="person" size={20} />
                      <input
                        id="name"
                        type="text"
                        autoComplete="name"
                        placeholder="e.g. Priya Sharma"
                        value={name}
                        className={errors.name ? "input-error" : ""}
                        onChange={(e) => {
                          setName(e.target.value);
                          clearError("name");
                        }}
                      />
                    </div>
                    {errors.name && <span className="field-error">{errors.name}</span>}
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <div className="input-icon">
                    <Icon name="mail" size={20} />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      className={errors.email ? "input-error" : ""}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearError("email");
                      }}
                    />
                  </div>
                  {errors.email && <span className="field-error">{errors.email}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-icon">
                    <Icon name="lock" size={20} />
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      placeholder={isSignup ? "Create a strong password" : "Your password"}
                      value={password}
                      className={`has-trailing${errors.password ? " input-error" : ""}`}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearError("password");
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <Icon name={showPassword ? "visibility_off" : "visibility"} size={20} />
                    </button>
                  </div>

                  {isSignup && password && (
                    <>
                      <div className="pw-meter" aria-hidden="true">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} style={{ background: i < strength ? STRENGTH[strength].color : undefined }} />
                        ))}
                      </div>
                      <span className="field-hint" style={{ color: STRENGTH[strength].color, fontWeight: 700 }}>
                        {STRENGTH[strength].label}
                      </span>
                    </>
                  )}

                  {isSignup && (
                    <ul className="pw-rules">
                      {ruleResults.map((r) => (
                        <li key={r.id} className={r.met ? "is-met" : ""}>
                          <Icon name={r.met ? "check_circle" : "radio_button_unchecked"} size={15} filled={r.met} />
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {errors.password && <span className="field-error">{errors.password}</span>}
                </div>

                {isSignup && (
                  <div className="form-group">
                    <label htmlFor="confirm">Confirm password</label>
                    <div className="input-icon">
                      <Icon name="lock_reset" size={20} />
                      <input
                        id="confirm"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        className={errors.confirmPassword ? "input-error" : ""}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          clearError("confirmPassword");
                        }}
                      />
                    </div>
                    {errors.confirmPassword && <span className="field-error">{errors.confirmPassword}</span>}
                  </div>
                )}

                <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading} style={{ marginTop: 4 }}>
                  {loading ? (
                    <Icon name="progress_activity" size={20} spin />
                  ) : isSignup ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </button>
              </form>

              <p style={{ textAlign: "center", marginTop: 20, fontSize: "0.88rem", color: "var(--text-muted)" }}>
                {isSignup ? "Already have an account? " : "New to HomeEase? "}
                <button
                  type="button"
                  onClick={() => switchTab(isSignup ? "login" : "signup")}
                  style={{ color: "var(--brand)", fontWeight: 700, fontSize: "inherit", display: "inline" }}
                >
                  {isSignup ? "Sign in" : "Create an account"}
                </button>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
