require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai_client = new OpenAI({ apiKey: API_KEY_OPENAI });
const { zodResponseFormat } = require("openai/helpers/zod");
const ConfigLoader = require('../model/ConfigLoader.js');


const loader = new ConfigLoader();

/** base class for particular instances of LLM clients */
class OpenaiClient {

  async retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema}){
    let failedLLMCalls = 0;
    let result;
    while(failedLLMCalls < 3){
      if (failedLLMCalls > 1) console.log('retrying LLM call ... #', {failedLLMCalls});
      const data = await this.llmCompletionWithSchema({systemPrompt, userPrompt, JsonSchema});
      result = data;
      if (data.isResolved) return data;
      failedLLMCalls += 1;
    };
    return result;
  }

  /** universal function to call open ai with zod response only */
  async llmCompletionWithSchema({systemPrompt, userPrompt, JsonSchema}){
    try {
      const completion = await openai_client.chat.completions.create({
        messages: [
          {
            role: 'system', content:  systemPrompt
          },
          {
            'role': 'user',
            'content': userPrompt
          }
        ],
        model: loader.get('ai_model'),
        response_format: zodResponseFormat(JsonSchema, "response"),
        temperature: 0,
      });

      let result = completion.choices[0]?.message?.content;
      if(typeof result === 'string')result = JSON.parse(result);
      return {isResolved: true, data: result?.response};
    }catch(err){
      console.log('COD_01 => ', {err});
      return {isResolved: false, err};
    }
  }

  async llmCallChat(messages){
    try {
      const completion = await openai_client.chat.completions.create({
        messages: messages,
        model: loader.get('ai_model'),
        temperature: 0,
      });
      let rez = completion.choices[0]?.message?.content;
      return {isResolved: true, data: rez};
    }catch(err){
      console.log('COD_02 => ', {err});
      return {isResolved: false, err};
    }
  }

}

module.exports = OpenaiClient;
