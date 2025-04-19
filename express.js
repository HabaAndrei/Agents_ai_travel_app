const express = require('express');
const app = express();
const cors = require('cors')
const ActivityGenerator = require('./aiGeneration/ActivityGenerator.js');
const LocationGenerator = require('./aiGeneration/LocationGenerator.js');
const ProgramGenerator = require('./aiGeneration/ProgramGenerator.js');
const ChatResponseGenerator = require('./aiGeneration/ChatResponseGenerator.js');
const ImageLocationGenerator = require('./aiGeneration/ImageLocationGenerator.js');
const Mailer = require('./mailer/Mailer.js')
const DestinationSearch = require('./diverse/DestinationSearch.js')
const EmailContentProvider = require('./mailer/EmailContentProvider.js');
const validateFieldsAiGeneration = require('./handlers/validateFieldsAiGeneration');
const authenticatedUser = require('./handlers/authenticatedUser.js');
const manageResponse = require('./handlers/manageResponse.js');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static('public'));
app.use('/images', express.static('images'));

///////////////////////////////////
// instances of classes

const activityGenerator = new ActivityGenerator();
const locationGenerator = new LocationGenerator();
const programGenerator = new ProgramGenerator();
const chatResponseGenerator = new ChatResponseGenerator();
const imageLocationGenerator = new ImageLocationGenerator();

///////////////////////////////////

app.post('/ai-generation', [validateFieldsAiGeneration, authenticatedUser], async (req, res)=>{
  let rezFinal = '';

  const {generationType, startDate, endDate, city, country, locations, customActivity, selectedActivities, hotelAddress,
    isLocalPlaces, scaleVisit, messagesConversation, tripsData
  } = req.body;

  switch (generationType) {
    case ('generateActivities') : {
      rezFinal = await activityGenerator.generateActivities({city, country});
      break;
    }
    case ('generateLocations') : {
      rezFinal = await locationGenerator.generateLocations(
        {city, country, customActivity, selectedActivities, isLocalPlaces, scaleVisit}
      );
      break;
    }
    case ('generateProgram') : {
      rezFinal = await programGenerator.generateProgram(
        {startDate, endDate, city, country, locations, hotelAddress}
      );
      break;
    }
    case ('generateChatResponse') : {
      rezFinal = await chatResponseGenerator.generateChatResponse({messagesConversation, tripsData});
      break;
    }
  }
  manageResponse(generationType, rezFinal);
  res.send(rezFinal);
});

app.get('/search-destination', async (req, res) => {
  const {input, country, value} = req.query;
  rezFinal = DestinationSearch.getInstance().searchDestination(input, country, value);
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
  manageResponse("send-code-email-verification", result);

  // send the result of the email operation as a response
  res.send(result);
});

app.post('/find-image-location', authenticatedUser, async (req, res) => {
  const base64Image = req.body?.image;
  if (!base64Image) {
    res.send({ isResolved: false, err: 'Please add base64Image' });
    return;
  }
  const imageDetails = await imageLocationGenerator.findLocation(base64Image)
  manageResponse("find-image-location", imageDetails);
  res.send(imageDetails);
})

app.listen(5050, ()=>{
  console.log('express is listening on port 5050')
})
