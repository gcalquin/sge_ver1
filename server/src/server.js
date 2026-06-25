require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const app = require("./app");
const { logger } = require("./config/logger");

const port = process.env.PORT || 3000;
app.listen(port, () => {
    logger.info(`SGE escuchando en http://localhost:${port}`);
});
