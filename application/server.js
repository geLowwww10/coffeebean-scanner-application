const express = require("express");
const path = require("path");
const app = express();
const { pool } = require("./db");
const bcrypt = require("bcrypt");
const session = require("express-session");
const flash = require("express-flash");
const passport = require("passport");

const PORT = process.env.PORT || 5000;

// Passport config
const initializePassport = require("./passport");
initializePassport(passport);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve all static files (HTML, CSS, JS, images, etc.)
app.use(express.static(path.join(__dirname, "views")));

// Session & Passport
app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// -------- ROUTES -------- //

// Home -> redirect to login
app.get("/", (req, res) => {
  res.redirect("/users/login");
});

// Public pages
app.get("/users/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});

app.get("/users/register", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "register.html"));
});

app.get("/users/about", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "about.html"));
});

// Protected pages
app.get("/users/dashboard", checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "dashboard.html"));
});

app.get("/users/scan", checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "scan.html"));
});

app.get("/users/profile", checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "profile.html"));
});

// Logout
app.get("/users/logout", (req, res) => {
  req.logout(err => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/users/login");
  });
});

// Register
app.post("/users/register", async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  let errors = [];

  if (!name || !email || !password || !confirmPassword) {
    errors.push("Please enter all fields");
  }
  if (password.length < 6) {
    errors.push("Password should be at least 6 characters");
  }
  if (password !== confirmPassword) {
    errors.push("Passwords do not match");
  }

  if (errors.length > 0) {
    return res.redirect(`/users/register?error=${encodeURIComponent(errors.join(", "))}`);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    pool.query("SELECT * FROM users WHERE email = $1", [email], (err, results) => {
      if (err) throw err;

      if (results.rows.length > 0) {
        return res.redirect("/users/register?error=Email already registered");
      } else {
        pool.query(
          "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id",
          [name, email, hashedPassword],
          (err, results) => {
            if (err) throw err;
            return res.redirect("/users/login?success=Registered successfully. Please login.");
          }
        );
      }
    });
  } catch (error) {
    console.error(error);
    res.send("Error while registering");
  }
});

// Login
app.post("/users/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.redirect(`/users/login?error=${encodeURIComponent(info.message)}`);
    }
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect("/users/dashboard");
    });
  })(req, res, next);
});

// Middleware to protect pages
function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/users/login");
}

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
