const express = require('express');
const app = express();
const cors = require('cors')
const {ActivityGenerator} = require('./azureFunctions/ActivityGenerator.js');
const {LocationGenerator} = require('./azureFunctions/LocationGenerator.js');
const {ProgramGenerator} = require('./azureFunctions/ProgramGenerator.js');
const {ChatResponseGenerator} = require('./azureFunctions/ChatResponseGenerator.js');
const {Mailer} = require('./mailer/Mailer.js')
const { searchDestination } = require('./azureFunctions/searchDestination.js')
const EmailContentProvider = require('./mailer/EmailContentProvider.js');
app.use(cors());
app.use(express.json());


// instances of classes
const activityGeneratior = new ActivityGenerator();
const locationGenerator = new LocationGenerator();
const programGenerator = new ProgramGenerator();
const chatResponseGenerator = new ChatResponseGenerator();


///////////////////////////////////

// validate fields for functions that call AI generation
function validateFieldsAiGeneration(req, res, next) {
  const { method } = req.query;
  // Allowed methods
  const methodsAllowed = ['generateActivities', 'generateLocations', 'generateProgram', 'generateChatResponse'];
  // if the method does not exist or is not included in the allowed methods, return a 404 response
  if (!method || !methodsAllowed.includes(method)) return res.sendStatus(404);

  // methods and their required fields
  const methodsWithFields = {
    'generateActivities': ['city', 'country'],
    'generateLocations': ['city', 'country', 'customActivity', 'selectedActivities', 'isLocalPlaces', 'scaleVisit'],
    'generateProgram': ['startDate', 'endDate', 'city', 'country', 'locations', 'hotelAddress'],
    'generateChatResponse': ['historyConv', 'tripsData'],
  };
  // if any required field is undefined, return a 404 response
  methodsWithFields[method].forEach((field) => {
    // 422 Unprocessable Entity
    if (req.body[`${field}`] === undefined) return res.sendStatus(422);
  });

  return next();
}

// RCP api
app.post('/ai-generation', validateFieldsAiGeneration, async (req, res)=>{

  const {method} = req.query;
  let rezFinal = '';

  const {startDate, endDate, city, country, locations, customActivity, selectedActivities, hotelAddress,
    isLocalPlaces, scaleVisit, historyConv, tripsData
  } = req.body;

  switch (method) {
    case ('generateActivities') : {
      rezFinal = await activityGeneratior.generateActivities({city, country});
      break;
    }
    case ('generateLocations') : {
      rezFinal = await locationGenerator.generateLocations({city, country, customActivity, selectedActivities, isLocalPlaces, scaleVisit, isCalledFirstTime: true});
      break;
    }
    case ('generateProgram') : {
      rezFinal = await programGenerator.generateProgram({startDate, endDate, city, country, locations, hotelAddress, isCalledFirstTime: true});
      break;
    }
    case ('generateChatResponse') : {
      rezFinal = await chatResponseGenerator.generateChatResponse({historyConv, tripsData});
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
