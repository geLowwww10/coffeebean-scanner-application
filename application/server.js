// Fixed and complete server.js
const express = require("express");
const path = require("path");
const app = express();
const { pool } = require("./db");
const bcrypt = require("bcrypt");
const session = require("express-session");
const flash = require("express-flash");
const passport = require("passport");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");

const PORT = process.env.PORT || 5000;

// Passport config
const initializePassport = require("./passport");
initializePassport(passport);

// Ensure uploads directories exist
const uploadsDir = path.join(__dirname, "uploads");
const permanentUploadsDir = path.join(__dirname, "uploads", "permanent");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(permanentUploadsDir)) fs.mkdirSync(permanentUploadsDir);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
      return cb(new Error("Only image files are allowed!"), false);
    }
    cb(null, true);
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "views")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(session({
  secret: "secret",
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect("/users/login");
}

// Routes
app.get("/", (req, res) => res.redirect("/users/login"));
app.get("/users/login", (req, res) => res.sendFile(path.join(__dirname, "views", "login.html")));
app.get("/users/register", (req, res) => res.sendFile(path.join(__dirname, "views", "register.html")));
app.get("/users/dashboard", checkAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views", "dashboard.html")));
app.get("/users/scan", checkAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views", "scan.html")));
app.get("/users/history", checkAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views", "history.html")));
app.get("/users/about", checkAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views", "about.html")));
app.get("/users/profile", checkAuthenticated, (req, res) => res.sendFile(path.join(__dirname, "views", "profile.html")));

app.post("/users/register", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    return res.redirect("/users/register?error_msg=Passwords do not match");
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length > 0) {
      return res.redirect("/users/register?error_msg=Email already registered");
    }
    await pool.query("INSERT INTO users (name, email, password) VALUES ($1, $2, $3)", [name, email, hashedPassword]);
    res.redirect("/users/login?success_msg=Registered successfully");
  } catch (err) {
    console.error("Registration error:", err);
    res.redirect("/users/register?error_msg=Something went wrong");
  }
});

app.post("/users/login", passport.authenticate("local", {
  successRedirect: "/users/dashboard",
  failureRedirect: "/users/login?error=Invalid credentials",
  failureFlash: true
}));

app.get("/users/logout", (req, res) => {
  req.logout(err => {
    if (err) console.error("Logout error:", err);
    res.redirect("/users/login?success_msg=Logged out successfully");
  });
});

app.get("/api/user", checkAuthenticated, (req, res) => {
  res.json({ name: req.user.name });
});

app.get("/api/scan-history", checkAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, image_path, flavor, aroma, body, acidity, overall_quality, created_at FROM scan_history WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, history: result.rows });
  } catch (error) {
    console.error("Error fetching scan history:", error);
    res.status(500).json({ success: false, error: "Failed to fetch scan history" });
  }
});

app.post("/users/scan/predict", checkAuthenticated, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "Please upload an image" });

    const python = spawn("python", [path.join(__dirname, "../ml_model/predict.py"), req.file.path]);
    let result = "";

    python.stdout.on("data", data => result += data.toString());
    python.stderr.on("data", data => console.error("Python error:", data.toString()));

    python.on("close", async (code) => {
      try {
        if (code !== 0) throw new Error("Python process failed");
        const predictions = JSON.parse(result);
        const { flavor, aroma, body, acidity } = predictions;
        const overall_quality = ((flavor + aroma + body + acidity) / 4).toFixed(2);
        const permanentImagePath = path.join(permanentUploadsDir, req.file.filename);
        fs.copyFileSync(req.file.path, permanentImagePath);

        await pool.query(
          `INSERT INTO scan_history (user_id, image_path, flavor, aroma, body, acidity, overall_quality) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.user.id, req.file.filename, flavor, aroma, body, acidity, overall_quality]
        );

        fs.unlink(req.file.path, () => {});

        res.json({
          success: true,
          predictions: { flavor, aroma, body, acidity, overall_quality, image_path: `/uploads/permanent/${req.file.filename}` }
        });
      } catch (err) {
        fs.unlink(req.file.path, () => {});
        res.status(500).json({ success: false, error: err.message });
      }
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
