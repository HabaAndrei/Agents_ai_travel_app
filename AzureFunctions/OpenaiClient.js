require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });
const { zodResponseFormat } = require("openai/helpers/zod");
const  z = require("zod");

class OpenaiClient {

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

  async LlmCallCompletion(messages){
    try {
      const completion = await openai.chat.completions.create({
        messages: messages,
        model: 'gpt-4o-mini',
        temperature: 0,
      });
      let rez = completion.choices[0]?.message?.content;
      return {isResolved: true, data: rez};
    }catch(err){
      console.log({err});
      return {isResolved: false, err};
    }
  }

}

module.exports = OpenaiClient
