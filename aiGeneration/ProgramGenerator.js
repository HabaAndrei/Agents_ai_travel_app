const OpenaiClient = require('../providers/OpenaiClient');
const z = require("zod");
const {setDoc, getDoc, doc} = require("firebase/firestore");
const propmts = require('../prompts/programGenerator.json');

class ProgramGenerator extends OpenaiClient {

  /** get details for a specific location */
  async getDetailsPlace({name, id, place_id, city, country}){
    try{
      // If the place already exists in the database, I send the data from the database
      const docRef = doc(this.db, "details_places", place_id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {isResolved: true, ...data, id};
      }

      /** prompts and json schema */
      const systemPrompt = propmts.getDetailsPlace.systemPrompt.content;
      const userPrompt =  propmts.getDetailsPlace.userPrompt.content
        .replaceAll("${name}", name).replaceAll("${city}", city).replaceAll("${country}", country);

      const JsonSchema = z.object({
        response: z.object({
          description: z.string().describe('A short description of the location, including historical details, no longer than 30 words'),
          info: z.string().describe('Key details about the location, including guidance on how to purchase tickets (excluding price information), no longer than 30 words'),
        })
      })

      /** Create the request to OpenAI */
      const resultDetailsPlacesLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultDetailsPlacesLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultDetailsPlacesLlm.data;
      // store data into db
      setDoc(doc(this.db, "details_places", place_id), result)
      // send the result based on the information received.
      return {isResolved: true, ...result, id};
    }catch(err){
      console.log(err);
      return {isResolved: false};
    }
  }

