const  z = require("zod");
const OpenaiClient = require('./OpenaiClient');

class ApiCompletionChat extends OpenaiClient {

  constructor(objectWithVariables){
    super();
    const {histoyConv, information} = objectWithVariables;
    this.histoyConv = histoyConv;
    this.information = information;
  }

  // function that accept or refuze the question
  async acceptOrRejectQuestion(historyConv){
    try{
      if(typeof(historyConv) != 'string')historyConv = JSON.stringify(historyConv);
      // prompts and json schema
      const textPromptSystem = `
        \n Task: Check text follws rules: 1. No harm/violence 2. No illegal acts  4. SFW content  5. No PII  6. No unauthorized access
        7. Banned topics:  - Violence  - Illegal acts  - Hate speech  - Private data  - Hacking  - Fraud
      `;
      const textPromptUser = `The history of conversation: ${historyConv}.`;
      const JsonSchema = z.object({
        response: z.object({
          is_correct_question: z.boolean().describe('true / false')
        })
      })
      // Create the request to OpenAI and send the result based on the information received.
      const resultAcceptOrRejectQuestionLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultAcceptOrRejectQuestionLlm.isResolved){
        return {isResolved: false, err: resultAcceptOrRejectQuestionLlm?.err};
      }
      let resultContent = resultAcceptOrRejectQuestionLlm.data;
      const data = resultContent?.is_correct_question;
      return {isResolved: true, data};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }

  // the main function
  async responseQuestion(){
    try{
      // prompts and the app manual
      const appManual = `
        Travel App Manual  -  Pages Overview
        1. My Trips
        Here, you can view details about your trips. You can edit them or even add your own custom locations.
        2. New Trip
        Step 1:
        - Plan your trip by selecting your location.
        - Start by choosing the country, then the city.
        - Add activities you want to do.
        - Finally, click on the "Create Locations" button.
        Step 2:
        - Select your desired locations.
        - You can view photos of the locations to help with your choices.
        Step 3:
        - A daily schedule will be generated for you.
        - You can save it, discard it, regenerate a new one, or edit it as you wish.
        3. Settings
        - You can delete your account or log out.
        - Provide feedback about the app.
        4. Assistant
        - This is a chat feature where you can ask questions about the app’s functionalities and your trips.
        - Start new conversations or delete the ones you no longer need.
        `;

      let messages = [
        {
          role: 'system',
          content: `
            \n Task: You are Eric, the best travel app assistant, for an app that creates the best travel programs to explore a country.
            Your role is to:
            Answer questions about the application's functionalities and features.
            Provide information regarding the user's travel itineraries, locations, programs, and traffic.
            Offer recommendations to ensure a great trip.
            << If a user requests to create a travel program, guide them to use the app's features on the "New Trip" screen by searching for the country and city, selecting activities, and generating recommendations.
            For specific locations, suggest entering all desired places directly into the input field for accurate results.
            >>
            \n Information: Here is the information about trips: ${this.information}
            \n App Manual: Here is the information about the app manual: ${appManual}
          `
        }
      ];

      // create history of conversation
      this.histoyConv.forEach((mes)=>{
        if(mes.type === 'user'){
          messages.push({"role": "user", "content": mes.mes});
        }else if(mes.type === 'ai'){
          messages.push({"role": "assistant", "content": mes.mes});
        }
      });

      // verify if the question is accepted by our acceptance creteria
      const rezAcceptRefuze = await this.acceptOrRejectQuestion(this.histoyConv);
      if(!rezAcceptRefuze.isResolved || !rezAcceptRefuze.data){
        return  {isResolved: true, data: "Information not available."}
      }

      // get response from chat and send it
      const rez = await this.LlmCallChat(messages);
      if(!rez.isResolved) return {isResolved: true, data: "Information not available."}
      return {isResolved: true, data: rez.data}
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = { ApiCompletionChat }
