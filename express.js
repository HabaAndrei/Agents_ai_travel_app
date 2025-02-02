const express = require('express');
const app = express();
const cors = require('cors')
const OpenaiClient = require('./providers/OpenaiClient.js');
const {ActivityGenerator} = require('./aiGeneration/ActivityGenerator.js');
const {LocationGenerator} = require('./aiGeneration/LocationGenerator.js');
const {ProgramGenerator} = require('./aiGeneration/ProgramGenerator.js');
const {ChatResponseGenerator} = require('./aiGeneration/ChatResponseGenerator.js');
const {Mailer} = require('./mailer/Mailer.js')
const { searchDestination } = require('./diverse/searchDestination.js')
const EmailContentProvider = require('./mailer/EmailContentProvider.js');
const validateFieldsAiGeneration = require('./middlewares/validateFieldsAiGeneration');
app.use(cors());
app.use(express.json());

// instances of classes
const openaiClient = new OpenaiClient();
const activityGeneratior = new ActivityGenerator();
const locationGenerator = new LocationGenerator();
const programGenerator = new ProgramGenerator();
const chatResponseGenerator = new ChatResponseGenerator();


///////////////////////////////////
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
