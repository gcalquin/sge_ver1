const { logger } = require("./logger");

// Integración con Twilio / WhatsApp Business API. Sin credenciales configuradas
// opera en modo dry-run (solo se registra en el log), igual que el mailer.
const twilioConfigurado = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

let twilioClient = null;
if (twilioConfigurado) {
    twilioClient = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

async function enviarWhatsapp({ to, mensaje }) {
    if (!twilioConfigurado) {
        logger.info({ to, mensaje }, "[whatsapp] Twilio no configurado, modo dry-run: mensaje solo logueado");
        return { dryRun: true };
    }
    return twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
        to: `whatsapp:${to}`,
        body: mensaje,
    });
}

async function enviarSms({ to, mensaje }) {
    if (!twilioConfigurado) {
        logger.info({ to, mensaje }, "[sms] Twilio no configurado, modo dry-run: mensaje solo logueado");
        return { dryRun: true };
    }
    return twilioClient.messages.create({ from: process.env.TWILIO_SMS_FROM, to, body: mensaje });
}

module.exports = { enviarWhatsapp, enviarSms, twilioConfigurado };
