const express = require('express');
const app = express();
const cors = require('cors')
const {ApiCompletionProgram} = require('./azureFunctions/ApiCompletionProgram.js');
const {ApiCompletionChat} = require('./azureFunctions/ApiCompletionChat.js');
const {ApiCompletionLocations} = require('./azureFunctions/ApiCompletionLocations.js');
const {ApiCompletionActivities} = require('./azureFunctions/ApiCompletionActivities.js');
const {Mailer} = require('./mailer/Mailer.js')
const { searchDestination } = require('./azureFunctions/searchDestination.js')
const EmailContentProvider = require('./mailer/EmailContentProvider.js');
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
  const { code, email } = req.body;

  // create an instance of the EmailContentProvider class
  const emailContentProvider = new EmailContentProvider();

  // retrieve the email template details for verification emails
  const detailsEmail = emailContentProvider.getContent('verifyEmail');
  let { subject, htmlContent, contentToReplace } = detailsEmail;

  // replace the placeholder in the email template with the actual verification code
  htmlContent = htmlContent.replaceAll(contentToReplace, code);

  // send the email using the Mailer class
  const mailer = new Mailer();
  const result = await mailer.sendEmail({ emailTo: email, subject, htmlContent });

  // send the result of the email operation as a response
  res.send(result);
});


app.listen(5050, ()=>{
  console.log('express in listening on port 5050')
})
