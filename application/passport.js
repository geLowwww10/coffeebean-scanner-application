// Fixed passport.js
const LocalStrategy = require("passport-local").Strategy;
const { pool } = require("./db");
const bcrypt = require("bcrypt");

function initialize(passport) {
  const authenticateUser = (email, password, done) => {
    pool.query("SELECT * FROM users WHERE email = $1", [email], (err, results) => {
      if (err) return done(err);

      if (results.rows.length > 0) {
        const user = results.rows[0];
        bcrypt.compare(password, user.password, (err, isMatch) => {
          if (err) return done(err);
          return isMatch ? done(null, user) : done(null, false, { message: "Incorrect password" });
        });
      } else {
        return done(null, false, { message: "No user with that email" });
      }
    });
  };

  passport.use(new LocalStrategy({ usernameField: "email" }, authenticateUser));

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser((id, done) => {
    pool.query("SELECT * FROM users WHERE id = $1", [id], (err, results) => {
      if (err) return done(err);
      done(null, results.rows[0]);
    });
  });
}

module.exports = initialize;
