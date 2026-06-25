const { Pool, types } = require("pg");

// OID 1082 = columna DATE: devolver el string crudo (YYYY-MM-DD) en vez de
// un objeto Date, para no introducir desfaces de zona horaria en la UI.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
