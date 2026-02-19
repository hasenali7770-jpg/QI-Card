// ===== إعدادات السيرفر =====
// ✅ هذا هو رابط Render الجديد حسب اللوجات عندك
const API_BASE = "https://qi-card.onrender.com";

// عناصر الصفحة
const emailInput = document.getElementById("emailInput");
const codeInput = document.getElementById("codeInput");
const sendCodeBtn = document.getElementById("sendCodeBtn");
const verifyBtn = document.getElementById("verifyBtn");
const codeBox = document.getElementById("codeBox");
const msg = document.getElementById("msg");

function setMsg(text, type) {
  msg.textContent = text || "";
  msg.className = "msg";
  if (type) msg.classList.add(type);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ✅ اسم مشروعك على GitHub Pages (Repo name)
const GH_PAGES_REPO = "QI-Card";

// يبني رابط الداشبورد بشكل صحيح سواء كنت على GitHub Pages أو Local
function getDashboardUrl() {
  const { hostname, origin } = window.location;

  // إذا كنت على GitHub Pages
  if (hostname.endsWith("github.io")) {
    return `${origin}/${GH_PAGES_REPO}/dashboard.html`;
  }

  // إذا Local / أي هوست ثاني
  return `${origin}/dashboard.html`;
}

/* =========================
   إرسال كود التحقق
========================= */
sendCodeBtn.addEventListener("click", async () => {
  const email = normalizeEmail(emailInput.value);

  if (!email) {
    return setMsg("أدخل البريد الإلكتروني.", "error");
  }

  sendCodeBtn.disabled = true;
  setMsg("جاري إرسال رمز التحقق...", "");

  try {
    const res = await fetch(`${API_BASE}/api/auth/send-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return setMsg(data.message || `فشل إرسال الرمز (HTTP ${res.status})`, "error");
    }

    codeBox.classList.remove("hidden");
    setMsg("تم إرسال رمز التحقق ✅ (تحقق من Render Logs)", "success");
    codeInput.focus();

    if (data.sessionId) {
      localStorage.setItem("qicard_session_id", data.sessionId);
    }
  } catch (err) {
    // ✅ تشخيص أوضح للمشكلة
    setMsg(
      "تعذر الاتصال بالسيرفر. تأكد أن API_BASE صحيح وأن السيرفر شغال (Render قد يكون نايم).",
      "error"
    );
    console.error("Send code error:", err);
  } finally {
    sendCodeBtn.disabled = false;
  }
});

/* =========================
   التحقق من الرمز
========================= */
verifyBtn.addEventListener("click", async () => {
  const email = normalizeEmail(emailInput.value);
  const code = String(codeInput.value || "").trim();
  const sessionId = localStorage.getItem("qicard_session_id");

  if (!email) {
    return setMsg("أدخل البريد الإلكتروني.", "error");
  }

  if (code.length !== 6) {
    return setMsg("رمز التحقق يجب أن يكون 6 أرقام.", "error");
  }

  verifyBtn.disabled = true;
  setMsg("جاري التحقق...", "");

  try {
    const res = await fetch(`${API_BASE}/api/auth/verify-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, sessionId }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) {
      return setMsg(data.message || `رمز غير صحيح (HTTP ${res.status})`, "error");
    }

    // ✅ تسجيل الدخول
    localStorage.setItem("qicard_kb_logged_in", "1");
    if (data.token) localStorage.setItem("qicard_token", data.token);

    setMsg("تم تسجيل الدخول بنجاح ✅", "success");

    // ✅ تحويل صحيح للداشبورد حسب بيئتك
    setTimeout(() => {
      window.location.href = getDashboardUrl();
    }, 600);
  } catch (err) {
    setMsg(
      "تعذر الاتصال بالسيرفر أثناء التحقق. افتح /health وتأكد أنه يعمل.",
      "error"
    );
    console.error("Verify code error:", err);
  } finally {
    verifyBtn.disabled = false;
  }
});
