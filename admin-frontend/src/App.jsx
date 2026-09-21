import React, { useState } from "react";
import AdminAuth from "./pages/AdminAuth";
import AdminDashboard from "./pages/AdminDashboard";
import Toast from "./components/Toast";

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
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [user, setUser] = useState(() => getStoredUser());
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  const handleLoginSuccess = (userData, userToken) => {
    if (!userData || !userToken) {
      showToast("Invalid login response", "error");
      return;
    }

    setUser(userData);
    setToken(userToken);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    setUser(null);
    setToken("");

    showToast("Logged out successfully", "success");
  };

  const isAuthorizedAdmin = token && user && user.role === "admin";

  return (
    <>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {isAuthorizedAdmin ? (
        <AdminDashboard token={token} user={user} onLogout={handleLogout} />
      ) : (
        <AdminAuth onLoginSuccess={handleLoginSuccess} showToast={showToast} />
      )}
    </>
  );
}
