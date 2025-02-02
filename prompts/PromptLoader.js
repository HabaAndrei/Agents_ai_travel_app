const fs = require('fs');
const path = require('path');

class PromptLoader {
  static #instance;

  constructor () {

    // Singleton feature
    if(PromptLoader.#instance) return PromptLoader.#instance;

    const files = fs.readdirSync(path.join(__dirname, './'));
    for (let file of files) {
      if (!file.endsWith('.json')) continue;
      const fileNameWithoutExtention = file.replace('.json', '');
      const fileData = fs.readFileSync(path.join(__dirname, file), 'utf8');
      this[fileNameWithoutExtention] = JSON.parse(fileData);
    }

    PromptLoader.#instance = this;
  }

  getPrompt(_fileName){
    return {
      getFunction: (_functionName) => {return PromptLoader.#instance[_fileName][_functionName]}
    }
  }

  replace ({data, changes}) {
    if ( typeof data != 'string' ) data = JSON.stringify(data);
    Object.keys(changes).forEach((key)=>{
      let value = changes[key];
      if( typeof value != 'string') value = JSON.stringify(value);
      if( typeof key != 'string') key = JSON.stringify(key);
      data = data.replaceAll(key, value);
    })
    return data;
  }

}
module.exports = PromptLoader;