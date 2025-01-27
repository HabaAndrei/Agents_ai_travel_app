/** getter */
class ConfigLoader {
  #config;

  constructor(){
    this.#config = require('../config/ai_config.json');
  }

  get(key){
    return this.#config[key];
  }
}

module.exports = ConfigLoader
