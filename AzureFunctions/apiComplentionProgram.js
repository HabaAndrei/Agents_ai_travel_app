require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });
const { zodResponseFormat } = require("openai/helpers/zod");
const  z = require("zod");

class ApiComplentionProgram {

  constructor(objectWithVariables){
    const {from, to, city, country, locations} = objectWithVariables;
    this.from = from;
    this.to = to;
    this.city = city;
    this.country = country;
    this.locations = locations;
    this.countVerificationEfficiencyProgram = 0;
    this.rejectionReasonForEfficiencyVerification = '';
  }

  // universal function to call open ai with zod response only
  async LlmCallWithZodResponseFormat(systemPrompt, userPrompt, Response){
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
        response_format: zodResponseFormat(Response, "response"),
        temperature: 0,
      });

      let result = completion.choices[0]?.message?.content;
      if(typeof result === 'string')result = JSON.parse(result);
      return {isResolved: true, data: result?.response};
    }catch(err){
      console.log({err});
      return {isResolved: false, err};
    }
  }

  // get details for a specific location
  async getDetailsPlace(name, idPlace){
    try{
      const textPromptSystem =  `
        Task: Return information in JSON format about a given location, following this structure.
      `;
      const JsonSchema = z.object({
        response: z.object({
          name: z.string().describe('The name provided in the input'),
          id: z.string().describe('The ID provided in the input'),
          description: z.string().describe('A short description of the location, including historical details, no longer than 30 words'),
          info: z.string().describe('Key details about the location, including guidance on how to purchase tickets (excluding price information), no longer than 30 words'),
        })
      })
      const textPromptUser =  `Location: {name: ${name} id: ${idPlace}}, From ${this.city}, ${this.country}`;
      const resultDetailsPlacesLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
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

  // this function verifies if all places are included in program
  verifyExistenceOfLocationsFromProgram(locations, program){
    try{
      let activities = [];
      program.forEach((dayValues)=>activities = activities.concat(dayValues.activities));
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

  // this function verifies if the program is efficient
  async verifyEfficiencyProgram(program){
    if (typeof program != 'string') program = JSON.stringify(program);
    try {
      this.countVerificationEfficiencyProgram += 1;
      const textPromptSystem =  `
        Task: Your task is to check if the locations are grouped by days based on their proximity.
        The program is a visit intinerary. The visit should be very efficient, in order not to return to the same place several times.
      `;
      const textPromptUser =  `Program: ${program}.`;
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false'),
          reason: z.string().describe('This should contain a reason only if isRespectingTheRules is false; otherwise, it can be an empty string.')
        })
      })
      const resultEfficiencyProgramLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultEfficiencyProgramLlm.isResolved){
        return this.verifyEfficiencyProgram(program);
      }
      let result = resultEfficiencyProgramLlm.data;
      this.rejectionReasonForEfficiencyVerification += result.reason;
      console.log(this.rejectionReasonForEfficiencyVerification, '   rejectionReasonForEfficiencyVerification');
      return {isResolved: true, data: result.isRespectingTheRules};
    }catch(err){
      return {isResolved: false};
    }
  }

  // create program function
  async createProgram(){
    try{

      const nameIndexAddressLocationsAr = this.locations.map((ob, index)=>{
        const {name, address, dataTimeLocation} = ob;
        return {name, address, dataTimeLocation, id: index}
      });

      const nameIndexLocationsAr = this.locations.map((ob, index)=>{
        return {name: ob.name, index}
      });

      // for each location get details
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
      \n Important: Make sure you meet all the requirements above, especially the structure.
      `;
      if(this.rejectionReasonForEfficiencyVerification.length){
        textPromptSystem += `\n Notice: This is the reason why the result wasn t good last time: ${this.rejectionReasonForEfficiencyVerification}.
        \n <<<<<  Don t repet the same mistakes >>>>> `;
      }
      const textPromptUser = `
        This is an array of objects with their IDs << ${nameIndexAddressLocationsArString} >>
        The itinerary should be from the dates ${this.from} to ${this.to}, for ${this.city}, ${this.country}.
      `;

      const   Activities = z.object({
        place: z.string().describe('The name of the place e.g. "The Palm Dubai"'),
        id: z.number().describe('Here, give me the ID that corresponds to the location from the input')
      });
      const Days = z.object({
        day: z.number().describe('The number of the day'),
        title: z.string().describe('Title of the objectives'),
        date: z.string().describe('e.g. "2024-09-15"'),
        activities: z.array(Activities)
      });
      const JsonSchema = z.object({
        response: z.object({
          program: z.array(Days)
        })
      });

      // create the program
      const resultProgramLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultProgramLlm.isResolved){
        return this.createProgram();
      }
      let contentProgram = resultProgramLlm.data;
      const {program} = contentProgram;

      const verificationExistenceOfLocationsFromProgram = this.verifyExistenceOfLocationsFromProgram(nameIndexLocationsAr, program);
      const {isResolved, existAllLocations} = verificationExistenceOfLocationsFromProgram
      if(isResolved && !existAllLocations){
        console.log('doesnt exist all locations and we are call the function again');
        return this.createProgram();
      }

      // verify efficiency of program
      const verificationEfficiencyProgram = await this.verifyEfficiencyProgram(program)
      console.log({verificationEfficiencyProgram})
      console.log(verificationEfficiencyProgram.data, ' isRespectingTheRulesEfficiencyProgram')
      if(verificationEfficiencyProgram?.isResolved && !verificationEfficiencyProgram?.data && this.countVerificationEfficiencyProgram < 3){
        console.log('is executing again: ', this.countVerificationEfficiencyProgram);
        return this.createProgram();
      }

      // add the schedule/operating hours of the locations
      for(let dayProgram of program){
        const activitiesWithProgram = dayProgram.activities.map((ob)=>{
          const {arrayProgramPlace, dataTimeLocation} = this.locations[ob.id];
          return {place: ob.place, program: arrayProgramPlace, id: ob.id, dataTimeLocation};
        })
        dayProgram.activities = activitiesWithProgram;
      }

      // For each day, add the time to visit the attractions.
      ///////////////////////////////////////////////////////////////////////////////////
      const arrayPromisesProgramDay = program.map((dayProgram)=>{
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

      for(let day of program){
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

  // order location for each day
  async completionProgramDay(date, activities, day){
    try{
      let textPromptSystem = '';
      if(activities.length === 1){
        textPromptSystem = `
          \n Objective: You are a specialist in optimizing travel itineraries based on location schedules.
          \n Task: Provide me with the location and time as shown in the example below, so that I can visit the location and make a decision based on the schedule.
          \n Restrictions:
            Do not add any extra locations to the schedule. Only use the provided location, and avoid modifying it.
          `;
      }else{
        textPromptSystem = `
          \n Task: You receive a day itinerary with multiple tourist locations and your job is to organize these locations into a one-day schedule.
          \n << Considerations for time at the location: The time I should arrive at the location will be estimated based on the time it takes to get there when it's open, the time I want to spend visiting, and the time lost in traffic during the journey. >>
          \n Restrictions:
              Only use the provided list of locations, and avoid modifying them.
              The order of locations in the schedule should be calculated efficiently, and the next location should always be the one closest to the current location.          >>
          \n At the end, please check to ensure that all the requirements have been met.
        `;
      }
      const JsonSchema = z.object({
        response: z.object({
          program: z.array(
            z.object({
              time: z.string().describe('e.g. 10:00'),
              id: z.string('').describe('The ID associated with the location in the input'),
              place: z.string('').describe('The name of the location in the input')
            }).describe('If you receive just one activity, do not generate any additional activities. Create the program using only that one activity.')
          )
        })
      })
      const textPromptUser = `This is the date: ${date}, and this is the itinerary I want to create in the format from the system role example above: ${JSON.stringify(activities)},
        for ${this.city}, ${this.country}.`;

      const resultCompletionProgramDayLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultCompletionProgramDayLlm.isResolved){
        return this.completionProgramDay(date, activities, day);
      }
      let program = resultCompletionProgramDayLlm?.data?.program;

      // if the generated program does not have all activities, it will execute again the funtion
      if(program.length != activities.length){
        return this.completionProgramDay(date, activities, day)
      }

      // verify efficiency of program
      const resultVerifyProgramDay = await this.verifyEfficiencyProgramDay(program);
      const isRespectingTheRulesEfficiencyProgramDay = resultVerifyProgramDay.data.isRespectingTheRules;
      if(resultVerifyProgramDay?.isResolved && !isRespectingTheRulesEfficiencyProgramDay){
        return this.completionProgramDay(date, activities, day);
      }

      return {isResolved: true, data: {activities: program, day}}
    }catch(err){
      console.log('err at completionProgramDay', err)
      return {isResolved: false, err: err?.message};
    }
  }

  async verifyEfficiencyProgramDay(program){
    try{
      const textPromptSystem = `Task: Your task is to verify whether the day program is efficient and avoids returning to the same place multiple times.`;
      const textPromptUser = 'Verify this program: ' + JSON.stringify(program);
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false')
        })
      })
      const resultVerifyProgramDayLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultVerifyProgramDayLlm.isResolved){
        return this.verifyEfficiencyProgramDay(activities, program);
      }
      let result = resultVerifyProgramDayLlm.data;
      return {isResolved: true, data: result};
    }catch(err){
      return {isResolved: false};
    }
  }

}

module.exports = { ApiComplentionProgram }
