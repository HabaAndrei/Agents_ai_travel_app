const OpenaiClient = require('../providers/OpenaiClient');
const z = require("zod");
const {setDoc, getDoc, doc} = require("firebase/firestore");

class ProgramGenerator extends OpenaiClient {

  /** get details for a specific location */
  async getDetailsPlace({name, id, place_id, city, country}){
    // If the place already exists in the database, I send the data from the database
    const docRef = doc(this.db, "details_places", place_id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {isResolved: true, ...data, id};
    }

    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      /** prompts and json schema */
      const prompts = this.promptLoader.getPrompt('programGenerator').getFunction('getDetailsPlace');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${name}": name, "${city}": city, "${country}": country}
      });

      JsonSchema = z.object({
        response: z.object({
          description: z.string().describe('A short description of the location, including historical details, no longer than 30 words'),
          info: z.string().describe('Key details about the location, including guidance on how to purchase tickets (excluding price information), no longer than 30 words'),
        })
      })
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_01_P');
    }

    try{
      /** Create the request to OpenAI */
      const resultDetailsPlacesLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
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

    // prompts and json schema
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      const prompts = this.promptLoader.getPrompt('programGenerator').getFunction('verifyEfficiencyProgram');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${program}": program}
      });

      JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false'),
          reason: z.string().describe('This should contain a reason only if isRespectingTheRules is false; otherwise, it can be an empty string.')
        })
      })
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_02_P');
    }

    try {
      /** Create the request to OpenAI and send the result based on the information received. */
      const resultEfficiencyProgramLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultEfficiencyProgramLlm.isResolved){
        return {isResolved: false};
      }
      let result = resultEfficiencyProgramLlm.data;
      /** Store the reason to create the best prompt for the next call if the result is falsy. */
      console.log(result?.reason, '   rejectionReasonForEfficiencyVerification');
      return {isResolved: true, data: result.isRespectingTheRules, reason: result?.reason ? result?.reason : ''};
    }catch(err){
      return {isResolved: false};
    }
  }

  async retryGenerateProgram({systemPrompt, userPrompt, JsonSchema, nameIndexLocationsAr}){
    let count = 0;
    let isRespectingTheRules = false;
    let isAllLocations = false
    let resultProgram = '';
    let rejectionReasonForEfficiencyVerification = '';

    while ((count < 4) && (!isRespectingTheRules || !isAllLocations )) {
      count += 1;

      // add in system prompt the rejection reason
      if(rejectionReasonForEfficiencyVerification.length){
        systemPrompt += this.promptLoader.replace({
          data: prompts.systemPrompt.contentRejectionReason,
          changes: {"${rejectionReasonForEfficiencyVerification}": rejectionReasonForEfficiencyVerification}
        });
      }

      // create the program
      const resultProgramLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultProgramLlm.isResolved){
        return {isResolved: false, err: resultProgramLlm?.err};
      }
      let contentProgram = resultProgramLlm.data;
      resultProgram = contentProgram.program;

      /** verify if exist all locations in program */
      const verificationExistenceOfLocationsFromProgram = this.verifyExistenceOfLocationsFromProgram({location: nameIndexLocationsAr, program: resultProgram});
      const {isResolved, existAllLocations} = verificationExistenceOfLocationsFromProgram
      if(isResolved && !existAllLocations){
        console.log('doesnt exist all locations and we are call the function again');
        isAllLocations = false;
        continue;
      }else{
        isAllLocations = true;
      }

      /** verify efficiency of program */
      const verificationEfficiencyProgram = await this.verifyEfficiencyProgram(resultProgram)
      console.log(verificationEfficiencyProgram.data, ' <<<== isRespectingTheRulesEfficiencyProgram')
      // If the program's efficiency is not good, call the function again, but no more than twice.
      if(verificationEfficiencyProgram?.isResolved && !verificationEfficiencyProgram?.data){
        isRespectingTheRules = false;
        rejectionReasonForEfficiencyVerification += verificationEfficiencyProgram.reason;
      }else{
        isRespectingTheRules = true;
      }
    }

    return resultProgram;
  }

  /** create program function */
  async generateProgram({startDate, endDate, city, country, locations, hotelAddress}){

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

    let rezArrayPromisesDetails;
    try{
      rezArrayPromisesDetails = await Promise.all(arrayPromisesDetails);
      /** populate the main locations with details like description and info */
      rezArrayPromisesDetails.forEach((ob)=>{
        if(!ob.isResolved)return;
        locations[ob.id].description = ob.description;
        locations[ob.id].info = ob.info;
      })
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
    const nameIndexAddressLocationsArString = JSON.stringify(nameIndexAddressLocationsAr);

    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      /** prompts and json schem to create the program */
      const prompts = this.promptLoader.getPrompt('programGenerator').getFunction('generateProgram');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {
          "${nameIndexAddressLocationsArString}": nameIndexAddressLocationsArString,
          "${startDate}": startDate,
          "${endDate}": endDate,
          "${city}": city,
          "${country}": country
        }
      });

      if ( hotelAddress ) {
        userPrompt += this.promptLoader.replace({
          data: prompts.userPrompt.contentHotelAddress,
          changes: {"${hotelAddress}": hotelAddress}
        });
      }

      const Activities = z.object({
        place: z.string().describe('The name of the place e.g. "The Palm Dubai"'),
        id: z.number().describe('Here, give me the ID that corresponds to the location from the input')
      });
      const Days = z.object({
        day: z.number().describe('The number of the day'),
        title: z.string().describe('Title of the objectives'),
        date: z.string().describe('e.g. "2024-09-15"'),
        activities: z.array(Activities)
      });
      JsonSchema = z.object({
        response: z.object({
          program: z.array(Days)
        })
      });
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_03_P');
    }

    try{
      /** create the program */
      const program = await this.retryGenerateProgram({systemPrompt, userPrompt, JsonSchema, nameIndexLocationsAr});

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

  async retryGenerateProgramDay({systemPrompt, userPrompt, JsonSchema, activities}){
    let count = 0;
    let isRespectingTheRules = false;
    let program = '';

    while ((count < 4) && !isRespectingTheRules) {
      count += 1;
      const resultCompletionProgramDayLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      program = resultCompletionProgramDayLlm?.data?.program;
      // if the generated program does not have all activities, it will execute again the funtion
      if(program.length != activities.length){
        continue;
      }

      /** verify efficiency of program */
      const resultVerifyProgramDay = await this.verifyEfficiencyProgramDay(program);
      const isRespectingTheRulesEfficiencyProgramDay = resultVerifyProgramDay.data.isRespectingTheRules;

      // If the result respect the rules
      if (resultVerifyProgramDay?.isResolved && isRespectingTheRulesEfficiencyProgramDay) isRespectingTheRules = true;
    }
    return program;
  }

  /** order location for each day */
  async generateProgramDay({date, activities, day, city, country, hotelAddress}){
    // prompts and json schema
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      const prompts = this.promptLoader.getPrompt('programGenerator').getFunction('generateProgramDay');
      systemPrompt = "";
      if(activities.length === 1){
        systemPrompt = JSON.stringify(prompts.systemPrompt.contentSingle);
      }else{
        systemPrompt = JSON.stringify(prompts.systemPrompt.contentMultiple);
      }

      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {
          "${date}": date,
          "${activities}": activities,
          "${city}": city,
          "${country}": country
        }
      });
      if ( hotelAddress ) {
        userPrompt += this.promptLoader.replace({
          data: prompts.userPrompt.contentHotelAddress,
          changes: {"${hotelAddress}": hotelAddress}
        });
      };

      JsonSchema = z.object({
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
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_04_P');
    }

    try{
      const program = await this.retryGenerateProgramDay({systemPrompt, userPrompt, JsonSchema, activities});
      return {isResolved: true, data: {activities: program, day}}
    }catch(err){
      console.log('err at completionProgramDay', err)
      return {isResolved: false, err: err?.message};
    }
  }

  async verifyEfficiencyProgramDay(program){
    if ( typeof(program) != 'string' ) program = JSON.stringify(program);
    // prompts and json schema
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      const prompts = this.promptLoader.getPrompt('programGenerator').getFunction('verifyEfficiencyProgramDay');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${program}": program}
      });

      JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false')
        })
      })
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_05_P');
    }

    try{
      const resultVerifyProgramDayLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
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
