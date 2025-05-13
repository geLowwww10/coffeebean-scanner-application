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

app.get("/api/user", checkAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT name, email, created_at as joinDate FROM users WHERE id = $1",
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching user data:", error);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/api/user/statistics", checkAuthenticated, async (req, res) => {
  try {
    // Get total scans
    const scansResult = await pool.query(
      "SELECT COUNT(*) as total_scans, MAX(created_at) as last_scan FROM scan_history WHERE user_id = $1",
      [req.user.id]
    );
    
    res.json({
      totalScans: parseInt(scansResult.rows[0].total_scans),
      lastScan: scansResult.rows[0].last_scan
    });
  } catch (error) {
    console.error("Error fetching user statistics:", error);
    res.status(500).json({ error: "Failed to fetch user statistics" });
  }
});

app.post("/api/user/update", checkAuthenticated, async (req, res) => {
  try {
    const { name, email } = req.body;
    
    // Validate input
    if (!name && !email) {
      return res.status(400).json({ error: "No data provided for update" });
    }
    
    // Check if email is being updated and if it's already taken
    if (email) {
      const emailCheck = await pool.query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email, req.user.id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: "Email already in use" });
      }
    }
    
    // Build update query dynamically based on provided fields
    let updateFields = [];
    let values = [];
    let paramCount = 1;
    
    if (name) {
      updateFields.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }
    if (email) {
      updateFields.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }
    
    values.push(req.user.id);
    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING name, email
    `;
    
    const result = await pool.query(updateQuery, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating user data:", error);
    res.status(500).json({ error: "Failed to update user data" });
  }
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

    // Get absolute paths
    const pythonPath = path.resolve(__dirname, "../venv310/Scripts/python.exe");
    const scriptPath = path.resolve(__dirname, "../ml_model/predict.py");
    const imagePath = path.resolve(req.file.path);

    // Log paths for debugging
    console.log("Python Path:", pythonPath);
    console.log("Script Path:", scriptPath);
    console.log("Image Path:", imagePath);

    // Check if paths exist
    if (!fs.existsSync(pythonPath)) {
      throw new Error(`Python interpreter not found at: ${pythonPath}`);
    }
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Prediction script not found at: ${scriptPath}`);
    }
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Uploaded image not found at: ${imagePath}`);
    }

    // Set up Python process with environment variables
    const env = {
      ...process.env,
      PYTHONPATH: path.resolve(__dirname, "../ml_model"),
      PYTHONUNBUFFERED: "1"
    };

    const python = spawn(pythonPath, [scriptPath, imagePath], { env });
    let result = "";
    let errorOutput = "";

    python.stdout.on("data", data => {
      const output = data.toString();
      console.log("Python stdout:", output);  // Debugging output
      result += output;
    });
    
    python.stderr.on("data", data => {
      const error = data.toString();
      console.error("Python stderr:", error);  // Debugging error
      errorOutput += error;
    });

    python.on("error", (error) => {
      console.error("Failed to start Python process:", error);
      throw error;
    });

    python.on("close", async (code) => {
      try {
        console.log("Python process exited with code:", code);
        console.log("Full output:", result);
        if (errorOutput) console.error("Error output:", errorOutput);
        
        if (code !== 0) {
          throw new Error(`Python process failed with code ${code}: ${errorOutput}`);
        }

        let predictions;
        try {
          predictions = JSON.parse(result);
        } catch (e) {
          console.error("Failed to parse Python output:", result);
          throw new Error("Failed to parse prediction results");
        }

        if (predictions.error) {
          throw new Error(predictions.error);
        }

        const { Flavor: flavor, Aroma: aroma, Body: body, Acidity: acidity } = predictions;
        const overall_quality = ((flavor + aroma + body + acidity) / 4).toFixed(2);
        const permanentImagePath = path.join(permanentUploadsDir, req.file.filename);
        
        // Ensure permanent uploads directory exists
        if (!fs.existsSync(permanentUploadsDir)) {
          fs.mkdirSync(permanentUploadsDir, { recursive: true });
        }

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
