const fs = require("fs");
const path = require("path");

exports.shorthands = undefined;

exports.up = (pgm) => {
    const sql = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
    pgm.sql(sql);
};

exports.down = () => {
    throw new Error("La migración inicial no es reversible.");
};
