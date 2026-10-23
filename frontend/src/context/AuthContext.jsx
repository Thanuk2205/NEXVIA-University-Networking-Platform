import { createContext, useContext, useState, useEffect } from "react";
import api, { renewSession } from "../api/axios";

const AuthContext = createContext(null);
let bootstrapRequest;
function bootstrapSession() {
  bootstrapRequest ||= api
    .get("/auth/me")
    .catch(async (error) => {
      if (error.response?.status !== 401) throw error;
      return renewSession();
    })
    .finally(() => {
      bootstrapRequest = null;
    });
  return bootstrapRequest;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let current = true;
    localStorage.removeItem("nexvia_token");
    bootstrapSession()
      .then((res) => {
        if (current) setUser(res.data.data);
      })
      .catch(() => {
        if (current) setUser(null);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  async function login(email, password) {
    if (bootstrapRequest) await bootstrapRequest.catch(() => {});
    const res = await api.post("/auth/login", { email, password });
    setUser(res.data.data);
    return res.data.data;
  }

  async function register(payload) {
    if (bootstrapRequest) await bootstrapRequest.catch(() => {});
    const res = await api.post("/auth/register", payload);
    setUser(res.data.data);
    return res.data.data;
  }

  async function logout() {
    await api.post("/auth/logout", {});
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
