import React, { useState, useEffect } from "react";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Bookings from "./pages/Bookings";
import Emergency from "./pages/Emergency";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import Navbar from "./components/Navbar";
import BookingModal from "./components/BookingModal";
import Toast from "./components/Toast";

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

  const [toast, setToast] = useState(null);

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
    setActiveTab("dashboard");
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    setToken("");

    setBookings([]);
    setActiveEmergencies([]);
    setBookingService(null);

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

  useEffect(() => {
    fetchServices();
    fetchProfessionals();
  }, []);

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
  // ============================================================

  const handleBookSubmit = async (
    bookingData
  ) => {
    if (!token) {
      showToast(
        "Please login to book a service",
        "error"
      );
      return;
    }

    try {
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

      const data =
        await response.json();

      if (response.ok && data.success) {
        showToast(
          data.message ||
            "Booking created successfully",
          "success"
        );

        setBookingService(null);

        await Promise.all([
          fetchBookings(),
          fetchProfessionals()
        ]);
      } else {
        showToast(
          data.message ||
            "Failed to book service",
          "error"
        );
      }
    } catch (error) {
      console.error(
        "Booking submit error:",
        error
      );

      showToast(
        "Server communication error",
        "error"
      );
    }
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
  // PROFESSIONAL COMPLETE BOOKING
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
          data.message ||
            "Booking completed successfully",
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
  // AUTHENTICATION ROUTER
  // ============================================================

  if (!token || !user) {
    return (
      <>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() =>
              setToast(null)
            }
          />
        )}

        <Auth
          onLoginSuccess={
            handleLoginSuccess
          }
          showToast={showToast}
        />
      </>
    );
  }

  // ============================================================
  // ADMIN ROUTER
  // ============================================================

  if (user.role === "admin") {
    return (
      <>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() =>
              setToast(null)
            }
          />
        )}

        <AdminDashboard
          token={token}
          user={user}
          onLogout={handleLogout}
        />
      </>
    );
  }

  // ============================================================
  // USER / PROFESSIONAL APPLICATION
  // ============================================================

  return (
    <div>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
      />

      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 24px"
        }}
      >
        {/* Dashboard */}
        {activeTab === "dashboard" && (
          <Dashboard
            services={services}
            onBookClick={
              setBookingService
            }
          />
        )}

        {/* Bookings */}
        {activeTab === "bookings" && (
          <Bookings
            bookings={bookings}
            onCancelBooking={
              handleCancelBooking
            }
            onRateBooking={
              handleRateBooking
            }
            onAcceptBooking={
              handleAcceptBooking
            }
            onCompleteBooking={
              handleCompleteBooking
            }
            isProfessionalMode={
              user.role === "professional"
            }
          />
        )}

        {/* Emergency */}
        {activeTab === "emergency" && (
          <Emergency
            activeEmergencies={
              activeEmergencies
            }
            onDispatchEmergency={
              handleDispatchEmergency
            }
            showToast={showToast}
            token={token}
          />
        )}

        {/* Profile */}
        {activeTab === "profile" && (
          <Profile
            user={user}
            bookings={bookings}
            onLogout={handleLogout}
          />
        )}
      </div>

      {/* Booking Modal */}
      {bookingService && (
        <BookingModal
          service={bookingService}
          onClose={() =>
            setBookingService(null)
          }
          onSubmit={handleBookSubmit}
          professionals={professionals}
        />
      )}

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
    </div>
  );
}