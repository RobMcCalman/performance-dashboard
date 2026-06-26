// Auth0 SSO gate for the static MrQ performance dashboard (index.html).
// Serves the dashboard only after Auth0 login. Uses Auth0's official Express SDK.
const express = require("express");
const path = require("path");
const { auth, requiresAuth } = require("express-openid-connect");

const {
  AUTH0_DOMAIN,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  SESSION_SECRET,
  BASE_URL,
  PORT = 3000,
} = process.env;

for (const [k, v] of Object.entries({ AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, SESSION_SECRET, BASE_URL })) {
  if (!v) { console.error("Missing required environment variable: " + k); process.exit(1); }
}

const app = express();
app.set("trust proxy", true); // Railway terminates TLS in front of the app

app.use(
  auth({
    issuerBaseURL: `https://${AUTH0_DOMAIN}`,
    baseURL: BASE_URL,
    clientID: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
    secret: SESSION_SECRET,
    authRequired: false, // protect specific routes (so /healthz can stay public)
    authorizationParams: { response_type: "code", scope: "openid profile email" },
    routes: { login: "/login", logout: "/logout", callback: "/callback" },
  })
);

// Public health check (no login) — handy for uptime monitors.
app.get("/healthz", (_req, res) => res.send("ok"));

// The dashboard — login required. Unauthenticated users are redirected to Auth0.
app.get("/", requiresAuth(), (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.listen(PORT, () => console.log("Dashboard (Auth0-gated) listening on port " + PORT));
