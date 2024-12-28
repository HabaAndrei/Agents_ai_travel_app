require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });
const { zodResponseFormat } = require("openai/helpers/zod");
const  z = require("zod");

class ApiComplentionActivities {

  constructor(objectWithVariables){
    const {city, country} = objectWithVariables;
    this.city = city;
    this.country = country;
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

  // get specific parameter for location
  async paramsAboutLocation(){
    try{
      const textPromptSystem = `
        \n Task: You are an expert in location approximation. Your task is to receive a location and return two pieces of information in JSON format.
        \n Task desctiption:
        \n 1. Determine whether the given location offers both local places (places known only to local residents) and popular tourist spots.
          Return true if the location has both local and tourist attractions.
          Return false if it offers only one category (either local or tourist spots).
        \n 2. On a scale of 1 to 3, assess how many places are available to visit in that location.
      `;
      const textPromptUser = 'Location: ' + this.city + '  from  ' + this.country;
      const JsonSchema = z.object({
        response: z.object({
          data: z.object({
            local_places_and_tourist_places: z.boolean(),
            scale_visit: z.number()
          })
        })
      })
      const resultParamsAboutLocationLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);

      // If the request to OpenAI fails, I will call the function again
      if(!resultParamsAboutLocationLlm.isResolved){
        return this.paramsAboutLocation();
      }
      return {isResolved: true, data: resultParamsAboutLocationLlm?.data?.data};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }

  async createActivities(){
    try{
      const textPromptSystem = `
        \n Task: You receive a location as input and return a JSON with various activities available in that location, specific in that location.
          For each activity, there should be locations where it can be done. If the location is not in that area, do not include that activity.
          Generate only activities that are specific to that location, not from the surrounding areas
        \n Note: Answer as general as possible, not specic, let it be like a category.
      `;
      const textPromptUser = 'Location: ' + this.city + '  from  ' + this.country;
      const JsonSchema = z.object({
        response: z.object({
          activities: z.array(z.string()).describe('Here should be the activities I can do in that location, e.g., [Sport, History, Wellness, etc.]')
        })
      });

      // create request to open ai to recive activities
      const resultCreateActivitiesLlm = await this.LlmCallWithZodResponseFormat(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultCreateActivitiesLlm.isResolved){
        return this.createActivities();
      }
      let resultActivities = resultCreateActivitiesLlm.data;

      // get parameters for locations
      const paramsLocation = await this.paramsAboutLocation();
      return paramsLocation.isResolved ? {isResolved: true, data: resultActivities, paramsLocation} : {isResolved: true, data: resultActivities};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = { ApiComplentionActivities }