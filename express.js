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


  if(method === 'createProgram'){
    const api = new ApiCompletionProgram({from, to, city, country, locations});
    const result = await api.createProgram();
    rezFinal = result;
  }

  if(method === 'seeAllPlaces'){
    const api = new ApiCompletionLocations({city, country, input, checkbox, isLocalPlaces, scaleVisit});
    const result = await api.getAllPlacesAboutLocations();
    rezFinal = result;
  }

  if(method === 'createActivities'){
    const api = new ApiCompletionActivities({city, country});
    const result = await api.createActivities();
    rezFinal = result;
  }

  if(method === 'chat'){
    const api = new ApiCompletionChat({histoyConv, information});
    const result = await api.responseQuestion();
    rezFinal = result;
  }

  if(method === 'searchDestination'){
    rezFinal = searchDestination(input, country, value);
  }

  res.send(rezFinal);
})

app.listen(5050, ()=>{
  console.log('express in listening on port 5050')
})
