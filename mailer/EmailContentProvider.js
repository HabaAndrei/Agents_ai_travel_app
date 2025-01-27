/** getter */
class EmailContentProvider {
    #content;

    constructor(){
        this.#content = require('../config/emails_content.json');
    }

    getContent(key){
        return this.#content[key];
    }
}

module.exports = EmailContentProvider;
