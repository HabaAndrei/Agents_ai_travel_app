const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');

class ActivityGenerator extends OpenaiClient {

  /** get specific parameter for location */
  async getParamsAboutLocation({city, country}){
    try{
      // prompts and json schema
      const prompts = this.promptLoader.getPrompt('activityGenerator').getFunction('getParamsAboutLocation');
      const systemPrompt = prompts.systemPrompt.content;
      const userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${city}": city, "${country}": country}
      });
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
      console.log(err);
      return {isResolved: false, err: err?.message};
    }
  }

  /** this function create activities based on the location recived */
  async generateActivities({city, country}){
    try{
      // prompts and json schema
      const prompts = this.promptLoader.getPrompt('activityGenerator').getFunction('generateActivities');
      const systemPrompt = prompts.systemPrompt.content;
      const userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${city}": city, "${country}": country}
      });
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
      const paramsLocation = await this.getParamsAboutLocation({city, country});
      return paramsLocation.isResolved ? {isResolved: true, data: resultActivities, paramsLocation} : {isResolved: true, data: resultActivities};
    }catch(err){
      console.log(err);
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports =  ActivityGenerator