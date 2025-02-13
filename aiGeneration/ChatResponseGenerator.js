const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');

class ChatResponseGenerator extends OpenaiClient {

  constructor(){
    super();
  }

  /** function that accept or refuze the question */
  async acceptOrRejectQuestion(messagesConversation){
    // prompts and json schema
    let systemPrompt, userPrompt, JsonSchema = '';
    try {
      const prompts = this.promptLoader.getPrompt('chatResponseGenerator').getFunction('acceptOrRejectQuestion');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${messagesConversation}": messagesConversation}
      });
      JsonSchema = z.object({
        response: z.object({
          is_correct_question: z.boolean().describe('true / false')
        })
      })
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_01_C');
    }

    try{
      // Create the request to OpenAI and send the result based on the information received.
      const resultAcceptOrRejectQuestionLlm = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
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
  async generateChatResponse({messagesConversation, tripsData}){
    // prompts and the app manual
    let systemPromptContent = '';
    try{
      const prompts = this.promptLoader.getPrompt('chatResponseGenerator').getFunction('generateChatResponse');
      const appManual = prompts.appManual;
      systemPromptContent = this.promptLoader.replace({
        data: prompts.systemPrompt.content,
        changes: {"${tripsData}": tripsData, "${appManual}": appManual}
      });
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_02_C');
    }

    try{
      let messages = [
        {
          role: 'system',
          content: systemPromptContent,
        }
      ];

      /** create history of conversation */
      messagesConversation.forEach((mes)=>{
        if(mes.type === 'user'){
          messages.push({"role": "user", "content": mes.mes});
        }else if(mes.type === 'ai'){
          messages.push({"role": "assistant", "content": mes.mes});
        }
      });

      /** verify if the question is accepted by our acceptance creteria */
      const rezAcceptRefuze = await this.acceptOrRejectQuestion(messagesConversation);
      if(!rezAcceptRefuze.isResolved || !rezAcceptRefuze.data){
        return  {isResolved: true, data: "Information not available."}
      }

      // get response from chat and send it
      const rez = await this.llmCallChat(messages);
      if(!rez.isResolved) return {isResolved: true, data: "Information not available."}
      return {isResolved: true, data: rez.data}
    }catch(err){
      console.log(err);
      return {isResolved: false, err: err?.message};
    }
  }
}

module.exports = ChatResponseGenerator
