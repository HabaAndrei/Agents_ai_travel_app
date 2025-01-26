const express = require('express');
const app = express();
const cors = require('cors')
const {ApiCompletionProgram} = require('./azureFunctions/ApiCompletionProgram.js');
const {ApiCompletionChat} = require('./azureFunctions/ApiCompletionChat.js');
const {ApiCompletionLocations} = require('./azureFunctions/ApiCompletionLocations.js');
const {ApiCompletionActivities} = require('./azureFunctions/ApiCompletionActivities.js');
const {Mailer} = require('./azureFunctions/Mailer.js')
const { searchDestination } = require('./azureFunctions/searchDestination.js')
app.use(cors());
app.use(express.json());

// validate fields for functions that call AI generation
function validateFieldsAiGeneration(req, res, next) {
  const { method } = req.query;
  // Allowed methods
  const methodsAllowed = ['createProgram', 'seeAllPlaces', 'createActivities', 'chat'];
  // if the method does not exist or is not included in the allowed methods, return a 404 response
  if (!method || !methodsAllowed.includes(method)) return res.sendStatus(404);

  // methods and their required fields
  const methodsWithFields = {
    'createProgram': ['from', 'to', 'city', 'country', 'locations', 'hotelAddress'],
    'seeAllPlaces': ['city', 'country', 'input', 'checkbox', 'isLocalPlaces', 'scaleVisit'],
    'createActivities': ['city', 'country'],
    'chat': ['historyConv', 'information'],
  };
  // if any required field is undefined, return a 404 response
  methodsWithFields[method].forEach((field) => {
    if (req.body[`${field}`] === undefined) return res.sendStatus(404);
  });

  return next();
}

// RCP api
app.post('/ai-generation', validateFieldsAiGeneration, async (req, res)=>{

  const {method} = req.query;
  let rezFinal = '';

  const {from, to, city, country, locations, input, checkbox, isLocalPlaces,
    scaleVisit, historyConv, information, value, hotelAddress} = req.body;

  switch (method) {
    case ('createProgram') : {
      const api = new ApiCompletionProgram({from, to, city, country, locations, hotelAddress});
      rezFinal = await api.createProgram();
      break;
    }
    case ('seeAllPlaces') : {
      const api = new ApiCompletionLocations({city, country, input, checkbox, isLocalPlaces, scaleVisit});
      rezFinal = await api.getAllPlacesAboutLocations();
      break;
    }
    case ('createActivities') : {
      const api = new ApiCompletionActivities({city, country});
      rezFinal = await api.createActivities();
      break;
    }
    case ('chat') : {
      const api = new ApiCompletionChat({historyConv, information});
      rezFinal = await api.responseQuestion();
      break;
    }
  }
  res.send(rezFinal);
});

app.get('/search-destination', async (req, res) => {
  const {input, country, value} = req.query;
  rezFinal = searchDestination(input, country, value);
  res.send(rezFinal);
});

app.post('/send-code-email-verification', async (req, res) => {
  const {code, email} = req.body;
  const emailTo = email;
  const subject = "Welcome to TravelBot! 🎉";
  const htmlContent = `
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
  `;

  const mailer = new Mailer();
  const result = await mailer.sendEmail({emailTo, subject, htmlContent});
  res.send(result);
})

app.listen(5050, ()=>{
  console.log('express in listening on port 5050')
})
