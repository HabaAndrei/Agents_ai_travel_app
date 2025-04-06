const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');

class ImageLocationGenerator extends OpenaiClient {

  constructor(){
    super();
  }

  async structureDescription(details){
    // Here we receive details as a string and structure them for easier processing.
    const prompts = this.promptLoader.getPrompt('imageLocationGenerator').getFunction('structureDescription');
    const systemPrompt = prompts.systemPrompt.content;
    const userPrompt = this.promptLoader.replace({
      data: prompts.userPrompt.content,
      changes: {"${details}": details}
    });
    const JsonSchema = z.object({
      response: z.object({
        isFoundPlace: z.boolean().describe('Indicates whether the place is found in the description (true/false).'),
        city: z.string().optional().describe('The city mentioned in the description, if available.'),
        country: z.string().optional().describe('The country mentioned in the description, if available.'),
        place: z.string().optional().describe('The name of the place if mentioned in the description.'),
        description: z.string().optional().describe('A short description of the place. Leave it empty if the place is not found.'),
      }),
    });
    // return the result
    const structuredDescription = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
    if (!structuredDescription.isResolved) return {isResolved: false, err: structuredDescription.err};
    return {isResolved: true, data: structuredDescription.data}
  }

  async getImageDetails(base64Image){

    // get description of the image
    const prompt = this.promptLoader.getPrompt('imageLocationGenerator').getFunction('getImageDetails')?.prompt;
    const detailsImage = await this.llImageDetails({prompt, base64Image, details: "low"});
    if (!detailsImage.isResolved) return {isResolved: false, err: detailsImage.err};

    // structure details
    const details = detailsImage.data;
    const structuredDescription = await this.structureDescription(details);
    if (!structuredDescription.isResolved) return {isResolved: false, err: structuredDescription.err};
    return {isResolved: true, data: structuredDescription.data }
  }

  async findLocation(base64Image){
    const details = await this.getImageDetails(base64Image);
    return details;
  }


}

module.exports = ImageLocationGenerator;