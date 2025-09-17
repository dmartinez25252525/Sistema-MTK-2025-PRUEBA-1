import { apiLogin } from "./api.js";

const form = document.getElementById("formLogin");
const msg = document.getElementById("msg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";

  const email = form.email.value.trim();
  const pasword = form.pasword.value.trim();

  const r = await apiLogin(email, pasword);
  if (!r.ok) {
    msg.textContent = r.msg || "Error en el servidor.";
    return;
  }
  localStorage.setItem("mtk_token", r.token);
  localStorage.setItem("mtk_user", JSON.stringify(r.user));
  window.location.href = "./dashboard.html";
});
