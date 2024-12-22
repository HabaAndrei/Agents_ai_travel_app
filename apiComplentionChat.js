require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });

class ApiComplentionChat {

  constructor(objectWithVariables){
    const {histoyConv, information} = objectWithVariables;
    this.histoyConv = histoyConv;
    this.information = information;
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

  async acceptOrRejectQuestion(historyConv){
    try{
      if(typeof(historyConv) != 'string')historyConv = JSON.stringify(historyConv);
      const textPromptSystem = `
        \n Task: Check text follws rules: 1. No harm/violence 2. No illegal acts  4. SFW content  5. No PII  6. No unauthorized access
        7. Banned topics:  - Violence  - Illegal acts  - Hate speech  - Private data  - Hacking  - Fraud
        \n Response: The response should be in JSON format, indicating whether the context and question adhere to the rules
        {is_correct_question: true/ false}
      `;
      const textPromptUser = `The history of conversation: ${historyConv}.`
      const resultAcceptOrRejectQuestionLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultAcceptOrRejectQuestionLlm.isResolved){
        return this.acceptOrRejectQuestion(historyConv);
      }
      let resultContent = resultAcceptOrRejectQuestionLlm.data;
      const data = resultContent?.is_correct_question;
      return {isResolved: true, data};
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }

  async responseQuestion(){
    try{
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

      this.histoyConv.forEach((mes)=>{
        if(mes.type === 'user'){
          messages.push({"role": "user", "content": mes.mes});
        }else if(mes.type === 'ai'){
          messages.push({"role": "assistant", "content": mes.mes});
        }
      });

      const rezAcceptRefuze = await this.acceptOrRejectQuestion(this.histoyConv);
      if(!rezAcceptRefuze.isResolved || !rezAcceptRefuze.data){
        return  {isResolved: true, data: "Information not available."}
      }

      const completion = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-4o-mini',
        temperature: 0,
      });

      let rez = completion.choices[0]?.message?.content;
      return {isResolved: true, data: rez}
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = { ApiComplentionChat }
