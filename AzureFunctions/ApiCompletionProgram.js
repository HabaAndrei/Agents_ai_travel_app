const OpenaiClient = require('./OpenaiClient');
const Firebase = require('./Firebase');
const  z = require("zod");
const {setDoc, getDoc, doc} = require("firebase/firestore");

class ApiCompletionProgram extends OpenaiClient {

  constructor(objectWithVariables){
    super();
    const {from, to, city, country, locations, hotelAddress} = objectWithVariables;
    this.from = from;
    this.to = to;
    this.city = city;
    this.country = country;
    this.locations = locations;
    this.hotelAddress = hotelAddress;
    this.countVerificationEfficiencyProgram = 0;
    this.rejectionReasonForEfficiencyVerification = '';
    this.firebaseInstance = new Firebase();
  }

  // get details for a specific location
  async getDetailsPlace(name, id, place_id){
    const db = this.firebaseInstance.db;
    try{
      // If the place already exists in the database, I send the data from the database
      const docRef = doc(db, "details_places", place_id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {isResolved: true, ...data, id};
      }

      // prompts and json schema
      const textPromptSystem =  `
        Task: Return information in JSON format about a given location, following this structure.
      `;
      const JsonSchema = z.object({
        response: z.object({
          description: z.string().describe('A short description of the location, including historical details, no longer than 30 words'),
          info: z.string().describe('Key details about the location, including guidance on how to purchase tickets (excluding price information), no longer than 30 words'),
        })
      })
      const textPromptUser =  `Location: {name: ${name}, From ${this.city}, ${this.country}`;

      // Create the request to OpenAI
      const resultDetailsPlacesLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultDetailsPlacesLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultDetailsPlacesLlm.data;
      // store data into db
      setDoc(doc(db, "details_places", place_id), result)
      // send the result based on the information received.
      return {isResolved: true, ...result, id};
    }catch(err){
      console.log(err);
      return {isResolved: false};
    }
  }

  // this function verifies if all places are included in program
  verifyExistenceOfLocationsFromProgram(locations, program){
    try{
      // create an array with all activities (activities are like locations)
      let activities = [];
      program.forEach((dayValues)=>activities = activities.concat(dayValues.activities));
      // if the lengths are not the same return the result
      if (locations.length != activities.length) return {isResolved: true, existAllLocations: false}

      // Verify if all locations are included based on the indexes of locations and the IDs of activities.
      locations.forEach((location)=>{
        const {index} = location;
        const indexActivity = activities.findIndex((activity)=>activity.id === index);
        if (indexActivity < 0) return;
        // get out the activity from array
        activities.splice(indexActivity, 1);
      })

      // If the activities still exist, return the result.
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
      // prompts and json schema
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
      // Create the request to OpenAI and send the result based on the information received.
      const resultEfficiencyProgramLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultEfficiencyProgramLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultEfficiencyProgramLlm.data;
      // Store the reason to create the best prompt for the next call if the result is falsy.
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

      // array of locations with name, address and dataTimeLocation
      const nameIndexAddressLocationsAr = this.locations.map((ob, index)=>{
        const {name, address, dataTimeLocation} = ob;
        return {name, address, dataTimeLocation, id: index}
      });

      // array of locations with name and index
      const nameIndexLocationsAr = this.locations.map((location, index)=>{
        return {name: location.name, index}
      });

      // for each location get details
      const arrayPromisesDetails = this.locations.map((location, index)=>{
        return this.getDetailsPlace(location.name, index, location.place_id);
      })
      const rezArrayPromisesDetails = await Promise.all(arrayPromisesDetails);
      // populate the main locations with details like description and info
      rezArrayPromisesDetails.forEach((ob)=>{
        if(!ob.isResolved)return;
        this.locations[ob.id].description = ob.description;
        this.locations[ob.id].info = ob.info;
      })

      // prompts and json schem to create the program
      const nameIndexAddressLocationsArString = JSON.stringify(nameIndexAddressLocationsAr);
      let textPromptSystem = `
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
      let textPromptUser = `
        This is an array of objects with their IDs << ${nameIndexAddressLocationsArString} >>
        The itinerary should be from the dates ${this.from} to ${this.to}, for ${this.city}, ${this.country}.
      `;
      if ( this.hotelAddress ) textPromptUser += `This is the hotel's address: ${this.hotelAddress}`;

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
      const resultProgramLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultProgramLlm.isResolved){
        return {isResolved: false, err: resultProgramLlm?.err};
      }
      let contentProgram = resultProgramLlm.data;
      const {program} = contentProgram;

      // verify if exist all locations in program
      const verificationExistenceOfLocationsFromProgram = this.verifyExistenceOfLocationsFromProgram(nameIndexLocationsAr, program);
      const {isResolved, existAllLocations} = verificationExistenceOfLocationsFromProgram
      if(isResolved && !existAllLocations){
        console.log('doesnt exist all locations and we are call the function again');
        return this.createProgram();
      }

      // verify efficiency of program
      const verificationEfficiencyProgram = await this.verifyEfficiencyProgram(program)
      console.log(verificationEfficiencyProgram.data, ' isRespectingTheRulesEfficiencyProgram')
      // If the program's efficiency is not good, call the function again, but no more than twice.
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

      // For each day of data (where I structure the activities per day).
      for(let day of dataFromRezPromisesProgramDay){
        // for each activity of day
        for(let activity of day.activities){
          // Populate each activity with all the details about it.
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

      // Update the day for each day of the main program.
      for(let day of program){
        const activities = dataFromRezPromisesProgramDay.find((ob)=>{
          if(ob.day === day.day)return ob?.activities;
        })
        day.activities = activities?.activities;
      }
      // send the result to client
      return {isResolved: true, data: program};
    }catch(err){
      console.log('err at create Program', err);
      return {isResolved: false, err: err?.message};
    }
  }

  // order location for each day
  async completionProgramDay(date, activities, day){
    try{
      // prompts and json schema
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
      let textPromptUser = `This is the date: ${date}, and this is the itinerary I want to create in the format from the system role example above: ${JSON.stringify(activities)},
        for ${this.city}, ${this.country}.`;
      if ( this.hotelAddress ) textPromptUser += `This is the hotel's address: ${this.hotelAddress}`;

      const resultCompletionProgramDayLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultCompletionProgramDayLlm.isResolved){
        return {isResolved: false, err: resultCompletionProgramDayLlm?.err};
      }
      let program = resultCompletionProgramDayLlm?.data?.program;

      // if the generated program does not have all activities, it will execute again the funtion
      if(program.length != activities.length){
        return this.completionProgramDay(date, activities, day)
      }

      // verify efficiency of program
      const resultVerifyProgramDay = await this.verifyEfficiencyProgramDay(program);
      const isRespectingTheRulesEfficiencyProgramDay = resultVerifyProgramDay.data.isRespectingTheRules;
      // If the result doesn't respect the rules, call the function again.
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
      // prompts and json schema
      const textPromptSystem = `Task: Your task is to verify whether the day program is efficient and avoids returning to the same place multiple times.`;
      const textPromptUser = 'Verify this program: ' + JSON.stringify(program);
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false')
        })
      })
      const resultVerifyProgramDayLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultVerifyProgramDayLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultVerifyProgramDayLlm.data;
      return {isResolved: true, data: result};
    }catch(err){
      return {isResolved: false};
    }
  }

}

module.exports = { ApiCompletionProgram }
