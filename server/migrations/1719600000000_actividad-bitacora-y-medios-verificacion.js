const fs = require("fs");
const path = require("path");

exports.shorthands = undefined;

exports.up = (pgm) => {
    // Se elimina la firma electrónica simple: ya no forma parte del producto.
    pgm.sql("DROP TABLE IF EXISTS firmas CASCADE;");

    const sql = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
    pgm.sql(sql);
};

exports.down = () => {
    throw new Error("Esta migración no es reversible.");
};
