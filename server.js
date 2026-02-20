require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const db = require("./db");

const app = express();

/** IMPORTANT: behind Nginx reverse proxy */
app.set("trust proxy", true);

app.use(express.json());

/**
 * CORS
 * - Dev: allow localhost
 * - Prod: allow your real domains
 *
 * Set FRONTEND_ORIGINS in .env as comma-separated list.
 * Example:
 * FRONTEND_ORIGINS=http://localhost:5173,https://cinegate.com,https://www.cinegate.com
 */
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// safe default for dev if env not set
const defaultDevOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

const allowedOrigins = FRONTEND_ORIGINS.length ? FRONTEND_ORIGINS : defaultDevOrigins;

app.use(
  cors({
    origin: function (origin, cb) {
      // allow curl/postman/no-origin requests
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    methods: ["GET", "POST"],
  })
);

const PORT = process.env.PORT || 3000;

/**
 * Public base URL used for generating links returned to the frontend.
 * In production you should set:
 * PUBLIC_BASE_URL=https://api.cinegate.com
 */
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

// generates base URL from the current request (works behind nginx due to trust proxy)
function baseUrlFromReq(req) {
  const proto = req.protocol; // respects X-Forwarded-Proto when trust proxy is true
  const host = req.get("host");
  return `${proto}://${host}`;
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip || "").digest("hex");
}

function detectOs(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function detectDeviceType(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile")) return "mobile";
  return "desktop";
}

app.post("/api/demo/session", (req, res) => {
  const sessionId = uuidv4();
  const userAgent = req.headers["user-agent"] || "";
  const referrer = req.headers["referer"] || "";
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.socket.remoteAddress;

  const os = req.body?.os || detectOs(userAgent);
  const deviceType = req.body?.deviceType || detectDeviceType(userAgent);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // ✅ FIX: ensure session is active immediately
  const status = "active";

  db.prepare(
    `INSERT INTO demo_sessions (id, os, device_type, referrer, ip_hash, user_agent, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, os, deviceType, referrer, hashIp(ip), userAgent, expiresAt, status);

  const base = PUBLIC_BASE_URL || baseUrlFromReq(req);

  const filmUrl = `${base}/download/${sessionId}/film`;
  const playerWinUrl = `${base}/download/${sessionId}/player_win`;
  const playerMacUrl = `${base}/download/${sessionId}/player_mac`;

  res.json({
    sessionId,
    filmUrl,
    playerWinUrl,
    playerMacUrl,
    os,
    deviceType,
    expiresAt,
  });
});

app.get("/download/:sessionId/:fileType", (req, res) => {
  const { sessionId, fileType } = req.params;

  const session = db
    .prepare("SELECT * FROM demo_sessions WHERE id = ?")
    .get(sessionId);

  if (!session) return res.status(404).send("Invalid session");

  // keep this check, now it works because status is set on insert
  if (session.status !== "active") return res.status(403).send("Session not active");

  if (session.expires_at) {
    const exp = new Date(session.expires_at).getTime();
    if (Date.now() > exp) return res.status(403).send("Session expired");
  }

  /** ✅ EXACT NAMES FROM YOUR downloads/ FOLDER */
  const map = {
    film: "myvideo.vop",
    player_win: "ViewOncePlayer-Setup.exe",
    player_mac: "CineBridgePlayer-Mac.dmg",
  };

  const filename = map[fileType];
  if (!filename) return res.status(400).send("Unknown file type");

  const filePath = path.join(__dirname, "downloads", filename);

  if (!fs.existsSync(filePath)) {
    console.error("Missing file:", filePath);
    return res.status(500).send("File missing on server");
  }

  // log event before sending
  db.prepare(
    `INSERT INTO demo_download_events (id, session_id, file_type)
     VALUES (?, ?, ?)`
  ).run(uuidv4(), sessionId, fileType);

  return res.download(filePath, filename);
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on :${PORT}`);
  if (!PUBLIC_BASE_URL) {
    console.log("PUBLIC_BASE_URL not set (OK in dev). Links will be generated from request host.");
  } else {
    console.log(`PUBLIC_BASE_URL = ${PUBLIC_BASE_URL}`);
  }
});