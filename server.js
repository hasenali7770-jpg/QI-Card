const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

// ===================== إعدادات =====================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET; // ✅ لازم من Render Env
const CODE_TTL_MS = 10 * 60 * 1000; // 10 دقائق
const ALLOWED_DOMAIN = "@qi.iq";

// ✅ Origins مسموحة (GitHub Pages + Local)
const ALLOWED_ORIGINS = [
  "https://hasenali7770-jpg.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
];

// ===================== Middlewares =====================
app.use(
  cors({
    origin: function (origin, callback) {
      // requests بدون Origin (مثل curl/health) نخليها تمر
      if (!origin) return callback(null, true);

      // سماح لجيتهب بيدجز (أي ريبوزيتوري)
      if (origin === "https://hasenali7770-jpg.github.io") return callback(null, true);

      // سماح للوكال
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

      // غير مسموح
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

// ✅ مهم للـ preflight
app.options("*", cors());

app.use(express.json());

// ✅ تحذير إذا JWT_SECRET مو مضبوط
if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET is not set. Add it in Render Environment Variables.");
}

// ===================== تخزين مؤقت =====================
// sessionId -> { email, code, expiresAt, attempts }
const sessions = new Map();

// IP rate-limit بسيط لـ send-code
// ip -> { count, resetAt }
const ipLimits = new Map();
const LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 دقائق
const LIMIT_MAX = 10;

// تنظيف كل دقيقة
setInterval(() => {
  const now = Date.now();

  for (const [sid, s] of sessions.entries()) {
    if (!s || s.expiresAt <= now) sessions.delete(sid);
  }

  for (const [ip, v] of ipLimits.entries()) {
    if (!v || v.resetAt <= now) ipLimits.delete(ip);
  }
}, 60 * 1000);

// ===================== أدوات مساعدة =====================
function random6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function makeSessionId() {
  return "sid_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getClientIp(req) {
  // Render عادة يحط ip الحقيقي بالـ x-forwarded-for
  const xf = req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// ===================== Routes =====================

// فحص السيرفر
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    name: "QiCard Auth API",
    time: new Date().toISOString(),
  });
});

// إرسال رمز التحقق
app.post("/api/auth/send-code", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const ip = getClientIp(req);

  if (!email) {
    return res.status(400).json({ success: false, message: "البريد مطلوب" });
  }

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    return res.status(403).json({
      success: false,
      message: `يسمح فقط ببريد الشركة (${ALLOWED_DOMAIN})`,
    });
  }

  // ✅ Rate limit بسيط
  const now = Date.now();
  const lim = ipLimits.get(ip) || { count: 0, resetAt: now + LIMIT_WINDOW_MS };
  if (lim.resetAt <= now) {
    lim.count = 0;
    lim.resetAt = now + LIMIT_WINDOW_MS;
  }
  lim.count += 1;
  ipLimits.set(ip, lim);

  if (lim.count > LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      message: "طلبات كثيرة، حاول بعد قليل.",
    });
  }

  const sessionId = makeSessionId();
  const code = random6();

  sessions.set(sessionId, {
    email,
    code,
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
  });

  // يظهر في Render Logs
  console.log(`[QiCard] Verification code for ${email}: ${code}`);

  return res.json({
    success: true,
    sessionId,
  });
});

// التحقق من الرمز
app.post("/api/auth/verify-code", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code || "").trim();
  const sessionId = String(req.body?.sessionId || "").trim();

  if (!email || !code || !sessionId) {
    return res.status(400).json({ success: false, message: "بيانات ناقصة" });
  }

  const s = sessions.get(sessionId);
  if (!s) {
    return res.status(401).json({ success: false, message: "الجلسة غير صالحة" });
  }

  if (Date.now() > s.expiresAt) {
    sessions.delete(sessionId);
    return res.status(401).json({ success: false, message: "انتهت صلاحية الرمز" });
  }

  s.attempts++;
  if (s.attempts > 6) {
    sessions.delete(sessionId);
    return res.status(429).json({ success: false, message: "محاولات كثيرة" });
  }

  if (s.email !== email || s.code !== code) {
    return res.status(401).json({ success: false, message: "رمز غير صحيح" });
  }

  sessions.delete(sessionId);

  if (!JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "JWT_SECRET غير مضبوط على السيرفر (Render Env).",
    });
  }

  const token = jwt.sign({ email, app: "qicard-kb" }, JWT_SECRET, {
    expiresIn: "12h",
  });

  return res.json({ success: true, token });
});

// ===================== تشغيل السيرفر =====================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`QiCard Auth API running on 0.0.0.0:${PORT}`);
});
