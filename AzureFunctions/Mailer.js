require('dotenv').config();
const {EMAIL_PASSWORD, EMAIL_ACCOUNT} = process.env;
const nodemailer = require("nodemailer");

class Mailer {

  constructor(){
    this.transporter = nodemailer.createTransport({
      service: "Gmail",
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: EMAIL_ACCOUNT,
        pass: EMAIL_PASSWORD,
      },
    });
  }

  async sendEmail({emailTo, subject, htmlContent}){
    try {
      const mailOptions = {
        from: EMAIL_ACCOUNT,
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

module.exports =  {Mailer};