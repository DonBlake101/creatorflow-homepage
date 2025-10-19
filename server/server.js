import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cookieSession from "cookie-session";
import crypto from "crypto";
import cors from "cors";

dotenv.config();

const app = express();
const {
  SERVER_URL=https://creatorflow-auth.vercel.app        # replace after you deploy if you pick a different name
FRONTEND_URL=https://donblake101.github.io/creatorflow-homepage
TIKTOK_CLIENT_KEY=aw422o4b2fjj3cri
TIKTOK_CLIENT_SECRET=PASTE_YOUR_REAL_SECRET_HERE
SESSION_SECRET=make_this_long_random_like_64chars
SCOPES=user.info.basic user.info.profile user.info.stats video.list
} = process.env;

if (!SERVER_URL || !FRONTEND_URL || !TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
  console.error("Missing env: SERVER_URL, FRONTEND_URL, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET");
  process.exit(1);
}

app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieSession({
  name: "sess",
  secret: SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
  httpOnly: true,
  sameSite: "none",
  secure: true
}));

app.get("/auth/tiktok", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.state = state;

  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.searchParams.set("client_key", TIKTOK_CLIENT_KEY);
  u.searchParams.set("redirect_uri", `${SERVER_URL}/auth/tiktok/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);

  res.redirect(u.toString());
});

app.get("/auth/tiktok/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state || state !== req.session.state) return res.status(400).send("Invalid state or missing code");
  req.session.state = null;

  const tokenRes = await fetch("https://open-api.tiktok.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      code: code.toString(),
      grant_type: "authorization_code",
      redirect_uri: `${SERVER_URL}/auth/tiktok/callback`
    })
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    return res.status(400).send(`Token exchange failed: ${JSON.stringify(tokens)}`);
  }

  req.session.tiktok = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    open_id: tokens.open_id,
    expires_in: tokens.expires_in
  };

  res.redirect(`${FRONTEND_URL}/callback.html#login=success`);
});

app.get("/api/me", async (req, res) => {
  const s = req.session.tiktok;
  if (!s?.access_token || !s?.open_id) return res.status(401).json({ error: "Not logged in" });

  try {
    const infoRes = await fetch("https://open-api.tiktok.com/user/info/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: s.access_token,
        open_id: s.open_id,
        fields: ["open_id","display_name","avatar_url","union_id"]
      })
    });
    const info = await infoRes.json();
    res.json(info);
  } catch {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

app.get("/", (_req, res) => res.send("TikTok auth server running"));
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
