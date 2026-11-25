import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Envía el informe HTML por SMTP con la configuración de `.env` (SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS, MAIL_FROM, MAIL_TO). Devuelve un texto con el resultado; nunca lanza.
 */
export async function enviarInforme(asunto: string, html: string, adjuntos: string[]): Promise<string> {
  const { SMTP_HOST = 'smtp.gmail.com', SMTP_PORT = '465', SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
  if (!SMTP_USER || !SMTP_PASS || !MAIL_TO) return '✉️  Correo no enviado: faltan SMTP_USER / SMTP_PASS / MAIL_TO en .env';
  try {
    const port = Number(SMTP_PORT);
    const transporte = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    const info = await transporte.sendMail({
      from: process.env.MAIL_FROM || SMTP_USER,
      to: MAIL_TO,
      subject: asunto,
      html,
      attachments: adjuntos.filter((a) => fs.existsSync(a)).map((a) => ({ filename: nombreAdjunto(a), path: a })),
    });
    return `✉️  Correo enviado a ${MAIL_TO} (messageId ${info.messageId}, respuesta: ${info.response})`;
  } catch (e) {
    return `✉️  ERROR al enviar el correo: ${(e as Error).message}`;
  }
}

const nombreAdjunto = (a: string) => (path.basename(a) === 'index.html' ? 'playwright-report.html' : path.basename(a));
