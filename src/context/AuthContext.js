import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:10000";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const checkUsernameUnique = async (username) => {
    try {
      const response = await fetch(`${API_URL}users?username=${username}`);
      const users = await response.json();
      return users.length === 0;
    } catch (error) {
      console.error("Error checking username uniqueness:", error);
      return false;
    }
  };

  const checkPhoneUnique = async (phone) => {
    try {
      const response = await fetch(`${API_URL}/users?phoneNumber=${phone}`);
      const users = await response.json();
      return users.length === 0;
    } catch (error) {
      console.error("Error checking phone uniqueness:", error);
      return false;
    }
  };

  const login = async (credentials) => {
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const user = await response.json();
      setUser(user);
      localStorage.setItem("user", JSON.stringify(user));
      return true;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const register = async (userData) => {
    try {
      const isUsernameUnique = await checkUsernameUnique(userData.username);
      const isPhoneUnique = await checkPhoneUnique(userData.phoneNumber);

      if (!isUsernameUnique) {
        throw new Error("Username already exists");
      }

      if (!isPhoneUnique) {
        throw new Error("Phone number already in use");
      }

      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...userData, id: Date.now() }),
      });

      if (response.ok) {
        const newUser = await response.json();
        const { password, ...userWithoutPassword } = newUser;
        setUser(userWithoutPassword);
        localStorage.setItem("user", JSON.stringify(userWithoutPassword));
        return true;
      }
      return false;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        loading,
        checkUsernameUnique,
        checkPhoneUnique,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
