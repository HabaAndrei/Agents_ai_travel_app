const z = require("zod");
const OpenaiClient = require('./OpenaiClient');

class ActivityGenerator extends OpenaiClient {

  /** get specific parameter for location */
  async paramsAboutLocation({city, country}){
    try{
      // prompts and json schema
      const systemPrompt = `
        \n Task: You are an expert in location approximation. Your task is to receive a location and return two pieces of information in JSON format.
        \n Task desctiption:
        \n 1. Determine whether the given location offers both local places (places known only to local residents) and popular tourist spots.
          Return true if the location has both local and tourist attractions.
          Return false if it offers only one category (either local or tourist spots).
        \n 2. On a scale of 1 to 3, assess how many places are available to visit in that location.
      `;
      const userPrompt = 'Location: ' + city + '  from  ' + country;
      const JsonSchema = z.object({
        response: z.object({
          data: z.object({
            local_places_and_tourist_places: z.boolean(),
            scale_visit: z.number()
          })
        })
      })
      // Create the request to OpenAI and send the result based on the information received.
      const resultParamsAboutLocationLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultParamsAboutLocationLlm.isResolved){
        return {isResolved: false, err: resultParamsAboutLocationLlm?.err};
      }
      return {isResolved: true, data: resultParamsAboutLocationLlm?.data?.data};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }

  /** this function create activities based on the location recived */
  async generateActivities({city, country}){
    try{
      // prompts and json schema
      const systemPrompt = `
        \n Task: You receive a location as input and return a JSON with various activities available for tourists to do, specific to that location.
          For each activity, there should be locations where it can be done. If the location is not in that area, do not include that activity.
          Generate only activities that are specific to that location, not from the surrounding areas
        \n Note: Answer as general as possible, not specic, let it be like a category.
      `;
      const userPrompt = 'Location: ' + city + '  from  ' + country;
      const JsonSchema = z.object({
        response: z.object({
          activities: z.array(z.string()).describe('Here should be the activities I can do in that location, e.g., [Sport, History, Wellness, etc.]')
        })
      });

      // create request to open ai to recive activities
      const resultCreateActivitiesLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultCreateActivitiesLlm.isResolved){
        return {isResolved: false, err: resultCreateActivitiesLlm?.err};
      }
      let resultActivities = resultCreateActivitiesLlm.data;

      /** get parameters for locations */
      const paramsLocation = await this.paramsAboutLocation({city, country});
      return paramsLocation.isResolved ? {isResolved: true, data: resultActivities, paramsLocation} : {isResolved: true, data: resultActivities};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = { ActivityGenerator }