  /** this function verifies if all places are included in program */
  verifyExistenceOfLocationsFromProgram({locations, program}){
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

  /** this function verifies if the program is efficient */
  async verifyEfficiencyProgram(program){
    if (typeof program != 'string') program = JSON.stringify(program);
    try {
      // prompts and json schema
      this.countVerificationEfficiencyProgram += 1;
      const systemPrompt =  propmts.verifyEfficiencyProgram.systemPrompt.content;
      const userPrompt =  propmts.verifyEfficiencyProgram.userPrompt.content.replace("${program}", program);
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false'),
          reason: z.string().describe('This should contain a reason only if isRespectingTheRules is false; otherwise, it can be an empty string.')
        })
      })
      /** Create the request to OpenAI and send the result based on the information received. */
      const resultEfficiencyProgramLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultEfficiencyProgramLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultEfficiencyProgramLlm.data;
      /** Store the reason to create the best prompt for the next call if the result is falsy. */
      this.rejectionReasonForEfficiencyVerification += result.reason;
      console.log(this.rejectionReasonForEfficiencyVerification, '   rejectionReasonForEfficiencyVerification');
      return {isResolved: true, data: result.isRespectingTheRules};
    }catch(err){
      return {isResolved: false};
    }
  }

  /** create program function */
  async generateProgram({startDate, endDate, city, country, locations, hotelAddress, isCalledFirstTime}){

    if ( isCalledFirstTime ) {
      this.countVerificationEfficiencyProgram = 0;
      this.rejectionReasonForEfficiencyVerification = '';
    }

    try{
      // array of locations with name, address and dataTimeLocation
      const nameIndexAddressLocationsAr = locations.map((ob, index)=>{
        const {name, address, dataTimeLocation} = ob;
        return {name, address, dataTimeLocation, id: index}
      });

      /** array of locations with name and index */
      const nameIndexLocationsAr = locations.map((_location, index)=>{
        return {name: _location.name, index}
      });

      /** for each location get details */
      const arrayPromisesDetails = locations.map((_location, index)=>{
        return this.getDetailsPlace({
          name: _location.name,
          id: index,
          place_id: _location.place_id,
          city, country
        })
      })
      const rezArrayPromisesDetails = await Promise.all(arrayPromisesDetails);
      /** populate the main locations with details like description and info */
      rezArrayPromisesDetails.forEach((ob)=>{
        if(!ob.isResolved)return;
        locations[ob.id].description = ob.description;
        locations[ob.id].info = ob.info;
      })

      /** prompts and json schem to create the program */
      const nameIndexAddressLocationsArString = JSON.stringify(nameIndexAddressLocationsAr);
      let systemPrompt = JSON.stringify(propmts.generateProgram.systemPrompt.content);
      if(this.rejectionReasonForEfficiencyVerification.length){
        systemPrompt += JSON.stringify(propmts.generateProgram.systemPrompt.contentRejectionReason)
          .replaceAll("${this.rejectionReasonForEfficiencyVerification}", this.rejectionReasonForEfficiencyVerification);
      }

      let userPrompt = propmts.generateProgram.userPrompt.content
      .replaceAll("${nameIndexAddressLocationsArString}", nameIndexAddressLocationsArString)
      .replaceAll("${startDate}", startDate)
      .replaceAll("${endDate}", endDate)
      .replaceAll("${city}", city)
      .replaceAll("${country}", country)

      if ( hotelAddress ) userPrompt += propmts.generateProgram.userPrompt.contentHotelAddress.replaceAll("${hotelAddress}", hotelAddress);

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

      /** create the program */
      const resultProgramLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultProgramLlm.isResolved){
        return {isResolved: false, err: resultProgramLlm?.err};
      }
      let contentProgram = resultProgramLlm.data;
      const {program} = contentProgram;

      /** verify if exist all locations in program */
      const verificationExistenceOfLocationsFromProgram = this.verifyExistenceOfLocationsFromProgram({location: nameIndexLocationsAr, program});
      const {isResolved, existAllLocations} = verificationExistenceOfLocationsFromProgram
      if(isResolved && !existAllLocations){
        console.log('doesnt exist all locations and we are call the function again');
        return this.generateProgram({startDate, endDate, city, country, locations, hotelAddress, isCalledFirstTime: false});
      }

      /** verify efficiency of program */
      const verificationEfficiencyProgram = await this.verifyEfficiencyProgram(program)
      console.log(verificationEfficiencyProgram.data, ' isRespectingTheRulesEfficiencyProgram')
      // If the program's efficiency is not good, call the function again, but no more than twice.
      if(verificationEfficiencyProgram?.isResolved && !verificationEfficiencyProgram?.data && this.countVerificationEfficiencyProgram < 3){
        console.log('is executing again: ', this.countVerificationEfficiencyProgram);
        return this.generateProgram({startDate, endDate, city, country, locations, hotelAddress, isCalledFirstTime: false});
      }

      /** add the schedule/operating hours of the locations */
      for(let dayProgram of program){
        const activitiesWithProgram = dayProgram.activities.map((ob)=>{
          const {arrayProgramPlace, dataTimeLocation} = locations[ob.id];
          return {place: ob.place, program: arrayProgramPlace, id: ob.id, dataTimeLocation};
        })
        dayProgram.activities = activitiesWithProgram;
      }

      /** For each day, add the time to visit the attractions. */
      ///////////////////////////////////////////////////////////////////////////////////
      const arrayPromisesProgramDay = program.map((dayProgram)=>{
        return this.generateProgramDay({
          date: dayProgram.date,
          activities: dayProgram.activities,
          day: dayProgram.day,
          city, country, hotelAddress
        })
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
          /** Populate each activity with all the details about it. */
          const {address, urlLocation, geometry_location, place_id, website, arrayWithLinkImages, dataTimeLocation, description, info}  = locations[activity.id];
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
      /** send the result to client */
      return {isResolved: true, data: program};
    }catch(err){
      console.log('err at create Program', err);
      return {isResolved: false, err: err?.message};
    }
  }

  /** order location for each day */
  async generateProgramDay({date, activities, day, city, country, hotelAddress}){
    try{
      // prompts and json schema
      let systemPrompt = '';
      if(activities.length === 1){
        systemPrompt = JSON.stringify(propmts.generateProgramDay.systemPrompt.contentSingle);
      }else{
        systemPrompt = JSON.stringify(propmts.generateProgramDay.systemPrompt.contentMultiple);
      }

      let userPrompt = propmts.generateProgramDay.userPrompt.content
        .replaceAll("${date}", date)
        .replaceAll("${activities}", JSON.stringify(activities))
        .replaceAll("${city}", city)
        .replaceAll("${country}", country)

      if ( hotelAddress ) userPrompt += propmts.generateProgramDay.userPrompt.contentHotelAddress.replaceAll("${hotelAddress}", hotelAddress);

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

      const resultCompletionProgramDayLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultCompletionProgramDayLlm.isResolved){
        return {isResolved: false, err: resultCompletionProgramDayLlm?.err};
      }
      let program = resultCompletionProgramDayLlm?.data?.program;

      // if the generated program does not have all activities, it will execute again the funtion
      if(program.length != activities.length){
        return this.generateProgramDay({date, activities, day, city, country, hotelAddress})
      }

      /** verify efficiency of program */
      const resultVerifyProgramDay = await this.verifyEfficiencyProgramDay(program);
      const isRespectingTheRulesEfficiencyProgramDay = resultVerifyProgramDay.data.isRespectingTheRules;
      /** If the result doesn't respect the rules, call the function again. */
      if(resultVerifyProgramDay?.isResolved && !isRespectingTheRulesEfficiencyProgramDay){
        return this.generateProgramDay({date, activities, day, city, country, hotelAddress});
      }

      return {isResolved: true, data: {activities: program, day}}
    }catch(err){
      console.log('err at completionProgramDay', err)
      return {isResolved: false, err: err?.message};
    }
  }

  async verifyEfficiencyProgramDay(program){
    if ( typeof(program) != 'string' ) program = JSON.stringify(program);
    try{
      // prompts and json schema
      const systemPrompt = propmts.verifyEfficiencyProgramDay.systemPrompt.content;
      const userPrompt =  propmts.verifyEfficiencyProgramDay.userPrompt.content.replace("${program}", program);
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false')
        })
      })
      const resultVerifyProgramDayLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
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

module.exports = ProgramGenerator
