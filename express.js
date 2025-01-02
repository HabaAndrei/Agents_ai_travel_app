const express = require('express');
const app = express();
const cors = require('cors')
const {ApiComplentionProgram} = require('./AzureFunctions/ApiComplentionProgram.js');
const {ApiComplentionChat} = require('./AzureFunctions/ApiComplentionChat.js');
const {ApiComplentionLocations} = require('./AzureFunctions/ApiComplentionLocations.js');
const {ApiComplentionActivities} = require('./AzureFunctions/ApiComplentionActivities.js');
app.use(cors());
app.use(express.json());

//////////////////////////////////////////////////////////////////////////////////////////

app.post('/apiCallAi', async (req, res)=>{

  const {method} = req.query;
  let rezFinal = '';

  const {from, to, city, country, locations, input, checkbox, isLocalPlaces,
    scaleVisit, histoyConv, information} = req.body;

  if(method === 'createProgram'){
    const api = new ApiComplentionProgram({from, to, city, country, locations});
    const result = await api.createProgram();
    rezFinal = result;
  }

  if(method === 'seeAllPlaces'){
    const api = new ApiComplentionLocations({city, country, input, checkbox, isLocalPlaces, scaleVisit});
    const result = await api.getAllPlacesAboutLocations();
    rezFinal = result;
  }

  if(method === 'createActivities'){
    const api = new ApiComplentionActivities({city, country});
    const result = await api.createActivities();
    rezFinal = result;
  }

  if(method === 'chat'){
    const api = new ApiComplentionChat({histoyConv, information});
    const result = await api.responseQuestion();
    rezFinal = result;
  }

  res.send(rezFinal);
})

app.listen(5050, ()=>{
  console.log('express in listening on port 5050')
})
