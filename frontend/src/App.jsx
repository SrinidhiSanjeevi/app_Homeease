import React, { useState, useEffect } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Emergency from "./pages/Emergency";
import Profile from "./pages/Profile";
import ServiceDetail from "./pages/ServiceDetail";
import Navbar from "./components/Navbar";
import BookingModal from "./components/BookingModal";
import Toast from "./components/Toast";
import Footer from "./components/Footer";
import AreaPicker from "./components/AreaPicker";
import usePolling from "./hooks/usePolling";

// ============================================================
// URL HELPERS — /services/:id deep links to a service page
// ============================================================

const SERVICE_PATH = /^\/services\/([a-f0-9]{24})\/?$/i;

const getServiceIdFromUrl = () => {
  const match = window.location.pathname.match(SERVICE_PATH);
  return match ? match[1] : null;
};

// ============================================================
// SAFE LOCAL STORAGE HELPERS
// ============================================================

const getStoredUser = () => {
  try {
    const storedUser = localStorage.getItem("user");
    if (!storedUser) {
      return null;
    }
    return JSON.parse(storedUser);
  } catch (error) {
    console.error("Invalid stored user data:", error);
    localStorage.removeItem("user");
    return null;
  }
};

export default function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("token") || ""
  );

  const [user, setUser] = useState(
    () => getStoredUser()
  );

  const [activeTab, setActiveTab] =
    useState("dashboard");

  // ============================================================
  // CORE DATA
  // ============================================================

  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] =
    useState([]);
  const [bookings, setBookings] = useState([]);
  const [activeEmergencies, setActiveEmergencies] =
    useState([]);

  // ============================================================
  // MODALS / ALERTS
  // ============================================================

  const [bookingService, setBookingService] =
    useState(null);

  const [bookingProduct, setBookingProduct] =
    useState(null);

  // Id of the service whose detail page is open (null = service grid).
  // Kept in sync with the URL so refresh, sharing and Back all work.
  const [viewServiceId, setViewServiceId] =
    useState(() => getServiceIdFromUrl());

  const openService = (service) => {
    if (!service?._id) return;
    window.history.pushState({ serviceId: service._id }, "", `/services/${service._id}`);
    setViewServiceId(service._id);
  };

  const closeService = ({ useHistory = true } = {}) => {
    if (useHistory && window.history.state?.serviceId) {
      // We pushed this entry ourselves — pop it so Back/Forward stay sane.
      window.history.back();
      return;
    }
    if (getServiceIdFromUrl()) {
      window.history.pushState(null, "", "/");
    }
    setViewServiceId(null);
  };

  useEffect(() => {
    const onPopState = () => setViewServiceId(getServiceIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const [toast, setToast] = useState(null);

  // ============================================================
  // SERVICE AREA — chosen once, remembered on this device
  // ============================================================

  const AREA_KEY = "homeease.area";
  const [areas, setAreas] = useState([]);
  const [area, setAreaState] = useState(() => {
    try {
      return localStorage.getItem(AREA_KEY) || "";
    } catch {
      return "";
    }
  });
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);

  const setArea = (name) => {
    setAreaState(name);
    setAreaPickerOpen(false);
    try {
      localStorage.setItem(AREA_KEY, name);
    } catch {
      /* storage blocked — keep it for this session only */
    }
  };

  // First visit: ask for the area before browsing.
  useEffect(() => {
    if (!area) setAreaPickerOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================
  // GUEST BROWSING — sign-in only when an action needs it
  // ============================================================

  const [authOpen, setAuthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const isLoggedIn = Boolean(token && user);

  const requireAuth = (action, message = "Please sign in to continue") => {
    if (isLoggedIn) {
      action();
      return;
    }
    setPendingAction(() => action);
    setAuthOpen(true);
    showToast(message, "info");
  };

  // Token refreshed / expired in the background (authFetch.js).
  useEffect(() => {
    const onToken = (e) => setToken(e.detail);
    const onLogout = () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("refreshToken");
      setUser(null);
      setToken("");
    };
    window.addEventListener("homeease:token", onToken);
    window.addEventListener("homeease:logout", onLogout);
    return () => {
      window.removeEventListener("homeease:token", onToken);
      window.removeEventListener("homeease:logout", onLogout);
    };
  }, []);

  // ============================================================
  // TOAST
  // ============================================================

  const showToast = (
    message,
    type = "success"
  ) => {
    setToast({
      message,
      type
    });
  };

  // ============================================================
  // LOGIN
  // ============================================================

  const handleLoginSuccess = (
    userData,
    userToken
  ) => {
    if (!userData || !userToken) {
      showToast(
        "Invalid login response",
        "error"
      );
      return;
    }

    setUser(userData);
    setToken(userToken);
    setAuthOpen(false);

    // Continue whatever the guest was trying to do (book, open a tab…).
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      setTimeout(action, 0);
    } else {
      setActiveTab("dashboard");
    }
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("refreshToken");

    setUser(null);
    setToken("");

    setBookings([]);
    setActiveEmergencies([]);
    setBookingService(null);
    closeService({ useHistory: false });

    setActiveTab("dashboard");

    showToast(
      "Logged out successfully",
      "success"
    );
  };

  // ============================================================
  // FETCH SERVICES
  // ============================================================

  const fetchServices = async () => {
    try {
      const response = await fetch(
        "/api/services"
      );

      if (!response.ok) {
        throw new Error(
          `Services request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.success) {
        setServices(
          Array.isArray(data.services)
            ? data.services
            : []
        );
      }
    } catch (error) {
      console.error(
        "Fetch Services Error:",
        error
      );
    }
  };

  // ============================================================
  // FETCH PROFESSIONALS
  // ============================================================

  const fetchProfessionals = async () => {
    try {
      const response = await fetch(
        "/api/services/professionals"
      );

      if (!response.ok) {
        throw new Error(
          `Professionals request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.success) {
        setProfessionals(
          Array.isArray(data.professionals)
            ? data.professionals
            : []
        );
      }
    } catch (error) {
      console.error(
        "Fetch Professionals Error:",
        error
      );
    }
  };

  // ============================================================
  // FETCH USER / PROFESSIONAL BOOKINGS
  // ============================================================

  const fetchBookings = async () => {
    if (!token || !user) {
      return;
    }

    try {
      const endpoint =
        user.role === "professional"
          ? "/api/bookings/professional"
          : "/api/bookings/my-bookings";

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(
          `Bookings request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.success) {
        setBookings(
          Array.isArray(data.bookings)
            ? data.bookings
            : []
        );
      }
    } catch (error) {
      console.error(
        "Fetch Bookings Error:",
        error
      );

      /*
       * Do not call a generic /api/bookings fallback.
       *
       * The backend already provides role-specific
       * endpoints and the generic fallback could expose
       * unexpected booking data.
       */
    }
  };

  // ============================================================
  // FETCH ACTIVE EMERGENCIES
  // ============================================================

  const fetchEmergencies = async () => {
    if (!token) {
      return;
    }

    try {
      const response = await fetch(
        "/api/emergency/active",
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(
          `Emergency request failed: ${response.status}`
        );
      }

      const data = await response.json();

      if (data.success) {
        setActiveEmergencies(
          Array.isArray(data.emergencies)
            ? data.emergencies
            : []
        );
      }
    } catch (error) {
      console.error(
        "Fetch Emergencies Error:",
        error
      );
    }
  };

  // ============================================================
  // INITIAL LOAD
  // ============================================================

  const fetchAreas = async () => {
    try {
      const response = await fetch("/api/services/areas");
      const data = await response.json();
      if (data.success) setAreas(data.areas || []);
    } catch (error) {
      console.error("Fetch Areas Error:", error);
    }
  };

  useEffect(() => {
    fetchServices();
    fetchProfessionals();
    fetchAreas();
  }, []);

  // ============================================================
  // LIVE UPDATES — no manual refresh needed
  // ============================================================

  usePolling(() => {
    fetchBookings();
    fetchEmergencies();
  }, 10000, isLoggedIn);

  usePolling(() => {
    fetchProfessionals();
    fetchServices();
    fetchAreas();
  }, 30000);

  // ============================================================
  // LOAD USER-SPECIFIC DATA
  // ============================================================

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    fetchBookings();
    fetchEmergencies();
  }, [token, user]);

  // ============================================================
  // CREATE BOOKING
  //
  // FIX: this must now:
  //  1. RETURN the parsed response — BookingModal's Razorpay flow
  //     needs `data.booking._id` to create the payment order. Without
  //     a return value, BookingModal received `undefined` and threw
  //     "Booking creation did not return a booking id".
  //  2. NOT close the modal or refresh booking lists here for the
  //     Razorpay path — the booking exists but is still "Pending"
  //     until /api/payments/verify confirms it. BookingModal itself
  //     calls onClose() only after cash confirmation or successful
  //     Razorpay verification. Closing early would tear down the
  //     modal before Razorpay's checkout popup even had a chance to
  //     open, and refreshing "My Bookings" too early would show a
  //     booking stuck at "Pending" with no visible next step.
  // ============================================================

  const handleBookSubmit = async (
    bookingData
  ) => {
    if (!token) {
      showToast(
        "Please login to book a service",
        "error"
      );
      throw new Error("Not authenticated");
    }

    const response = await fetch(
      "/api/bookings",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          bookingData
        )
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      showToast(
        data.message ||
          "Failed to book service",
        "error"
      );
      throw new Error(
        data.message || "Booking failed"
      );
    }

    // Cash bookings are fully confirmed immediately — refresh lists
    // and let the toast show now. Razorpay bookings stay "Pending";
    // BookingModal will refresh/close things itself once payment is
    // verified, so we deliberately skip that here.
    if (bookingData.paymentMethod === "Cash on Delivery") {
      showToast(
        data.message ||
          "Booking confirmed!",
        "success"
      );
      setBookingService(null);
      await Promise.all([
        fetchBookings(),
        fetchProfessionals()
      ]);
    }

    return data; // <-- the actual fix: BookingModal reads data.booking._id from this
  };

  // ============================================================
  // PROFESSIONAL ACCEPT BOOKING
  // ============================================================

  const handleAcceptBooking = async (
    bookingId
  ) => {
    if (!token || !bookingId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/accept`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data =
        await response.json();

      if (response.ok && data.success) {
        showToast(
          data.message ||
            "Booking accepted successfully",
          "success"
        );

        await Promise.all([
          fetchBookings(),
          fetchProfessionals()
        ]);
      } else {
        showToast(
          data.message ||
            "Failed to accept booking",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "Accept booking error:",
        error
      );

      showToast(
        "Server communication error",
        "error"
      );
    }
  };

  // ============================================================
  // CANCEL BOOKING
  // ============================================================

  const handleCancelBooking = async (
    bookingId
  ) => {
    if (!token || !bookingId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/cancel`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data =
        await response.json();

      if (response.ok && data.success) {
        showToast(
          data.message ||
            "Booking cancelled successfully",
          "success"
        );

        await Promise.all([
          fetchBookings(),
          fetchProfessionals()
        ]);
      } else {
        showToast(
          data.message ||
            "Failed to cancel booking",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "Booking cancellation error:",
        error
      );

      showToast(
        "Server communication error",
        "error"
      );
    }
  };

  // ============================================================
  // RATE BOOKING
  // ============================================================

  const handleCompleteBooking = async (
    bookingId
  ) => {
    if (!token || !bookingId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/complete`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data =
        await response.json();

      if (response.ok && data.success) {
        showToast(
          "Service marked as completed",
          "success"
        );

        await Promise.all([
          fetchBookings(),
          fetchProfessionals()
        ]);
      } else {
        showToast(
          data.message ||
            "Failed to complete booking",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "Complete booking error:",
        error
      );

      showToast(
        "Server communication error",
        "error"
      );
    }
  };

  const handleRateBooking = async (
    bookingId,
    rating,
    review
  ) => {
    if (!token || !bookingId) {
      return;
    }

    try {
      const response = await fetch(
        `/api/bookings/${bookingId}/rate`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            rating,
            review
          })
        }
      );

      const data =
        await response.json();

      if (response.ok && data.success) {
        showToast(
          "Feedback submitted. Thank you!",
          "success"
        );

        await Promise.all([
          fetchBookings(),
          fetchServices(),
          fetchProfessionals()
        ]);
      } else {
        showToast(
          data.message ||
            "Failed to submit rating",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "Rate booking error:",
        error
      );

      showToast(
        "Server communication error",
        "error"
      );
    }
  };

  // ============================================================
  // EMERGENCY DISPATCH
  // ============================================================

  const handleDispatchEmergency =
    async (emergencyData) => {
      if (!token) {
        showToast(
          "Please login first",
          "error"
        );
        return;
      }

      try {
        const response = await fetch(
          "/api/emergency/dispatch",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(
              emergencyData
            )
          }
        );

        const data =
          await response.json();

        if (response.ok && data.success) {
          showToast(
            data.message ||
              "Emergency request dispatched",
            "success"
          );

          await Promise.all([
            fetchEmergencies(),
            fetchProfessionals()
          ]);
        } else {
          showToast(
            data.message ||
              "Failed to dispatch emergency",
            "error"
          );
        }
      } catch (error) {
        console.error(
          "Emergency dispatch error:",
          error
        );

        showToast(
          "Server communication error",
          "error"
        );
      }
    };

  // ============================================================
  // ADMIN ACCOUNTS DON'T BELONG IN THIS APP
  //
  // Admin management now lives in its own app (admin-frontend), its
  // own deployment, its own microservice boundary. An admin token
  // landing here (e.g. a stale session) is shown a plain notice and
  // logged out — it is never routed into the customer experience.
  // ============================================================

  if (user?.role === "admin") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center"
        }}
      >
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}

        <h2 style={{ fontSize: "1.2rem", fontWeight: 800 }}>
          This is the customer app
        </h2>

        <p style={{ color: "var(--text-muted)", maxWidth: "360px" }}>
          Administrator accounts sign in through the Admin Console, not here.
        </p>

        <button
          onClick={handleLogout}
          className="btn btn-secondary"
        >
          Log Out
        </button>
      </div>
    );
  }

  // ============================================================
  // USER / PROFESSIONAL APPLICATION
  // ============================================================

  const navigate = (tab) => {
    const go = () => {
      closeService({ useHistory: false });
      setActiveTab(tab);
    };
    if (tab === "dashboard") go();
    else requireAuth(go, "Please sign in to see this page");
  };

  // Booking needs an account and a service area.
  const startBooking = (service, product = null) => {
    requireAuth(() => {
      if (!area) {
        setAreaPickerOpen(true);
        showToast("Choose your area first so we can send the nearest professional", "info");
        return;
      }
      setBookingProduct(product);
      setBookingService(service);
    }, "Please sign in to book this service");
  };

  if (authOpen && !isLoggedIn) {
    return (
      <div className="auth-overlay">
        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
        <button
          type="button"
          className="btn btn-secondary auth-overlay-close"
          onClick={() => {
            setAuthOpen(false);
            setPendingAction(null);
          }}
        >
          Continue browsing
        </button>
        <Auth onLoginSuccess={handleLoginSuccess} showToast={showToast} />
      </div>
    );
  }

  return (
    <>
      <Navbar
        activeTab={activeTab}
        setActiveTab={navigate}
        user={user}
        onLogout={handleLogout}
        onSignIn={() => setAuthOpen(true)}
        area={area}
        onChangeArea={() => setAreaPickerOpen(true)}
      />

      <main className="app-shell page">
        {/* Dashboard */}
        {activeTab === "dashboard" && !viewServiceId && (
          <Dashboard
            services={services}
            onBookClick={(service) => startBooking(service)}
            onViewService={openService}
            area={area}
            onChangeArea={() => setAreaPickerOpen(true)}
          />
        )}

        {/* Service Detail */}
        {activeTab === "dashboard" && viewServiceId && (
          <ServiceDetail
            key={viewServiceId}
            serviceId={viewServiceId}
            initialService={services.find((s) => s._id === viewServiceId)}
            services={services}
            professionals={professionals}
            onBack={() => closeService()}
            onViewService={openService}
            onBook={(service, product) => startBooking(service, product)}
          />
        )}

        {/* Bookings */}
        {activeTab === "bookings" && isLoggedIn && (
          <Bookings
            bookings={bookings}
            onCancelBooking={
              handleCancelBooking
            }
            onRateBooking={
              handleRateBooking
            }
            onCompleteBooking={
              handleCompleteBooking
            }
            onAcceptBooking={
              handleAcceptBooking
            }
            isProfessionalMode={
              user.role === "professional"
            }
          />
        )}

        {/* Emergency */}
        {activeTab === "emergency" && isLoggedIn && (
          <Emergency
            activeEmergencies={
              activeEmergencies
            }
            onDispatchEmergency={
              handleDispatchEmergency
            }
            showToast={showToast}
            token={token}
            area={area}
            onChangeArea={() => setAreaPickerOpen(true)}
            onRefresh={fetchEmergencies}
          />
        )}

        {/* Profile */}
        {activeTab === "profile" && isLoggedIn && (
          <Profile
            user={user}
            bookings={bookings}
            onLogout={handleLogout}
          />
        )}
      </main>

      <Footer onNavigate={navigate} />

      {/* Booking Modal */}
      {bookingService && (
  <BookingModal
    service={bookingService}
    initialProduct={bookingProduct}
    onClose={() => setBookingService(null)}
    onSubmit={handleBookSubmit}
    onBookingSettled={() => {
      fetchBookings();
      fetchProfessionals();
    }}
    professionals={professionals}
    user={user}
    area={area}
  />
   )}

      <AreaPicker
        open={areaPickerOpen}
        areas={areas}
        current={area}
        required={!area}
        onSelect={setArea}
        onClose={() => setAreaPickerOpen(false)}
      />

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() =>
            setToast(null)
          }
        />
      )}
    </>
  );
}