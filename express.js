const express = require('express');
const app = express();
const cors = require('cors')
const {ApiComplentionProgram} = require('./apiComplentionProgram.js');
const {ApiComplentionChat} = require('./apiComplentionChat.js');
const {ApiComplentionLocations} = require('./apiComplentionLocations.js');
const {ApiComplentionActivities} = require('./apiComplentionActivities.js');
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
    const api = new ApiComplentionLocations({method, city, country, input, checkbox, isLocalPlaces, scaleVisit});
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
