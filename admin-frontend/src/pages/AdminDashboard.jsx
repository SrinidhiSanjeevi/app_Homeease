import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Wrench,
  ShieldAlert,
  Star,
  RefreshCw,
  LogOut,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  Clock,
  XCircle,
  X,
  Save
} from "lucide-react";

const BASE = "/api/admin";

// Mirrors backend/services/booking/bookingStateMachine.js — only offer
// statuses the API will accept. "Assigned" with no professional means the
// booking is queued until a professional in that category frees up.
const BOOKING_TRANSITIONS = {
  Created: ["Assigned", "Confirmed", "Cancelled"],
  Assigned: ["Confirmed", "Cancelled"],
  Confirmed: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: []
};

const CATEGORIES = [
  "Spa",
  "Electrician",
  "Carpentry",
  "Plumbing",
  "Security",
  "Repair",
  "Cleaning"
];

// ── Reusable Modal Shell ──────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px"
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "20px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)"
        }}
      >
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #f3f4f6",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "1.1rem",
              fontWeight: 800
            }}
          >
            {title}
          </h2>

          <button
            onClick={onClose}
            style={{
              background: "#f3f4f6",
              border: "none",
              borderRadius: "8px",
              padding: "6px",
              cursor: "pointer",
              display: "flex"
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Form Field Helper ─────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <label
        style={{
          display: "block",
          fontSize: "0.82rem",
          fontWeight: 600,
          color: "#374151",
          marginBottom: "6px"
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

const inp = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "10px",
  border: "1.5px solid #e5e7eb",
  fontSize: "0.88rem",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border 0.15s"
};

const sel = {
  ...inp,
  background: "#fff",
  cursor: "pointer"
};

// ── IMAGE UPLOADER ───────────────────────────────────────────
/**
 * Drag-and-drop / click-to-upload component that POSTs the file
 * to POST /api/admin/upload?folder=<folder> and calls onUploaded
 * with { imageKey, imageUrl } on success.
 */
function ImageUploader({ currentUrl, folder = "services", onUploaded }) {
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (jpeg / png / webp / gif / avif)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be smaller than 5 MB");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token") || "";
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/admin/upload?folder=${folder}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      onUploaded(data); // { imageKey, imageUrl }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const zoneStyle = {
    border: `2px dashed ${dragging ? "#6366f1" : "#d1d5db"}`,
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
    cursor: uploading ? "not-allowed" : "pointer",
    background: dragging ? "#f0f0ff" : "#fafafa",
    transition: "all 0.2s",
    position: "relative",
    overflow: "hidden"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Current / uploaded image preview */}
      {currentUrl && (
        <div style={{ position: "relative", borderRadius: "10px", overflow: "hidden" }}>
          <img
            src={currentUrl}
            alt="Preview"
            style={{
              width: "100%",
              height: "140px",
              objectFit: "cover",
              display: "block",
              borderRadius: "10px"
            }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          {uploading && (
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(255,255,255,0.7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: "10px"
            }}>
              <div style={{
                width: "32px", height: "32px",
                border: "3px solid #6366f1",
                borderTop: "3px solid transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite"
              }} />
            </div>
          )}
        </div>
      )}

      {/* Drop zone */}
      <div
        id="image-upload-zone"
        style={zoneStyle}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {uploading ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
            <div style={{
              width: "20px", height: "20px",
              border: "2px solid #6366f1",
              borderTop: "2px solid transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }} />
            <span style={{ fontSize: "0.85rem", color: "#6366f1", fontWeight: 600 }}>Uploading to Azure…</span>
          </div>
        ) : (
          <>
            <div style={{ fontSize: "1.6rem", marginBottom: "4px" }}>☁️</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151" }}>
              {currentUrl ? "Replace image" : "Upload image"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" }}>
              Drag & drop or click • JPEG / PNG / WebP / GIF / AVIF • max 5 MB
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div style={{
          fontSize: "0.8rem", color: "#ef4444",
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: "8px", padding: "8px 12px"
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* CSS keyframe for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── SERVICE FORM ──────────────────────────────────────────────
function ServiceForm({ initial, onSave, onClose, loading }) {
  const blank = {
    name: "",
    category: "Spa",
    price: "",
    description: "",
    image: "",
    duration: ""
  };

  // Normalize: the DB record stores `imageKey`; the API response adds `imageUrl`.
  // Pre-fill the form's `image` field from whichever is available so the
  // preview renders and the correct value is sent back on save.
  const normalizeInitial = (src) => {
    if (!src) return blank;
    return {
      ...src,
      image: src.image || src.imageUrl || src.imageKey || ""
    };
  };

  const [form, setForm] = useState(normalizeInitial(initial));

  const set = (k, v) =>
    setForm((f) => ({
      ...f,
      [k]: v
    }));

  return (
    <>
      <Field label="Service Name *">
        <input
          style={inp}
          value={form.name}
          placeholder="e.g. Premium Haircut"
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="Category *">
        <select
          style={sel}
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px"
        }}
      >
        <Field label="Price (₹) *">
          <input
            style={inp}
            type="number"
            value={form.price}
            placeholder="499"
            onChange={(e) => set("price", e.target.value)}
          />
        </Field>

        <Field label="Duration *">
          <input
            style={inp}
            value={form.duration}
            placeholder="1 hour"
            onChange={(e) => set("duration", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description *">
        <textarea
          style={{
            ...inp,
            height: "80px",
            resize: "vertical"
          }}
          value={form.description}
          placeholder="Brief description of the service..."
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>

      <Field label="Image">
        <ImageUploader
          currentUrl={form.imageUrl || form.image}
          folder="services"
          onUploaded={({ imageKey, imageUrl }) => {
            setForm((f) => ({ ...f, imageKey, image: imageUrl, imageUrl }));
          }}
        />
      </Field>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "8px"
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border: "1.5px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.88rem"
          }}
        >
          Cancel
        </button>

        <button
          onClick={() => onSave(form)}
          disabled={loading}
          style={{
            flex: 2,
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: "#0f0f0f",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            opacity: loading ? 0.7 : 1
          }}
        >
          <Save size={15} />
          {loading ? "Saving..." : "Save Service"}
        </button>
      </div>
    </>
  );
}

// ── PROFESSIONAL FORM ─────────────────────────────────────────
function ProfessionalForm({ initial, onSave, onClose, loading, localities = [] }) {
  const blank = {
    name: "",
    category: "Spa",
    experience: "",
    image: "",
    status: "Available",
    locality: ""
  };

  // Normalize: the DB record stores `imageKey`; the API response adds `imageUrl`.
  // Pre-fill the form's `image` field from whichever is available so the
  // preview renders and the correct value is sent back on save.
  const normalizeInitial = (src) => {
    if (!src) return blank;
    return {
      ...src,
      image: src.image || src.imageUrl || src.imageKey || "",
      locality: src.locality || ""
    };
  };

  const [form, setForm] = useState(normalizeInitial(initial));
  const [localityError, setLocalityError] = useState("");

  const set = (k, v) =>
    setForm((f) => ({
      ...f,
      [k]: v
    }));

  return (
    <>
      <Field label="Full Name *">
        <input
          style={inp}
          value={form.name}
          placeholder="e.g. Ravi Kumar"
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field label="Category *">
        <select
          style={sel}
          value={form.category}
          onChange={(e) => set("category", e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px"
        }}
      >
        <Field label="Experience (years) *">
          <input
            style={inp}
            type="number"
            value={form.experience}
            placeholder="5"
            onChange={(e) => set("experience", e.target.value)}
          />
        </Field>

        <Field label="Status">
          <select
            style={sel}
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
          >
            <option value="Available">Available</option>
            <option value="Busy">Busy</option>
          </select>
        </Field>
      </div>

      <Field label="Service Locality *">
        <select
          style={{ ...sel, borderColor: localityError ? "#ef4444" : undefined }}
          value={form.locality}
          onChange={(e) => {
            set("locality", e.target.value);
            setLocalityError("");
          }}
        >
          <option value="">Select base area (Gachibowli, Hyderabad)</option>
          {localities.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
        <div style={{ fontSize: "0.74rem", color: localityError ? "#dc2626" : "#6b7280", marginTop: "4px" }}>
          {localityError || "Jobs are assigned to the nearest available professional within the service area."}
        </div>
      </Field>

      <Field label="Profile Image">
        <ImageUploader
          currentUrl={form.imageUrl || form.image}
          folder="professionals"
          onUploaded={({ imageKey, imageUrl }) => {
            setForm((f) => ({ ...f, imageKey, image: imageUrl, imageUrl }));
          }}
        />
      </Field>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginTop: "8px"
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "10px",
            border: "1.5px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "0.88rem"
          }}
        >
          Cancel
        </button>

        <button
          onClick={() => {
            if (!form.locality) {
              setLocalityError("Choose a service locality — without one this professional never receives jobs.");
              return;
            }
            onSave(form);
          }}
          disabled={loading}
          style={{
            flex: 2,
            padding: "12px",
            borderRadius: "10px",
            border: "none",
            background: "#0f0f0f",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: "0.88rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            opacity: loading ? 0.7 : 1
          }}
        >
          <Save size={15} />
          {loading ? "Saving..." : "Save Professional"}
        </button>
      </div>
    </>
  );
}

// ── MAIN ADMIN DASHBOARD ──────────────────────────────────────
export default function AdminDashboard({ token, user, onLogout }) {
  const [activeSection, setActiveSection] = useState("overview");
  const [stats, setStats] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const [serviceModal, setServiceModal] = useState(null);
  const [profModal, setProfModal] = useState(null);
  const [localities, setLocalities] = useState([]);

  const headers = {
    Authorization: `Bearer ${token}`
  };

  const jsonHeaders = {
    ...headers,
    "Content-Type": "application/json"
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });

    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const fetchStats = async () => {
    try {
      const r = await fetch(`${BASE}/stats`, { headers });
      const d = await r.json();

      if (d.success) {
        setStats(d.stats);
        setRecentBookings(d.recentBookings || []);
      }
    } catch (error) {
      console.error("FETCH STATS ERROR:", error);
      showToast("Failed to load statistics", "error");
    }
  };

  const fetchUsers = async () => {
    try {
      const r = await fetch(`${BASE}/users`, { headers });
      const d = await r.json();

      if (d.success) {
        setUsers(d.users || []);
      }
    } catch (error) {
      console.error("FETCH USERS ERROR:", error);
      showToast("Failed to load users", "error");
    }
  };

  const fetchBookings = async () => {
    try {
      const r = await fetch(`${BASE}/bookings`, { headers });
      const d = await r.json();

      if (d.success) {
        setBookings(d.bookings || []);
      }
    } catch (error) {
      console.error("FETCH BOOKINGS ERROR:", error);
      showToast("Failed to load bookings", "error");
    }
  };

  const fetchServices = async () => {
    try {
      const r = await fetch(`${BASE}/services`, { headers });
      const d = await r.json();

      if (d.success) {
        setServices(d.services || []);
      }
    } catch (error) {
      console.error("FETCH SERVICES ERROR:", error);
      showToast("Failed to load services", "error");
    }
  };

  const fetchProfessionals = async () => {
    try {
      const r = await fetch(`${BASE}/professionals`, { headers });
      const d = await r.json();

      if (d.success) {
        setProfessionals(d.professionals || []);
      }
    } catch (error) {
      console.error("FETCH PROFESSIONALS ERROR:", error);
      showToast("Failed to load professionals", "error");
    }
  };

  const fetchServiceArea = async () => {
    try {
      const r = await fetch(`${BASE}/service-area`, { headers });
      const d = await r.json();

      if (d.success) {
        setLocalities(d.serviceArea?.localities || []);
      }
    } catch (error) {
      console.error("FETCH SERVICE AREA ERROR:", error);
    }
  };

  const fetchEmergencies = async () => {
    try {
      const r = await fetch(`${BASE}/emergencies`, { headers });
      const d = await r.json();

      if (d.success) {
        setEmergencies(d.emergencies || []);
      }
    } catch (error) {
      console.error("FETCH EMERGENCIES ERROR:", error);
      showToast("Failed to load emergencies", "error");
    }
  };

  const loadAll = async () => {
    setLoading(true);

    await Promise.all([
      fetchStats(),
      fetchUsers(),
      fetchBookings(),
      fetchServices(),
      fetchProfessionals(),
      fetchEmergencies(),
      fetchServiceArea()
    ]);

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  // ── USER delete ─────────────────────────────────────────────
  const handleDeleteUser = async (id) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) {
      return;
    }

    try {
      const r = await fetch(`${BASE}/users/${id}`, {
        method: "DELETE",
        headers
      });

      const d = await r.json();

      if (d.success) {
        showToast("User deleted");
        await Promise.all([fetchUsers(), fetchStats()]);
      } else {
        showToast(d.message || "Failed to delete user", "error");
      }
    } catch (error) {
      console.error("DELETE USER ERROR:", error);
      showToast("Server error", "error");
    }
  };

  // ── BOOKING status ──────────────────────────────────────────
  const handleStatusChange = async (id, status) => {
    try {
      const r = await fetch(`${BASE}/bookings/${id}/status`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ status })
      });

      const d = await r.json();

      if (d.success) {
        showToast(`Marked as ${status}`);
        await Promise.all([fetchBookings(), fetchStats()]);
      } else {
        showToast(d.message || "Failed to update booking", "error");
      }
    } catch (error) {
      console.error("UPDATE BOOKING STATUS ERROR:", error);
      showToast("Server error", "error");
    }
  };

  // ── SERVICE CRUD ────────────────────────────────────────────
  const handleSaveService = async (form) => {
    setFormLoading(true);

    const isEdit =
      typeof serviceModal === "object" &&
      serviceModal?._id;

    const url = isEdit
      ? `${BASE}/services/${serviceModal._id}`
      : `${BASE}/services`;

    const method = isEdit ? "PUT" : "POST";

    try {
      const r = await fetch(url, {
        method,
        headers: jsonHeaders,
        body: JSON.stringify({
          ...form,
          price: Number(form.price)
        })
      });

      const d = await r.json();

      if (d.success) {
        showToast(d.message);
        setServiceModal(null);

        await Promise.all([
          fetchServices(),
          fetchStats()
        ]);
      } else {
        showToast(d.message || "Service operation failed", "error");

        if (r.status === 404) {
          setServiceModal(null);
          fetchServices();
        }
      }
    } catch (error) {
      console.error("SAVE SERVICE ERROR:", error);
      showToast("Server error", "error");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteService = async (id) => {
    if (!window.confirm("Delete this service?")) {
      return;
    }

    try {
      const r = await fetch(`${BASE}/services/${id}`, {
        method: "DELETE",
        headers
      });

      const d = await r.json();

      if (d.success) {
        showToast("Service deleted");

        await Promise.all([
          fetchServices(),
          fetchStats()
        ]);
      } else {
        showToast(d.message || "Failed to delete service", "error");
      }
    } catch (error) {
      console.error("DELETE SERVICE ERROR:", error);
      showToast("Server error", "error");
    }
  };

  // ── PROFESSIONAL CRUD ───────────────────────────────────────
  const handleSaveProf = async (form) => {
    setFormLoading(true);

    const isEdit =
      typeof profModal === "object" &&
      profModal?._id;

    const url = isEdit
      ? `${BASE}/professionals/${profModal._id}`
      : `${BASE}/professionals`;

    const method = isEdit ? "PUT" : "POST";

    try {
      const r = await fetch(url, {
        method,
        headers: jsonHeaders,
        body: JSON.stringify({
          ...form,
          experience: Number(form.experience)
        })
      });

      const d = await r.json();

      if (d.success) {
        showToast(d.message);
        setProfModal(null);

        await Promise.all([
          fetchProfessionals(),
          fetchStats()
        ]);
      } else {
        showToast(
          d.message || "Professional operation failed",
          "error"
        );

        if (r.status === 404) {
          setProfModal(null);
          fetchProfessionals();
        }
      }
    } catch (error) {
      console.error("SAVE PROFESSIONAL ERROR:", error);
      showToast("Server error", "error");
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteProf = async (id) => {
    if (!window.confirm("Delete this professional?")) {
      return;
    }

    try {
      const r = await fetch(`${BASE}/professionals/${id}`, {
        method: "DELETE",
        headers
      });

      const d = await r.json();

      if (d.success) {
        showToast("Professional deleted");

        await Promise.all([
          fetchProfessionals(),
          fetchStats()
        ]);
      } else {
        showToast(
          d.message || "Failed to delete professional",
          "error"
        );
      }
    } catch (error) {
      console.error("DELETE PROFESSIONAL ERROR:", error);
      showToast("Server error", "error");
    }
  };

  const handleToggleProfStatus = async (prof) => {
    const newStatus = prof.status === "Available" ? "Busy" : "Available";
    try {
      const r = await fetch(`${BASE}/professionals/${prof._id}`, {
        method: "PUT",
        headers: jsonHeaders,
        body: JSON.stringify({ status: newStatus })
      });
      const d = await r.json();
      if (r.ok && d.success) {
        showToast(`Marked ${prof.name} as ${newStatus}`);
        fetchProfessionals();
      } else {
        showToast(d.message || "Failed to update status", "error");
      }
    } catch (_err) {
      showToast("Server error updating professional status", "error");
    }
  };

  // ── Helpers ─────────────────────────────────────────────────
  const statusColor = (s) =>
  ({
    Created: "#6b7280",
    Assigned: "#f59e0b",
    Confirmed: "#3b82f6",
    Completed: "#10b981",
    Cancelled: "#ef4444"
  }[s] || "#6b7280");

  const statusIcon = (s) =>
    ({
      Created: <Clock size={13} />,
      Assigned: <Clock size={13} />,
      Confirmed: <CheckCircle size={13} />,
      Completed: <Star size={13} />,
      Cancelled: <XCircle size={13} />,
      pending: <Clock size={13} />,
      confirmed: <CheckCircle size={13} />,
      completed: <Star size={13} />,
      cancelled: <XCircle size={13} />
    }[s] || <Clock size={13} />);

  const navItems = [
    {
      id: "overview",
      label: "Overview",
      icon: LayoutDashboard
    },
    {
      id: "users",
      label: "Users",
      icon: Users
    },
    {
      id: "bookings",
      label: "Bookings",
      icon: Calendar
    },
    {
      id: "services",
      label: "Services",
      icon: Wrench
    },
    {
      id: "professionals",
      label: "Professionals",
      icon: Star
    },
    {
      id: "emergencies",
      label: "Emergencies",
      icon: ShieldAlert
    }
  ];

  const ActionBtn = ({
    onClick,
    color,
    bg,
    icon: Icon,
    label
  }) => (
    <button
      onClick={onClick}
      style={{
        background: bg,
        color,
        border: "none",
        padding: "6px 10px",
        borderRadius: "8px",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "0.78rem",
        fontWeight: 600
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#f8f9fa",
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        style={{
          width: "240px",
          background: "#0f0f0f",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: 200
        }}
      >
        <div
          style={{
            padding: "24px 20px",
            borderBottom: "1px solid #222"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg,#fff,#d1d5db)",
                color: "#000",
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Sparkles size={18} />
            </div>

            <div>
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 800
                }}
              >
                HomeEase
              </div>

              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#888",
                  fontWeight: 500
                }}
              >
                ADMIN PANEL
              </div>
            </div>
          </div>
        </div>

        <nav
          style={{
            flex: 1,
            padding: "16px 12px",
            overflowY: "auto"
          }}
        >
          {navItems.map(
            ({ id, label, icon: Icon }) => {
              const active = activeSection === id;

              return (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    marginBottom: "4px",
                    background: active
                      ? "#fff"
                      : "transparent",
                    color: active
                      ? "#000"
                      : "#999",
                    fontWeight: active
                      ? 700
                      : 500,
                    fontSize: "0.88rem",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s"
                  }}
                >
                  <Icon size={17} />
                  {label}
                </button>
              );
            }
          )}
        </nav>

        <div
          style={{
            padding: "16px 12px",
            borderTop: "1px solid #222"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "10px"
            }}
          >
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "50%",
                background: "#333",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "#fff"
              }}
            >
              {user?.name?.substring(0, 2).toUpperCase() ||
                "AD"}
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 700
                }}
              >
                {user?.name}
              </div>

              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#888"
                }}
              >
                Administrator
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              borderRadius: "8px",
              background: "transparent",
              border: "1px solid #333",
              color: "#888",
              cursor: "pointer",
              fontSize: "0.82rem",
              fontWeight: 500,
              transition: "all 0.15s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background =
                "#1a1a1a";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background =
                "transparent";
              e.currentTarget.style.color = "#888";
            }}
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main
        style={{
          marginLeft: "240px",
          flex: 1,
          padding: "32px",
          minHeight: "100vh"
        }}
      >
        {/* Toast */}
        {toast && (
          <div
            style={{
              position: "fixed",
              top: "20px",
              right: "20px",
              zIndex: 9999,
              background:
                toast.type === "error"
                  ? "#ef4444"
                  : "#10b981",
              color: "#fff",
              padding: "12px 20px",
              borderRadius: "12px",
              fontWeight: 600,
              fontSize: "0.9rem",
              boxShadow:
                "0 4px 20px rgba(0,0,0,0.2)",
              animation: "slideIn 0.2s ease"
            }}
          >
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px"
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.8rem",
                fontWeight: 800,
                margin: 0,
                color: "#0f0f0f"
              }}
            >
              {
                navItems.find(
                  (n) => n.id === activeSection
                )?.label
              }
            </h1>

            <p
              style={{
                margin: "4px 0 0",
                color: "#6b7280",
                fontSize: "0.9rem"
              }}
            >
              HomeEase Admin Control Panel
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px"
            }}
          >
            {activeSection === "services" && (
              <button
                onClick={() =>
                  setServiceModal("add")
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "12px",
                  background: "#0f0f0f",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                  fontWeight: 700
                }}
              >
                <Plus size={15} />
                Add Service
              </button>
            )}

            {activeSection === "professionals" && (
              <button
                onClick={() =>
                  setProfModal("add")
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 18px",
                  borderRadius: "12px",
                  background: "#0f0f0f",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.88rem",
                  fontWeight: 700
                }}
              >
                <Plus size={15} />
                Add Professional
              </button>
            )}

            <button
              onClick={loadAll}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "12px",
                background: "#f3f4f6",
                color: "#374151",
                border: "none",
                cursor: "pointer",
                fontSize: "0.88rem",
                fontWeight: 600
              }}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 0",
              color: "#6b7280"
            }}
          >
            <div
              style={{
                fontSize: "2.5rem",
                marginBottom: "12px"
              }}
            >
              ⏳
            </div>

            <p>Loading admin data...</p>
          </div>
        ) : (
          <>
            {/* ── OVERVIEW ──────────────────────────────── */}
            {activeSection === "overview" &&
              stats && (
                <div>
                  {/* Separate, visibly distinct box so an admin can't
                      miss active emergencies without scrolling into the
                      Emergencies tab. Only rendered when there's
                      something to act on. */}
                  {stats.activeEmergencies > 0 && (
                    <div
                      onClick={() => setActiveSection("emergencies")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        background: "#fef2f2",
                        border: "2px solid #fca5a5",
                        borderRadius: "16px",
                        padding: "18px 22px",
                        marginBottom: "20px",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ fontSize: "1.8rem" }}>🚨</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, color: "#b91c1c", fontSize: "1rem" }}>
                          {stats.activeEmergencies} Active Emergency{" "}
                          {stats.activeEmergencies === 1 ? "Request" : "Requests"} — Needs Attention
                        </div>
                        <div style={{ fontSize: "0.82rem", color: "#991b1b", marginTop: "2px" }}>
                          Click to review dispatched / en route / arrived emergencies.
                        </div>
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(160px,1fr))",
                      gap: "16px",
                      marginBottom: "28px"
                    }}
                  >
                    {[
                      {
                        label: "Users",
                        value: stats.totalUsers,
                        icon: "👥",
                        color: "#3b82f6"
                      },
                      {
                        label: "All Bookings",
                        value: stats.totalBookings,
                        icon: "📋",
                        color: "#8b5cf6"
                      },
                      {
                        label: "Pending",
                        value: stats.pendingBookings,
                        icon: "⏳",
                        color: "#f59e0b"
                      },
                      {
                        label: "Completed",
                        value: stats.completedBookings,
                        icon: "✅",
                        color: "#10b981"
                      },
                      {
                        label: "Revenue",
                        value: `₹${(
                          stats.totalRevenue || 0
                        ).toLocaleString("en-IN")}`,
                        icon: "💰",
                        color: "#10b981"
                      },
                      {
                        label: "Services",
                        value: stats.totalServices,
                        icon: "🛠",
                        color: "#f59e0b"
                      },
                      {
                        label: "Professionals",
                        value:
                          stats.totalProfessionals,
                        icon: "🧑‍🔧",
                        color: "#ec4899"
                      },
                      {
                        label: "Emergencies",
                        value:
                          stats.totalEmergencies,
                        icon: "🚨",
                        color: "#ef4444"
                      }
                    ].map(
                      ({
                        label,
                        value,
                        icon,
                        color
                      }) => (
                        <div
                          key={label}
                          style={{
                            background: "#fff",
                            borderRadius: "16px",
                            padding: "20px",
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.07)",
                            border:
                              "1px solid #f3f4f6"
                          }}
                        >
                          <div
                            style={{
                              fontSize: "1.8rem",
                              marginBottom: "8px"
                            }}
                          >
                            {icon}
                          </div>

                          <div
                            style={{
                              fontSize: "1.5rem",
                              fontWeight: 800,
                              color
                            }}
                          >
                            {value}
                          </div>

                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: "#6b7280",
                              fontWeight: 500,
                              marginTop: "4px"
                            }}
                          >
                            {label}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1fr 1fr",
                      gap: "24px"
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "16px",
                        padding: "24px",
                        boxShadow:
                          "0 1px 3px rgba(0,0,0,0.07)"
                      }}
                    >
                      <h3
                        style={{
                          fontWeight: 700,
                          marginBottom: "16px",
                          fontSize: "1rem",
                          marginTop: 0
                        }}
                      >
                        Booking Breakdown
                      </h3>

                      {[
                        {
                          label: "Created",
                          v: stats.createdBookings || 0,
                          color: "#6b7280"
                        },
                        {
                          label: "Assigned",
                          v: stats.assignedBookings !== undefined ? stats.assignedBookings : (stats.pendingBookings || 0),
                          color: "#f59e0b"
                        },
                        {
                          label: "Confirmed",
                          v: stats.confirmedBookings || 0,
                          color: "#3b82f6"
                        },
                        {
                          label: "Completed",
                          v: stats.completedBookings || 0,
                          color: "#10b981"
                        },
                        {
                          label: "Cancelled",
                          v: stats.cancelledBookings || 0,
                          color: "#ef4444"
                        }
                      ].map(
                        ({ label, v, color }) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              alignItems:
                                "center",
                              gap: "10px",
                              marginBottom:
                                "12px"
                            }}
                          >
                            <div
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius:
                                  "50%",
                                background:
                                  color,
                                flexShrink: 0
                              }}
                            />

                            <span
                              style={{
                                flex: 1,
                                fontSize:
                                  "0.85rem",
                                color:
                                  "#374151"
                              }}
                            >
                              {label}
                            </span>

                            <span
                              style={{
                                fontWeight: 700
                              }}
                            >
                              {v}
                            </span>

                            <div
                              style={{
                                height: "6px",
                                width: `${Math.max(
                                  (v /
                                    (stats.totalBookings ||
                                      1)) *
                                    100,
                                  2
                                )}%`,
                                background: color,
                                borderRadius:
                                  "3px",
                                maxWidth: "80px"
                              }}
                            />
                          </div>
                        )
                      )}
                    </div>

                    <div
                      style={{
                        background: "#fff",
                        borderRadius: "16px",
                        padding: "24px",
                        boxShadow:
                          "0 1px 3px rgba(0,0,0,0.07)"
                      }}
                    >
                      <h3
                        style={{
                          fontWeight: 700,
                          marginBottom: "16px",
                          fontSize: "1rem",
                          marginTop: 0
                        }}
                      >
                        Recent Bookings
                      </h3>

                      {recentBookings.map(
                        (b) => (
                          <div
                            key={b._id}
                            style={{
                              display: "flex",
                              justifyContent:
                                "space-between",
                              alignItems:
                                "center",
                              padding: "8px 0",
                              borderBottom:
                                "1px solid #f3f4f6"
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize:
                                    "0.85rem",
                                  fontWeight: 600
                                }}
                              >
                                {b.user?.name ||
                                  "Guest"}
                              </div>

                              {/* FIXED: Booking model uses customCategory */}
                              <div
                                style={{
                                  fontSize:
                                    "0.75rem",
                                  color:
                                    "#9ca3af"
                                }}
                              >
                                {b.service?.name ||
                                  b.customCategory ||
                                  "Custom"}
                              </div>
                            </div>

                            <span
                              style={{
                                padding:
                                  "3px 10px",
                                borderRadius:
                                  "20px",
                                fontSize:
                                  "0.72rem",
                                fontWeight: 600,
                                background: `${statusColor(
                                  b.status
                                )}20`,
                                color:
                                  statusColor(
                                    b.status
                                  )
                              }}
                            >
                              {b.status}
                            </span>
                          </div>
                        )
                      )}

                      {recentBookings.length ===
                        0 && (
                        <div
                          style={{
                            textAlign: "center",
                            padding: "20px",
                            color: "#9ca3af",
                            fontSize:
                              "0.85rem"
                          }}
                        >
                          No recent bookings.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* ── USERS ─────────────────────────────────── */}
            {activeSection === "users" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,0.07)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    padding: "18px 24px",
                    borderBottom:
                      "1px solid #f3f4f6"
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontWeight: 700
                    }}
                  >
                    All Users ({users.length})
                  </h3>
                </div>

                <div
                  style={{
                    overflowX: "auto"
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse:
                        "collapse"
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            "#f9fafb"
                        }}
                      >
                        {[
                          "Name",
                          "Email",
                          "Role",
                          "Phone",
                          "Joined",
                          "Actions"
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding:
                                "12px 16px",
                              textAlign:
                                "left",
                              fontSize:
                                "0.78rem",
                              fontWeight: 700,
                              color:
                                "#6b7280",
                              borderBottom:
                                "1px solid #f3f4f6"
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u._id}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "#fafafa")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "transparent")
                          }
                          style={{
                            borderBottom:
                              "1px solid #f9fafb"
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems:
                                  "center",
                                gap: "10px"
                              }}
                            >
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius:
                                    "50%",
                                  background:
                                    u.role ===
                                    "admin"
                                      ? "#0f0f0f"
                                      : "#f3f4f6",
                                  color:
                                    u.role ===
                                    "admin"
                                      ? "#fff"
                                      : "#374151",
                                  display: "flex",
                                  alignItems:
                                    "center",
                                  justifyContent:
                                    "center",
                                  fontSize:
                                    "0.75rem",
                                  fontWeight: 700,
                                  flexShrink: 0
                                }}
                              >
                                {u.name
                                  ?.substring(
                                    0,
                                    2
                                  )
                                  .toUpperCase()}
                              </div>

                              <span
                                style={{
                                  fontWeight: 600,
                                  fontSize:
                                    "0.88rem"
                                }}
                              >
                                {u.name}
                              </span>
                            </div>
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.83rem",
                              color:
                                "#6b7280"
                            }}
                          >
                            {u.email}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            <span
                              style={{
                                padding:
                                  "3px 10px",
                                borderRadius:
                                  "20px",
                                fontSize:
                                  "0.72rem",
                                fontWeight: 700,
                                background:
                                  u.role ===
                                  "admin"
                                    ? "#0f0f0f"
                                    : "#f3f4f6",
                                color:
                                  u.role ===
                                  "admin"
                                    ? "#fff"
                                    : "#374151"
                              }}
                            >
                              {u.role?.toUpperCase()}
                            </span>
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.83rem",
                              color:
                                "#6b7280"
                            }}
                          >
                            {u.phone || "—"}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.8rem",
                              color:
                                "#9ca3af"
                            }}
                          >
                            {u.createdAt
                              ? new Date(
                                  u.createdAt
                                ).toLocaleDateString(
                                  "en-IN"
                                )
                              : "—"}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            {u.role !==
                              "admin" && (
                              <ActionBtn
                                onClick={() =>
                                  handleDeleteUser(
                                    u._id
                                  )
                                }
                                color="#ef4444"
                                bg="#fef2f2"
                                icon={Trash2}
                                label="Delete"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── BOOKINGS ──────────────────────────────── */}
            {activeSection === "bookings" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,0.07)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    padding: "18px 24px",
                    borderBottom:
                      "1px solid #f3f4f6"
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontWeight: 700
                    }}
                  >
                    All Bookings ({bookings.length})
                  </h3>
                </div>

                <div
                  style={{
                    overflowX: "auto"
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse:
                        "collapse"
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            "#f9fafb"
                        }}
                      >
                        {[
                          "Customer",
                          "Service",
                          "Professional",
                          "Location",
                          "Rating",
                          "Amount",
                          "Status",
                          "Date",
                          "Update"
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding:
                                "12px 16px",
                              textAlign:
                                "left",
                              fontSize:
                                "0.78rem",
                              fontWeight: 700,
                              color:
                                "#6b7280",
                              borderBottom:
                                "1px solid #f3f4f6"
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {bookings.map((b) => (
                        <tr
                          key={b._id}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "#fafafa")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "transparent")
                          }
                          style={{
                            borderBottom:
                              "1px solid #f9fafb"
                          }}
                        >
                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize:
                                  "0.85rem"
                              }}
                            >
                              {b.user?.name ||
                                "—"}
                            </div>

                            <div
                              style={{
                                fontSize:
                                  "0.74rem",
                                color:
                                  "#9ca3af"
                              }}
                            >
                              {b.user?.email ||
                                "—"}
                            </div>
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.85rem"
                            }}
                          >
                            {/* FIXED: customServiceName → customCategory */}
                            {b.service?.name ||
                              b.customCategory ||
                              "Custom Request"}

                            {/* FIXED: isCustomRequest → isCustom */}
                            {b.isCustom && (
                              <div
                                style={{
                                  fontSize:
                                    "0.7rem",
                                  color:
                                    "#8b5cf6",
                                  fontWeight: 700
                                }}
                              >
                                CUSTOM
                              </div>
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.83rem",
                              color:
                                "#6b7280"
                            }}
                          >
                            {b.professional
                              ?.name || "—"}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.76rem",
                              color:
                                "#6b7280"
                            }}
                          >
                            {b.location?.latitude != null && b.location?.longitude != null ? (
                              <>
                                <div>
                                  {b.location.latitude.toFixed(4)}, {b.location.longitude.toFixed(4)}
                                </div>
                                {b.assignedDistanceKm != null && (
                                  <div style={{ color: "#9ca3af" }}>~{b.assignedDistanceKm} km away</div>
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.83rem"
                            }}
                          >
                            {b.userRating ? (
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "3px",
                                  fontWeight: 700,
                                  color: "#d97706"
                                }}
                              >
                                <Star size={13} fill="#f59e0b" stroke="#f59e0b" />
                                {b.userRating}
                              </span>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontWeight: 700
                            }}
                          >
                            {/* FIXED: amount → totalPrice */}
                            ₹
                            {(
                              Number(
                                b.totalPrice
                              ) || 0
                            ).toLocaleString(
                              "en-IN"
                            )}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            <span
                              style={{
                                display:
                                  "inline-flex",
                                alignItems:
                                  "center",
                                gap: "4px",
                                padding:
                                  "4px 10px",
                                borderRadius:
                                  "20px",
                                fontSize:
                                  "0.74rem",
                                fontWeight: 700,
                                background: `${statusColor(
                                  b.status
                                )}18`,
                                color:
                                  statusColor(
                                    b.status
                                  )
                              }}
                            >
                              {statusIcon(
                                b.status
                              )}
                              {b.status}
                            </span>
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px",
                              fontSize:
                                "0.78rem",
                              color:
                                "#9ca3af"
                            }}
                          >
                            {b.createdAt
                              ? new Date(
                                  b.createdAt
                                ).toLocaleDateString(
                                  "en-IN"
                                )
                              : "—"}
                          </td>

                          <td
                            style={{
                              padding:
                                "14px 16px"
                            }}
                          >
                            <select
                              value={b.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  b._id,
                                  e.target.value
                                )
                              }
                              style={{
                                padding:
                                  "6px 10px",
                                borderRadius:
                                  "8px",
                                border:
                                  "1px solid #e5e7eb",
                                fontSize:
                                  "0.78rem",
                                cursor:
                                  "pointer",
                                fontWeight: 600
                              }}
                            >
                              {[b.status, ...(BOOKING_TRANSITIONS[b.status] || [])].map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}

                      {bookings.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            style={{
                              textAlign:
                                "center",
                              padding: "40px",
                              color:
                                "#9ca3af"
                            }}
                          >
                            No bookings found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SERVICES ──────────────────────────────── */}
            {activeSection === "services" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(280px,1fr))",
                  gap: "16px"
                }}
              >
                {services.map((s) => (
                  <div
                    key={s._id}
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      overflow: "hidden",
                      boxShadow:
                        "0 1px 3px rgba(0,0,0,0.07)",
                      border:
                        "1px solid #f3f4f6"
                    }}
                  >
                    {(s.imageUrl || s.image) && (
                      <img
                        src={s.imageUrl || s.image}
                        alt={s.imageAlt || s.name}
                        style={{
                          width: "100%",
                          height: "140px",
                          objectFit: "cover"
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}

                    <div
                      style={{
                        padding: "16px"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent:
                            "space-between",
                          alignItems:
                            "flex-start",
                          marginBottom: "6px"
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize:
                              "0.95rem",
                            fontWeight: 700
                          }}
                        >
                          {s.name}
                        </h4>

                        <span
                          style={{
                            fontWeight: 800
                          }}
                        >
                          ₹{s.price}
                        </span>
                      </div>

                      <span
                        style={{
                          display:
                            "inline-block",
                          padding:
                            "2px 10px",
                          borderRadius:
                            "20px",
                          background:
                            "#f3f4f6",
                          fontSize:
                            "0.72rem",
                          fontWeight: 600,
                          color:
                            "#374151",
                          marginBottom:
                            "8px"
                        }}
                      >
                        {s.category}
                      </span>

                      <div
                        style={{
                          fontSize:
                            "0.8rem",
                          color:
                            "#6b7280",
                          marginBottom:
                            "12px"
                        }}
                      >
                        ⏱ {s.duration} · ⭐{" "}
                        {s.rating} (
                        {s.numRatings})
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px"
                        }}
                      >
                        <ActionBtn
                          onClick={() =>
                            setServiceModal(s)
                          }
                          color="#3b82f6"
                          bg="#eff6ff"
                          icon={Pencil}
                          label="Edit"
                        />

                        <ActionBtn
                          onClick={() =>
                            handleDeleteService(
                              s._id
                            )
                          }
                          color="#ef4444"
                          bg="#fef2f2"
                          icon={Trash2}
                          label="Delete"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div
                  onClick={() =>
                    setServiceModal("add")
                  }
                  style={{
                    background: "#f9fafb",
                    border:
                      "2px dashed #e5e7eb",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection:
                      "column",
                    alignItems: "center",
                    justifyContent:
                      "center",
                    minHeight: "260px",
                    cursor: "pointer",
                    gap: "10px",
                    color: "#9ca3af",
                    transition:
                      "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "#0f0f0f";
                    e.currentTarget.style.color =
                      "#0f0f0f";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "#e5e7eb";
                    e.currentTarget.style.color =
                      "#9ca3af";
                  }}
                >
                  <Plus size={32} />

                  <span
                    style={{
                      fontWeight: 700,
                      fontSize:
                        "0.95rem"
                    }}
                  >
                    Add New Service
                  </span>
                </div>
              </div>
            )}

            {/* ── PROFESSIONALS ─────────────────────────── */}
            {activeSection ===
              "professionals" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fill,minmax(220px,1fr))",
                  gap: "16px"
                }}
              >
                {professionals.map((p) => (
                  <div
                    key={p._id}
                    style={{
                      background: "#fff",
                      borderRadius: "16px",
                      overflow: "hidden",
                      boxShadow:
                        "0 1px 3px rgba(0,0,0,0.07)",
                      border:
                        "1px solid #f3f4f6",
                      display: "flex",
                      flexDirection:
                        "column",
                      alignItems:
                        "center",
                      padding:
                        "24px 16px",
                      textAlign: "center"
                    }}
                  >
                    <img
                      src={
                        p.imageUrl ||
                        p.image ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          p.name
                        )}&background=0f0f0f&color=fff&size=80`
                      }
                      alt={
                        p.imageAlt ||
                        p.name ||
                        "Professional"
                      }
                      style={{
                        width: "70px",
                        height: "70px",
                        borderRadius:
                          "50%",
                        objectFit: "cover",
                        marginBottom:
                          "12px"
                      }}
                    />

                    <h4
                      style={{
                        margin:
                          "0 0 4px",
                        fontSize:
                          "0.95rem",
                        fontWeight: 700
                      }}
                    >
                      {p.name}
                    </h4>

                    <span
                      style={{
                        display:
                          "inline-block",
                        padding:
                          "2px 10px",
                        borderRadius:
                          "20px",
                        background:
                          "#f3f4f6",
                        fontSize:
                          "0.72rem",
                        fontWeight: 600,
                        marginBottom:
                          "6px"
                      }}
                    >
                      {p.category}
                    </span>

                    <div
                      style={{
                        fontSize:
                          "0.8rem",
                        color:
                          "#6b7280",
                        marginBottom:
                          "6px"
                      }}
                    >
                      ⭐ {p.rating} ·{" "}
                      {p.experience} yrs
                    </div>

                    <div
                      style={{
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        marginBottom: "8px",
                        color: p.locality ? "#0e5e4f" : "#b45309"
                      }}
                    >
                      {p.locality ? `📍 ${p.locality}` : "⚠ No service locality — edit to assign"}
                    </div>

                    <button
                      onClick={() => handleToggleProfStatus(p)}
                      title="Click to toggle Available / Busy"
                      style={{
                        display: "inline-block",
                        padding: "4px 14px",
                        borderRadius: "20px",
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        marginBottom: "12px",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        background:
                          p.status ===
                          "Available"
                            ? "#dcfce7"
                            : "#fef3c7",
                        color:
                          p.status ===
                          "Available"
                            ? "#16a34a"
                            : "#d97706"
                      }}
                    >
                      {p.status} ⇄
                    </button>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px"
                      }}
                    >
                      <ActionBtn
                        onClick={() =>
                          setProfModal(p)
                        }
                        color="#3b82f6"
                        bg="#eff6ff"
                        icon={Pencil}
                        label="Edit"
                      />

                      <ActionBtn
                        onClick={() =>
                          handleDeleteProf(
                            p._id
                          )
                        }
                        color="#ef4444"
                        bg="#fef2f2"
                        icon={Trash2}
                        label="Delete"
                      />
                    </div>
                  </div>
                ))}

                <div
                  onClick={() =>
                    setProfModal("add")
                  }
                  style={{
                    background: "#f9fafb",
                    border:
                      "2px dashed #e5e7eb",
                    borderRadius: "16px",
                    display: "flex",
                    flexDirection:
                      "column",
                    alignItems: "center",
                    justifyContent:
                      "center",
                    minHeight: "280px",
                    cursor: "pointer",
                    gap: "10px",
                    color: "#9ca3af",
                    transition:
                      "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      "#0f0f0f";
                    e.currentTarget.style.color =
                      "#0f0f0f";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "#e5e7eb";
                    e.currentTarget.style.color =
                      "#9ca3af";
                  }}
                >
                  <Plus size={32} />

                  <span
                    style={{
                      fontWeight: 700,
                      fontSize:
                        "0.95rem"
                    }}
                  >
                    Add New Professional
                  </span>
                </div>
              </div>
            )}

            {/* ── EMERGENCIES ───────────────────────────── */}
            {activeSection ===
              "emergencies" && (
              <div
                style={{
                  background: "#fff",
                  borderRadius: "16px",
                  boxShadow:
                    "0 1px 3px rgba(0,0,0,0.07)",
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    padding:
                      "18px 24px",
                    borderBottom:
                      "1px solid #f3f4f6",
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center"
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      color: "#ef4444"
                    }}
                  >
                    🚨 Emergency Requests (
                    {emergencies.length})
                  </h3>

                  <button
                    onClick={
                      fetchEmergencies
                    }
                    style={{
                      padding:
                        "6px 12px",
                      borderRadius:
                        "8px",
                      border:
                        "1px solid #e5e7eb",
                      background: "#fff",
                      cursor:
                        "pointer",
                      fontSize:
                        "0.8rem",
                      fontWeight: 600
                    }}
                  >
                    Refresh
                  </button>
                </div>

                <div
                  style={{
                    overflowX: "auto"
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse:
                        "collapse"
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            "#fef2f2"
                        }}
                      >
                        {[
                          "User",
                          "Category & Severity",
                          "Description",
                          "Location",
                          "Specialist",
                          "Status",
                          "Time",
                          "Action"
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              padding:
                                "12px 16px",
                              textAlign:
                                "left",
                              fontSize:
                                "0.78rem",
                              fontWeight: 700,
                              color:
                                "#ef4444",
                              borderBottom:
                                "1px solid #fee2e2"
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {emergencies.map((e) => {
                        const statusColors =
                          {
                            Dispatched: {
                              bg: "#fef3c7",
                              color:
                                "#d97706"
                            },
                            OnTheWay: {
                              bg: "#dbeafe",
                              color:
                                "#2563eb"
                            },
                            Arrived: {
                              bg: "#ede9fe",
                              color:
                                "#7c3aed"
                            },
                            Resolved: {
                              bg: "#dcfce7",
                              color:
                                "#16a34a"
                            },
                            Cancelled: {
                              bg: "#f3f4f6",
                              color:
                                "#6b7280"
                            }
                          };

                        const sc =
                          statusColors[
                            e.status
                          ] || {
                            bg: "#fef2f2",
                            color:
                              "#ef4444"
                          };

                        return (
                          <tr
                            key={e._id}
                            onMouseEnter={(
                              el
                            ) =>
                              (el.currentTarget.style.background =
                                "#fffbfb")
                            }
                            onMouseLeave={(
                              el
                            ) =>
                              (el.currentTarget.style.background =
                                "transparent")
                            }
                            style={{
                              borderBottom:
                                "1px solid #f9fafb"
                            }}
                          >
                            <td
                              style={{
                                padding:
                                  "14px 16px"
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize:
                                    "0.85rem"
                                }}
                              >
                                {e.user?.name ||
                                  "Customer"}
                              </div>

                              <div
                                style={{
                                  fontSize:
                                    "0.74rem",
                                  color:
                                    "#9ca3af"
                                }}
                              >
                                {e.user?.email ||
                                  e.contactNumber ||
                                  "—"}
                              </div>
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px"
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize:
                                    "0.85rem"
                                }}
                              >
                                {e.category ||
                                  "Emergency"}
                              </div>

                              <span
                                style={{
                                  fontSize:
                                    "0.7rem",
                                  fontWeight: 700,
                                  padding:
                                    "2px 6px",
                                  borderRadius:
                                    "4px",
                                  background:
                                    "#fef2f2",
                                  color:
                                    "#dc2626"
                                }}
                              >
                                {e.severity ||
                                  "High"}
                              </span>
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px",
                                fontSize:
                                  "0.82rem",
                                color:
                                  "#4b5563",
                                maxWidth:
                                  "200px"
                              }}
                            >
                              {e.description ||
                                "—"}
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px",
                                fontSize:
                                  "0.82rem",
                                color:
                                  "#6b7280",
                                maxWidth:
                                  "160px"
                              }}
                            >
                              <div>{e.address || "—"}</div>
                              {e.location?.latitude != null && e.location?.longitude != null && (
                                <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "2px" }}>
                                  {e.location.latitude.toFixed(4)}, {e.location.longitude.toFixed(4)}
                                  {e.assignedDistanceKm != null && ` · ~${e.assignedDistanceKm} km`}
                                </div>
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px",
                                fontSize:
                                  "0.83rem",
                                fontWeight: 600
                              }}
                            >
                              {e.assignedProfessional
                                ?.name || (
                                <span
                                  style={{
                                    color:
                                      "#d97706",
                                    fontSize:
                                      "0.78rem"
                                  }}
                                >
                                  Auto-assigning...
                                </span>
                              )}
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px"
                              }}
                            >
                              <span
                                style={{
                                  padding:
                                    "3px 10px",
                                  borderRadius:
                                    "20px",
                                  fontSize:
                                    "0.74rem",
                                  fontWeight: 700,
                                  background:
                                    sc.bg,
                                  color:
                                    sc.color
                                }}
                              >
                                {e.status}
                              </span>
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px",
                                fontSize:
                                  "0.78rem",
                                color:
                                  "#9ca3af"
                              }}
                            >
                              {e.createdAt
                                ? new Date(
                                    e.createdAt
                                  ).toLocaleString(
                                    "en-IN"
                                  )
                                : "—"}
                            </td>

                            <td
                              style={{
                                padding:
                                  "14px 16px"
                              }}
                            >
                              <select
                                value={e.status}
                                onChange={async (
                                  event
                                ) => {
                                  const newStatus =
                                    event
                                      .target
                                      .value;

                                  try {
                                    const r =
                                      await fetch(
                                        `${BASE}/emergencies/${e._id}/status`,
                                        {
                                          method:
                                            "PUT",
                                          headers:
                                            jsonHeaders,
                                          body: JSON.stringify(
                                            {
                                              status:
                                                newStatus
                                            }
                                          )
                                        }
                                      );

                                    const d =
                                      await r.json();

                                    if (
                                      r.ok &&
                                      d.success
                                    ) {
                                      showToast(
                                        d.message
                                      );
                                      fetchEmergencies();
                                    } else {
                                      showToast(
                                        d.message ||
                                          "Failed to update",
                                        "error"
                                      );
                                    }
                                  } catch (err) {
                                    console.error(
                                      "UPDATE EMERGENCY STATUS ERROR:",
                                      err
                                    );

                                    showToast(
                                      "Server error",
                                      "error"
                                    );
                                  }
                                }}
                                style={{
                                  padding:
                                    "6px 10px",
                                  borderRadius:
                                    "8px",
                                  border:
                                    "1px solid #e5e7eb",
                                  fontSize:
                                    "0.78rem",
                                  cursor:
                                    "pointer",
                                  fontWeight: 600
                                }}
                              >
                                <option value="Dispatched">
                                  Dispatched
                                </option>
                                <option value="OnTheWay">
                                  On The Way
                                </option>
                                <option value="Arrived">
                                  Arrived
                                </option>
                                <option value="Resolved">
                                  Resolved ✓
                                </option>
                                <option value="Cancelled">
                                  Cancelled
                                </option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}

                      {emergencies.length ===
                        0 && (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              textAlign:
                                "center",
                              padding: "40px",
                              color:
                                "#9ca3af"
                            }}
                          >
                            No emergency requests
                            found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── SERVICE MODAL ─────────────────────────────── */}
      {serviceModal && (
        <Modal
          title={
            serviceModal === "add"
              ? "Add New Service"
              : `Edit Service — ${serviceModal.name}`
          }
          onClose={() =>
            setServiceModal(null)
          }
        >
          <ServiceForm
            initial={
              serviceModal === "add"
                ? null
                : serviceModal
            }
            onSave={handleSaveService}
            onClose={() =>
              setServiceModal(null)
            }
            loading={formLoading}
          />
        </Modal>
      )}

      {/* ── PROFESSIONAL MODAL ────────────────────────── */}
      {profModal && (
        <Modal
          title={
            profModal === "add"
              ? "Add New Professional"
              : `Edit Professional — ${profModal.name}`
          }
          onClose={() =>
            setProfModal(null)
          }
        >
          <ProfessionalForm
            initial={
              profModal === "add"
                ? null
                : profModal
            }
            onSave={handleSaveProf}
            onClose={() =>
              setProfModal(null)
            }
            loading={formLoading}
            localities={localities}
          />
        </Modal>
      )}
    </div>
  );
}