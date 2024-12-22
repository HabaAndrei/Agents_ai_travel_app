require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });

class ApiComplentionProgram {

  constructor(objectWithVariables){
    const {from, to, city, country, locations} = objectWithVariables;
    this.from = from;
    this.to = to;
    this.city = city;
    this.country = country;
    this.locations = locations;
    this.countVerificationEfficiencyProgram = 0;
  }

  async LlmCallWithJsonResponse(systemPrompt, userPrompt){
    try {
      const completion = await openai.chat.completions.create({
        messages: [{
          role: 'system', content:  systemPrompt
        },
        {
          'role': 'user',
          'content': userPrompt
        }],
        model: 'gpt-4o-mini',
        response_format: { "type": "json_object" },
        temperature: 0,
      });

      let result = completion.choices[0]?.message?.content;
      if(typeof result === 'string')result = JSON.parse(result);
      return {isResolved: true, data: result};
    }catch(err){
      console.log({err});
      return {isResolved: false, err};
    }
  }

  async getDetailsPlace(name, idPlace){
    try{
      const textPromptSystem =  `
        Task: Return information in JSON format about a given location, following this structure:
        {
          "name": "The name provided in the input",
          "id": "The ID provided in the input",
          "description": "A short description of the location, including historical details, no longer than 30 words",
          "info": "Key details about the location, including guidance on how to purchase tickets (excluding price information), no longer than 30 words"
        }
      `;
      const textPromptUser =  `Location: {name: ${name} id: ${idPlace}}, From ${this.city}, ${this.country}`;
      const resultDetailsPlacesLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultDetailsPlacesLlm.isResolved){
        return this.getDetailsPlace(name, idPlace);
      }
      let result = resultDetailsPlacesLlm.data;
      const {description, id, info} = result;
      return {isResolved: true, description, info, id};
    }catch(err){
      console.log(err);
      return {isResolved: false};
    }
  }

  verifyExistenceOfLocationsFromProgram(locations, program){
    try{
      const arrayDays = Object.values(program);
      let activities = [];
      arrayDays.forEach((dayValues)=>activities = activities.concat(dayValues.activities));
      if(locations.length != activities.length)return {isResolved: true, existAllLocations: false}

      locations.forEach((location, i)=>{
        const {index} = location;
        const indexActivity = activities.findIndex((activity)=>activity.id === index);
        if (indexActivity < 0) return;
        activities.splice(indexActivity, 1);
      })
      if(activities.length){
        return {isResolved: true, existAllLocations: false};
      }else{
        return {isResolved: true, existAllLocations: true}
      }
    }catch(err){
      return {isResolved: false, existAllLocations: false};
    }
  }


  async verifyEfficiencyProgram(program){
    if (typeof program != 'string') program = JSON.stringify(program);
    try {
      this.countVerificationEfficiencyProgram += 1;
      const textPromptSystem =  `
        \n Task: Your task is to check if the locations are grouped by days based on their proximity.
        The program is a visit intinerary. The visit should be very efficient, in order not to return to the same place several times.
        \n Response: the response should be in json format:
          { isRespectingTheRules: true / false }
       `;
      const textPromptUser =  `Program: ${program}.`;
      const resultEfficiencyProgramLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultEfficiencyProgramLlm.isResolved){
        return this.verifyEfficiencyProgram(program);
      }
      let result = resultEfficiencyProgramLlm.data;
      return {isResolved: true, data: result};
    }catch(err){
      return {isResolved: false};
    }
  }

  async createProgram(){
    try{

      const nameIndexAddressLocationsAr = this.locations.map((ob, index)=>{
        return {name: ob.name, id: index, address: ob.address}
      });

      const nameIndexLocationsAr = this.locations.map((ob, index)=>{
        return {name: ob.name, index}
      });

      const arrayPromisesDetails = this.locations.map((ob, index)=>{
        return this.getDetailsPlace(ob.name, index);
      })
      const rezArrayPromisesDetails = await Promise.all(arrayPromisesDetails);
      rezArrayPromisesDetails.forEach((ob)=>{
        if(!ob.isResolved)return;
        this.locations[ob.id].description = ob.description;
        this.locations[ob.id].info = ob.info;
      })

      const nameIndexAddressLocationsArString = JSON.stringify(nameIndexAddressLocationsAr);
      const textPromptSystem = `
      \n Objective: You are the best at creating a daily itinerary based on a provided date range and list of locations.
      \n Task: The main task is to group the location daily to be closer to each other, the visit should be very efficient,
        in order not to return to the same place several times.
        If there are fewer activities than days, don t generate my days without activities.
      \n Cosideration: Include all locations received within the date range, even if there are too many locations per day.
      \n Response: The result should be in a valid JSON format. e.g.
        {
          "program": {
            "1": {
              "day": 1,
              "title": "Title of the objectives",
              "date": "2024-09-15",
              "activities": [
                {
                  "place": "The Palm Dubai",
                  "id": "Here, give me the ID that corresponds to the location from the input"
                }
                // Additional activities can go here...
              ]
            },
            "2": {
              "day": 2,
              "title": "Title of the objectives",
              "date": "2024-09-16",
              "activities": [
                {
                  "place": "Another location",
                  "id": "Here, give me the ID that corresponds to the location from the input"
                }
                // Additional activities can go here...
              ]
            }
            // Additional days can go here...
          }
        }
        \n << Important: Make sure you meet all the requirements above, especially the structure. >>
      `;
      const textPromptUser = `
        This is an array of objects with their IDs << ${nameIndexAddressLocationsArString} >>
        The itinerary should be from the dates ${this.from} to ${this.to}, for ${this.city}, ${this.country}.
      `;

      const resultProgramLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultProgramLlm.isResolved){
        return this.createProgram();
      }
      let contentProgram = resultProgramLlm.data;
      const {program} = contentProgram;

      const verificationExistenceOfLocationsFromProgram = this.verifyExistenceOfLocationsFromProgram(nameIndexLocationsAr, program);
      const {isResolved, existAllLocations} = verificationExistenceOfLocationsFromProgram
      if(isResolved && !existAllLocations){
        console.log('doesnt exist all locations and we are call the functio again');
        return this.createProgram();
      }

      const verificationEfficiencyProgram = await this.verifyEfficiencyProgram(program)
      const isRespectingTheRulesEfficiencyProgram = verificationEfficiencyProgram.data.isRespectingTheRules;
      if(verificationEfficiencyProgram?.isResolved && !isRespectingTheRulesEfficiencyProgram && this.countVerificationEfficiencyProgram < 5){
        console.log('is executing again: ', this.countVerificationEfficiencyProgram);
        return this.createProgram();
      }

      // adaug program/orarul de functionalitate ale locatiilor
      for(let key of Object.keys(program)){
        let dayProgram = program[key];
        const activitiesWithProgram = dayProgram.activities.map((ob)=>{
          const {arrayProgramPlace, dataTimeLocation} = this.locations[ob.id];
          return {place: ob.place, program: arrayProgramPlace, id: ob.id, dataTimeLocation};
        })
        program[key].activities = activitiesWithProgram
      }

      // pentru fiecare zi adaug ora la care sa mearga la obiective
      ///////////////////////////////////////////////////////////////////////////////////
      const arrayPromisesProgramDay = Object.values(program).map((dayProgram)=>{
        return this.completionProgramDay(dayProgram.date, dayProgram.activities, dayProgram.day);
      })
      const rezPromisesProgramDay = await Promise.all(arrayPromisesProgramDay);
      let dataFromRezPromisesProgramDay = [];
      rezPromisesProgramDay.forEach((ob)=>{
        if(!ob.isResolved)return;
        dataFromRezPromisesProgramDay.push(ob.data);
      })

      for(let day of dataFromRezPromisesProgramDay){
        for(let activity of day.activities){
          const {address, urlLocation, geometry_location, place_id, website, arrayWithLinkImages, dataTimeLocation, description, info}  = this.locations[activity.id];
          activity.address = address ? address : '';
          activity.urlLocation = urlLocation ? urlLocation : '';
          activity.geometry_location = geometry_location ? geometry_location : '',
          activity.place_id = place_id ? place_id : '';
          activity.website = website ? website : '';
          activity.arrayWithLinkImages = arrayWithLinkImages && arrayWithLinkImages.length > 0 ? arrayWithLinkImages : [];
          activity.description = description ? description : '';
          activity.info = info ? info : '';
          activity.dataTimeLocation = dataTimeLocation ? dataTimeLocation : {}
        }
      }

      for(let day of Object.values(program)){
        const activities = dataFromRezPromisesProgramDay.find((ob)=>{
          if(ob.day === day.day)return ob.activities;
        })
        day.activities = activities.activities;
      }

      this.rezFinal = {isResolved: true, data: program};
      return this.rezFinal
    }catch(err){
      console.log('err at create Program', err);
      this.rezFinal = {isResolved: false, err: err?.message};
      return this.rezFinal
    }
  }


  async completionProgramDay(date, activities, day){
    try{
      let mesContent = '';
      if(activities.length === 1){
        mesContent = `
          \n Objective: You are a specialist in optimizing travel itineraries based on location schedules.
          \n Task: Provide me with the location and time as shown in the example below, so that I can visit the location and make a decision based on the schedule.
          \n Restrictions:
            Do not add any extra locations to the schedule.
            Only use the provided location, and avoid modifying it.
          \n Response: The response should be provided in JSON format, for example:
          {
            program: [
              {
                "time": "10:00",
                "id": The ID associated with the location in the input,
                "place": The name of the location in the input
              }
            ]
          }
        `;
      }else{

        mesContent = `
          \n Objective: You are a specialist in optimizing travel itineraries based on location schedules, visiting hours and time wasted in traffic.
          \n Task: You will receive a day itinerary with multiple tourist locations and your job is to organize these locations into a one-day schedule.
          \n << Considerations for time at the location: The time I should arrive at the location will be estimated based on the time it takes to get there when it's open, the time I want to spend visiting, and the time lost in traffic during the journey. >>
          \n Restrictions:
              Do not add any extra locations to the schedule.
              Only use the provided list of locations, and avoid modifying them.
          \n Response: The response should be provided in JSON format, for example:
          {
            program: [
              {
                "time": "10:00",
                "id": The ID associated with the location in the input,
                "place": The name of the location in the input
              },
              {
                "time": "13:00",
                "id": The ID associated with the location in the input,
                "place": The name of the location in the input
              },
              etc ...
            ]
          }
          \n At the end, please check to ensure that all the requirements have been met.
        `;
      }

      if(typeof(activities) != 'string')activities = JSON.stringify(activities);

      const textPromptSystem = mesContent;
      const textPromptUser = `This is the date: ${date}, and this is the itinerary I want to create in the format from the system role example above: ${activities},
        for ${this.city}, ${this.country}.`;

      const resultCompletionProgramDayLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultCompletionProgramDayLlm.isResolved){
        return this.completionProgramDay(date, activities, day);
      }
      let program = resultCompletionProgramDayLlm.data.program;
      if(typeof(contentDayProgram) === 'string')contentDayProgram = JSON.parse(contentDayProgram);
      return {isResolved: true, data: {activities: program, day}}
    }catch(err){
      console.log('err at completionProgramDay', err)
      return {isResolved: false, err: err?.message};
    }
  }


}

module.exports = { ApiComplentionProgram }
