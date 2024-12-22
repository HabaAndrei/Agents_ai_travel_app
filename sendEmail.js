require('dotenv').config();
const {EMAIL_PASSWORD, EMAIL_ACCOUNT} = process.env;
const nodemailer = require("nodemailer");

module.exports = async function (context, req) {

  const {code, email} = req.body;
  let rez = {isResolved: true};

  try {

    const transporter = nodemailer.createTransport({
      service: "Gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: EMAIL_ACCOUNT,
        pass: EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: EMAIL_ACCOUNT,
      to: email,
      subject: "Hello from Nodemailer",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border: 1px solid #ddd; border-radius: 10px;">
          <h1 style="color: #1e90ff; text-align: center;">Welcome to TravelBot! 🎉</h1>
          <p>We’re thrilled to have you join us! To get started, simply enter the verification code below in the app:</p>
          <p style="font-size: 24px; font-weight: bold; color: #1e90ff; text-align: center; margin: 20px 0;">${code}</p>
          <p>This code will expire in 10 minutes.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
          <p>If you didn’t sign up, no worries! Just ignore this email.</p>
          <p style="margin-top: 40px; color: #7f8c8d; font-size: 14px; text-align: center;">Warm regards,<br/>The TravelBot Team</p>
          <p style="font-size: 12px; color: #bdc3c7; text-align: center;">This is an automated message, please do not reply.</p>
        </div>
      `,

    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        rez = {isResolved: false, err: error.message};
      } else {
        rez = {isResolved: true};
      }
    });
  } catch (err) {
    rez = {isResolved: false, err: err.message};
  }

  context.res = {
    body: rez
  };
}
