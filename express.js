const express = require('express');
const app = express();
const cors = require('cors')
const {ApiCompletionProgram} = require('./AzureFunctions/ApiCompletionProgram.js');
const {ApiCompletionChat} = require('./AzureFunctions/ApiCompletionChat.js');
const {ApiCompletionLocations} = require('./AzureFunctions/ApiCompletionLocations.js');
const {ApiCompletionActivities} = require('./AzureFunctions/ApiCompletionActivities.js');
const { searchDestination } = require('./AzureFunctions/searchDestination.js')
app.use(cors());
app.use(express.json());

//////////////////////////////////////////////////////////////////////////////////////////

app.post('/apiCallAi', async (req, res)=>{

  const {method} = req.query;
  let rezFinal = '';

  const {from, to, city, country, locations, input, checkbox, isLocalPlaces,
    scaleVisit, histoyConv, information, value} = req.body;

  switch (method) {
    case ('createProgram') : {
      const api = new ApiCompletionProgram({from, to, city, country, locations});
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
      const api = new ApiCompletionChat({histoyConv, information});
      rezFinal = await api.responseQuestion();
      break;
    }
    case ('searchDestination') : {
      rezFinal = searchDestination(input, country, value);
      break;
    }
  }
  res.send(rezFinal);
})

app.listen(5050, ()=>{
  console.log('express in listening on port 5050')
})
