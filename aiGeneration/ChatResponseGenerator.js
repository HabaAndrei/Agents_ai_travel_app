const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');
const prompts = require('../config/prompts/chatResponseGenerator.json');

class ChatResponseGenerator extends OpenaiClient {

  /** function that accept or refuze the question */
  async acceptOrRejectQuestion(historyConv){
    try{
      if(typeof(historyConv) != 'string')historyConv = JSON.stringify(historyConv);
      // prompts and json schema
      const systemPrompt = prompts.acceptOrRejectQuestion.systemPrompt.content;
      const userPrompt = prompts.acceptOrRejectQuestion.userPrompt.content.replaceAll("${historyConv}", historyConv);
      const JsonSchema = z.object({
        response: z.object({
          is_correct_question: z.boolean().describe('true / false')
        })
      })
      // Create the request to OpenAI and send the result based on the information received.
      const resultAcceptOrRejectQuestionLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
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

  /** the main function */
  async generateChatResponse({historyConv, tripsData}){
    try{
      // prompts and the app manual
      const appManual = JSON.stringify(prompts.generateChatResponse.appManual);
      if ( typeof(appManual) != 'string' ) appManual = JSON.stringify(appManual);
      if ( typeof(appManual) != 'string' ) tripsData = JSON.stringify(tripsData);
      const systemPromptContent = JSON.stringify(prompts.generateChatResponse.systemPrompt.content)
        .replaceAll("${tripsData}", tripsData).replaceAll("${appManual}", appManual);

      let messages = [
        {
          role: 'system',
          content: systemPromptContent,
        }
      ];

      /** create history of conversation */
      historyConv.forEach((mes)=>{
        if(mes.type === 'user'){
          messages.push({"role": "user", "content": mes.mes});
        }else if(mes.type === 'ai'){
          messages.push({"role": "assistant", "content": mes.mes});
        }
      });

      /** verify if the question is accepted by our acceptance creteria */
      const rezAcceptRefuze = await this.acceptOrRejectQuestion(historyConv);
      if(!rezAcceptRefuze.isResolved || !rezAcceptRefuze.data){
        return  {isResolved: true, data: "Information not available."}
      }

      // get response from chat and send it
      const rez = await this.llmCallChat(messages);
      if(!rez.isResolved) return {isResolved: true, data: "Information not available."}
      return {isResolved: true, data: rez.data}
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = { ChatResponseGenerator }
