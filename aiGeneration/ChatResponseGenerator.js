const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');

class ChatResponseGenerator extends OpenaiClient {

  /** function that accept or refuze the question */
  async acceptOrRejectQuestion(historyConv){
    try{
      // prompts and json schema
      const prompts = this.promptLoader.getPrompt('chatResponseGenerator').getFunction('acceptOrRejectQuestion');
      const systemPrompt = prompts.systemPrompt.content;
      const userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${historyConv}": historyConv}
      });
      const JsonSchema = z.object({
        response: z.object({
          is_correct_question: z.boolean().describe('true / false')
        })
      })
      // Create the request to OpenAI and send the result based on the information received.
      const resultAcceptOrRejectQuestionLlm = await OpenaiClient.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultAcceptOrRejectQuestionLlm.isResolved){
        return {isResolved: false, err: resultAcceptOrRejectQuestionLlm?.err};
      }
      let resultContent = resultAcceptOrRejectQuestionLlm.data;
      const data = resultContent?.is_correct_question;
      return {isResolved: true, data};
    }catch(err){
      console.log(err);
      return {isResolved: false, err: err?.message};
    }
  }

  /** the main function */
  async generateChatResponse({historyConv, tripsData}){
    try{
      // prompts and the app manual
      const prompts = this.promptLoader.getPrompt('chatResponseGenerator').getFunction('generateChatResponse');
      const appManual = prompts.appManual;
      const systemPromptContent = this.promptLoader.replace({
        data: prompts.systemPrompt.content,
        changes: {"${tripsData}": tripsData, "${appManual}": appManual}
      });
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
      const rez = await OpenaiClient.llmCallChat(messages);
      if(!rez.isResolved) return {isResolved: true, data: "Information not available."}
      return {isResolved: true, data: rez.data}
    }catch(err){
      console.log(err);
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = ChatResponseGenerator
