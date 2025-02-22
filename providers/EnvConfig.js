/** getter with singleton */
class EnvConfig {
    static getInstance(){
        if (!this.instance){
            this.instance = new EnvConfig();
            this.instance.config = require('dotenv').config().parsed;
        }
        return this.instance;
    }

    get(key){
        return this.config[key];
    }

}

module.exports = EnvConfig;