require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI} = process.env;
const openai_client = new OpenAI({ apiKey: API_KEY_OPENAI });
const { zodResponseFormat } = require("openai/helpers/zod");

// base class for particular instances of LLM clients
class OpenaiClient {

  async retryLlmCallWithSchema(systemPrompt, userPrompt, JsonSchema){
    let count = 0;
    let isResolved = false;
    let result = '';
    while(count < 3 && !isResolved){
      count+=1;
      if (count > 1) console.log('is calling retryLlmCallWithSchema', {count});
      const data = await this.LlmCompletionWithSchema(systemPrompt, userPrompt, JsonSchema);
      if (data.isResolved) isResolved = true;
      result = data;
    }
    return result;
  }

  // universal function to call open ai with zod response only
  async LlmCompletionWithSchema(systemPrompt, userPrompt, JsonSchema){
    try {
      const completion = await openai_client.chat.completions.create({
        messages: [{
          role: 'system', content:  systemPrompt
        },
        {
          'role': 'user',
          'content': userPrompt
        }],
        model: 'gpt-4o-mini',
        response_format: zodResponseFormat(JsonSchema, "response"),
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

  async LlmCallChat(messages){
    try {
      const completion = await openai_client.chat.completions.create({
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
