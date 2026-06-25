const session = require("express-session");
const ConnectPgSimple = require("connect-pg-simple")(session);
const { pool } = require("./db");

const PgSession = new ConnectPgSimple({ pool, tableName: "session", createTableIfMissing: false });

const sessionMiddleware = session({
    store: PgSession,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 12, // 12 horas
    },
});

module.exports = { sessionMiddleware };
