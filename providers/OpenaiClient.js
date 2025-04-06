const  OpenAI = require('openai');
const { zodResponseFormat } = require("openai/helpers/zod");
const ConfigLoader = require('../model/ConfigLoader.js');
const PromptLoader = require('../prompts/PromptLoader.js');
const EnvConfig = require('./EnvConfig.js');

const openai_client = new OpenAI({ apiKey: EnvConfig.getInstance().get('API_KEY_OPENAI') });

const loader = new ConfigLoader();

/** base class for particular instances of LLM clients */
class OpenaiClient {

  constructor(){
    this.promptLoader = new PromptLoader();
  }

  async retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema}){
    if( typeof(systemPrompt) != 'string' ) systemPrompt = JSON.stringify(systemPrompt);
    if( typeof(userPrompt) != 'string' ) userPrompt = JSON.stringify(userPrompt);
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

  async llImageDetails({prompt, base64Image, details}){

    // details => low / high
    if (!details) details = "low";

    try {
      const response = await openai_client.responses.create({
        model: loader.get('ai_model_image'),
        input: [{
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt
            },
            {
              type: "input_image",
              image_url: base64Image,
              detail: details,
            },
          ],
        }],
      });
      return {isResolved: true, data: response?.output_text};
    }catch (err) {
      console.log('COD_03 => ', {err});
      return {isResolved: false, err};
    }
  }

}

module.exports = OpenaiClient;
