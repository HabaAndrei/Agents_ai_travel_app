const nodemailer = require("nodemailer");
const EnvConfig = require('../providers/EnvConfig.js');

const envVariable = EnvConfig.getInstance();

class Mailer {

  constructor(){
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: envVariable.get('EMAIL_ACCOUNT'),
        pass: envVariable.get('EMAIL_PASSWORD'),
      },
    });
  }

  async sendEmail({emailTo, subject, htmlContent}){
    try {
      const mailOptions = {
        from: envVariable.get('EMAIL_ACCOUNT'),
        to: emailTo,
        subject: subject,
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      return { isResolved: true};
    }catch(err){
      return { isResolved: false, err: err.message };
    }
  }

}

module.exports = Mailer;