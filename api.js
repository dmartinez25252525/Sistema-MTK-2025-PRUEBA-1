export const API_BASE = "http://localhost:4000/api";

export async function apiLogin(email, pasword) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method:"POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ email, pasword })
  });
  return res.json();
}

export async function apiGet(url, token) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return res.json();
}
