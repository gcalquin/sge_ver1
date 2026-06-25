const nodemailer = require("nodemailer");
const { logger } = require("./logger");

const smtpConfigurado = Boolean(process.env.SMTP_HOST);

const transporter = smtpConfigurado
    ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    : null;

async function enviarCorreo({ to, subject, text, html }) {
    if (!smtpConfigurado) {
        logger.info({ to, subject, text }, "[mailer] SMTP no configurado, modo dry-run: correo solo logueado");
        return { dryRun: true };
    }

    return transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
    });
}

module.exports = { enviarCorreo, smtpConfigurado };
